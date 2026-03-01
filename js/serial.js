/**
 * Serial communication via WebUSB for Game Boy Link Cable
 * Supports both old (reconfigurable) and new (GBLink unified) firmware.
 */

const fromHexString = hexString =>
    new Uint8Array(hexString.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

function buf2hex(buffer) {
    return [...new Uint8Array(buffer)].map(x => x.toString(16).padStart(2, '0')).join('');
}

const toHexString = bytes =>
    bytes.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '');

// Check firmware version from USB device descriptor (bcdDevice)
function fwVersionAtLeast(device, minMajor, minMinor, minPatch) {
    if (!device) return false;
    const major = device.deviceVersionMajor || 0;
    const minor = device.deviceVersionMinor || 0;
    const patch = device.deviceVersionSubminor || 0;
    if (major !== minMajor) return major > minMajor;
    if (minor !== minMinor) return minor > minMinor;
    return patch >= minPatch;
}

// --- Old firmware: magic packets ---
const VSWITCH_PREFIX = new Uint8Array([
    0xCA, 0xFE, 0xCA, 0xFE, 0xCA, 0xFE, 0xCA, 0xFE,
    0xCA, 0xFE, 0xCA, 0xFE, 0xCA, 0xFE, 0xCA, 0xFE,
    0xDE, 0xAD, 0xBE, 0xEF, 0xDE, 0xAD, 0xBE, 0xEF,
    0xDE, 0xAD, 0xBE, 0xEF, 0xDE, 0xAD, 0xBE, 0xEF
]);

function buildVswitchPacket(suffix) {
    const packet = new Uint8Array(36);
    packet.set(VSWITCH_PREFIX);
    packet.set(new TextEncoder().encode(suffix), 32);
    return packet;
}

const VSWITCH_5V_PACKET = buildVswitchPacket('V5V0');

const LED_PREFIX = new Uint8Array([
    0xCA, 0xFE, 0xCA, 0xFE, 0xCA, 0xFE, 0xCA, 0xFE,
    0xCA, 0xFE, 0xCA, 0xFE, 0xCA, 0xFE, 0xCA, 0xFE,
    0xDE, 0xAD, 0xBE, 0xEF, 0xDE, 0xAD, 0xBE, 0xEF,
    0xDE, 0xAD, 0xBE, 0xEF, 0xDE, 0xAD, 0xBE, 0xEF,
    0x4C, 0x45, 0x44, 0x53  // "LEDS"
]);

function buildLedPacket(r, g, b, on) {
    const packet = new Uint8Array(40);
    packet.set(LED_PREFIX);
    packet[36] = r;
    packet[37] = g;
    packet[38] = b;
    packet[39] = on ? 1 : 0;
    return packet;
}

// --- New firmware command IDs ---
const GBL_CMD = {
    SET_MODE: 0x00,
    CANCEL: 0x01,
    SET_VOLTAGE_3V3: 0x40,
    SET_VOLTAGE_5V: 0x41,
    SET_LED_COLOR: 0x42,
};

const GBL_MODE = {
    GBA_TRADE_EMU: 0x00,
    GBA_LINK: 0x01,
    GB_LINK: 0x02,
};

class Serial {
    constructor() {
        this.buffer = [];
        this.send_active = false;
        this.isNewFirmware = false;
        this.cmdEpOut = 0;  // Command endpoint (new firmware only)
    }

    async setLed(r, g, b, on = true) {
        if (!this.ready) return false;

        if (this.isNewFirmware) {
            await this.device.transferOut(this.cmdEpOut,
                new Uint8Array([GBL_CMD.SET_LED_COLOR, r, g, b, on ? 1 : 0]));
        } else {
            if (!fwVersionAtLeast(this.device, 1, 0, 6)) return false;
            const packet = buildLedPacket(r, g, b, on);
            await this.device.transferOut(this.epOut, packet);
            try {
                await Promise.race([
                    this.device.transferIn(this.epIn, 64),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 500))
                ]);
            } catch (e) { /* ack timeout is non-fatal */ }
        }
        return true;
    }

    static getPorts() {
        return navigator.usb.getDevices().then(devices => {
            return devices;
        });
    }

    static requestPort() {
        const filters = [
            { 'vendorId': 0x239A }, // Adafruit boards
            { 'vendorId': 0xcafe }, // TinyUSB (old reconfigurable firmware)
            { 'vendorId': 0x2FE3 }, // Zephyr default (new GBLink firmware)
        ];
        return navigator.usb.requestDevice({ 'filters': filters }).then(
            device => {
                return device;
            }
        );
    }

    getEndpoints(interfaces) {
        this.isNewFirmware = (this.device.vendorId === 0x2FE3);

        interfaces.forEach(element => {
            var alternates = element.alternates;
            alternates.forEach(elementalt => {
                if (elementalt.interfaceClass === 0xFF) {
                    this.ifNum = element.interfaceNumber;

                    // Sort endpoints by number for consistent mapping
                    const inEps = elementalt.endpoints
                        .filter(ep => ep.direction === "in")
                        .sort((a, b) => a.endpointNumber - b.endpointNumber);
                    const outEps = elementalt.endpoints
                        .filter(ep => ep.direction === "out")
                        .sort((a, b) => a.endpointNumber - b.endpointNumber);

                    if (this.isNewFirmware && outEps.length >= 2 && inEps.length >= 2) {
                        // New firmware: try both endpoint orderings
                        // We'll use the last endpoints for data I/O (matching old firmware behavior)
                        // and the first endpoints for commands
                        this.cmdEpOut = outEps[0].endpointNumber;
                        this.epOut = outEps[outEps.length - 1].endpointNumber;
                        this.epIn = inEps[inEps.length - 1].endpointNumber;
                        console.log("New firmware: cmd EP" + this.cmdEpOut +
                            ", data EP" + this.epOut + "/" + this.epIn);
                    } else {
                        // Old firmware: single pair of endpoints
                        // Take the last OUT and last IN (same as original behavior)
                        if (outEps.length > 0) this.epOut = outEps[outEps.length - 1].endpointNumber;
                        if (inEps.length > 0) this.epIn = inEps[inEps.length - 1].endpointNumber;
                        console.log("Old firmware: EP" + this.epOut + "/" + this.epIn);
                    }
                }
            })
        })
    }

    async getDevice() {
        let device = null;
        this.ready = false;

        // Clean up any previously paired devices that may be in a stale state
        try {
            const existingDevices = await navigator.usb.getDevices();
            for (const dev of existingDevices) {
                if (dev.opened) {
                    console.log("Found stale device, closing...");
                    try {
                        await dev.close();
                    } catch (e) {
                        console.log("Could not close stale device:", e);
                    }
                }
            }
        } catch (e) {
            console.log("Cleanup error:", e);
        }

        return new Promise((resolve, reject) => {
            Serial.requestPort().then(dev => {
                console.log("Opening device...");
                device = dev;
                this.device = device;
                return dev.open();
            }).then(() => {
                console.log("Resetting device to clear stale state...");
                if (device.reset) {
                    return device.reset().catch(e => {
                        console.warn("Device reset failed, continuing anyway:", e);
                    });
                }
                return Promise.resolve();
            }).then(() => {
                console.log("Selecting configuration");
                return device.selectConfiguration(1);
            }).then(() => {
                console.log("Getting endpoints")
                this.getEndpoints(device.configuration.interfaces);
            }).then(() => {
                console.log("Claiming interface");
                return device.claimInterface(this.ifNum);
            }).then(() => {
                console.log("Select alt interface");
                return device.selectAlternateInterface(this.ifNum, 0);
            }).then(() => {
                if (this.isNewFirmware) {
                    // New firmware: no CDC handshake needed
                    // Set GB Link mode and 5V voltage for Game Boy
                    console.log("New firmware: setting GB Link mode + 5V");
                    return this.device.transferOut(this.cmdEpOut,
                        new Uint8Array([GBL_CMD.SET_MODE, GBL_MODE.GB_LINK])
                    ).then(() => {
                        return this.device.transferOut(this.cmdEpOut,
                            new Uint8Array([GBL_CMD.SET_VOLTAGE_5V])
                        );
                    }).then(() => {
                        // Wait for firmware to initialize GB Link mode (PIO, data handler)
                        return new Promise(resolve => setTimeout(resolve, 500));
                    });
                } else {
                    // Old firmware: CDC handshake + voltage switch via magic packet
                    console.log("Control Transfer Out");
                    return device.controlTransferOut({
                        'requestType': 'class',
                        'recipient': 'interface',
                        'request': 0x22,
                        'value': 0x01,
                        'index': this.ifNum
                    }).then(async () => {
                        if (fwVersionAtLeast(device, 1, 0, 6)) {
                            console.log("Switching to 5V mode for Game Boy");
                            await device.transferOut(this.epOut, VSWITCH_5V_PACKET);
                            try {
                                await device.transferIn(this.epIn, 64);
                            } catch (e) { /* non-fatal */ }
                        }
                    });
                }
            }).then(() => {
                console.log("Ready!");
                this.ready = true;
                this.device = device;
                resolve();
            }).catch(err => {
                console.error("Device connection error:", err);
                reject(err);
            });
        });
    }

    read(num) {
        return new Promise((resolve, reject) => {
            setTimeout(function () {
                reject('Cannot connect to GB Link Cable Adapter. Please reconnect it to the PC.');
            }, 2000);
            this.device.transferIn(this.epIn, num).then(result => {
                resolve(result);
            },
                error => {
                    console.error(error)
                    window.location.reload();
                    reject(error);
                });
        });
    }

    readHex(num) {
        return new Promise((resolve, reject) => {
            this.read(num).then(result => {
                console.log("RES");
                console.log(result.data.buffer);
                resolve(buf2hex(result.data.buffer));
            },
                error => {
                    reject(error);
                })
        });
    }

    readString() {
        this.device.transferIn(this.epIn, 64).then(result => {
            console.log("ReadResult");
            console.log(result);
            let textDecoder = new TextDecoder();
            console.log(textDecoder.decode(result.data));
        },
            error => {
                console.log("ReadError");
                console.log(error);
            })
    }

    sendString(str) {
        return this.send(new TextEncoder('utf-8').encode(str));
    }

    sendHex(str) {
        return this.send(fromHexString(str));
    }

    send(data) {
        return this.device.transferOut(this.epOut, data);
    }

    // Clear the buffer - used for priority commands that need to be sent immediately
    clearBuffer() {
        this.buffer = [];
        this.send_active = false;
        console.log("Buffer cleared for priority command");
    }

    bufSendFunction() {
        this.send_active = true;
        if (this.buffer.length === 0) {
            this.send_active = false;
            return;
        }
        var element = this.buffer.shift();
        var data = element[0];
        var delay = element[1];
        this.send(data).then(() => {
            setTimeout(() => {
                this.bufSendFunction();
            }, delay);
        });
    }

    bufSend(data, delay) {
        this.buffer.push([data, delay]);
        if (!this.send_active) {
            this.bufSendFunction();
        }
    }

    bufSendHex(str, delay) {
        var data = fromHexString(str);
        this.bufSend(data, delay);
    }
}
