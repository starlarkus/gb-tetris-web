/**
 * Serial communication via WebUSB for Game Boy Link Cable
 * Matches original React implementation exactly
 */

const fromHexString = hexString =>
    new Uint8Array(hexString.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

function buf2hex(buffer) {
    return [...new Uint8Array(buffer)].map(x => x.toString(16).padStart(2, '0')).join('');
}

const toHexString = bytes =>
    bytes.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '');

function fwVersionAtLeast(version, minMajor, minMinor, minPatch) {
    if (!version) return false;
    const parts = version.split('.').map(Number);
    const [major = 0, minor = 0, patch = 0] = parts;
    if (major !== minMajor) return major > minMajor;
    if (minor !== minMinor) return minor > minMinor;
    return patch >= minPatch;
}

// Voltage switch magic packets (36 bytes: 32-byte prefix + 4-byte command)
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

// LED magic packet: 32-byte prefix + "LEDS" + R, G, B, on/off = 40 bytes
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

class Serial {
    constructor() {
        this.buffer = [];
        this.send_active = false;
        this.firmwareVersion = null;
    }

    async setLed(r, g, b, on = true) {
        if (!this.ready || !fwVersionAtLeast(this.firmwareVersion, 1, 0, 6)) return false;
        const packet = buildLedPacket(r, g, b, on);
        await this.device.transferOut(this.epOut, packet);
        try {
            await Promise.race([
                this.device.transferIn(this.epIn, 64),
                new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 500))
            ]);
        } catch (e) { /* ack timeout is non-fatal */ }
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
            { 'vendorId': 0xcafe }, // TinyUSB example
        ];
        return navigator.usb.requestDevice({ 'filters': filters }).then(
            device => {
                return device;
            }
        );
    }

    getEndpoints(interfaces) {
        interfaces.forEach(element => {
            var alternates = element.alternates;
            alternates.forEach(elementalt => {
                if (elementalt.interfaceClass === 0xFF) {
                    console.log("Interface number:");
                    console.log(element.interfaceNumber);
                    this.ifNum = element.interfaceNumber;
                    elementalt.endpoints.forEach(elementendpoint => {
                        if (elementendpoint.direction === "out") {
                            console.log("Endpoint out: ");
                            console.log(elementendpoint.endpointNumber);
                            this.epOut = elementendpoint.endpointNumber;
                        }

                        if (elementendpoint.direction === "in") {
                            console.log("Endpoint in: ");
                            console.log(elementendpoint.endpointNumber);
                            this.epIn = elementendpoint.endpointNumber;
                        }
                    });
                }
            })
        })
    }

    async getDevice() {
        let device = null;
        this.ready = false;

        // Clean up any previously paired devices that may be in a stale state
        // (e.g., from a page refresh without unplugging)
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
                console.log("Control Transfer Out");
                return device.controlTransferOut({
                    'requestType': 'class',
                    'recipient': 'interface',
                    'request': 0x22,
                    'value': 0x01,
                    'index': this.ifNum
                })
            }).then(async () => {
                // Read firmware version string (new firmware sends "GBLINK:x.x.x\n" on connect)
                try {
                    const result = await Promise.race([
                        device.transferIn(this.epIn, 64),
                        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 500))
                    ]);
                    if (result.status === 'ok' && result.data && result.data.byteLength > 0) {
                        const str = new TextDecoder().decode(result.data);
                        if (str.startsWith('GBLINK:')) {
                            this.firmwareVersion = str.trim().substring(7);
                            console.log("Firmware version:", this.firmwareVersion);
                        }
                    }
                } catch (e) {
                    console.log("No firmware version (old firmware)");
                }

                // Switch to 5V mode if firmware supports voltage switching (>= 1.0.6)
                if (fwVersionAtLeast(this.firmwareVersion, 1, 0, 6)) {
                    console.log("Switching to 5V mode for Game Boy");
                    await device.transferOut(this.epOut, VSWITCH_5V_PACKET);
                    // Read ack byte
                    try {
                        await Promise.race([
                            device.transferIn(this.epIn, 64),
                            new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 500))
                        ]);
                    } catch (e) { /* ack timeout is non-fatal */ }
                }

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
        // Also reset send_active so the next bufSend will start a fresh send chain
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
        // Sender is not active, create new one
        if (!this.send_active) {
            this.bufSendFunction();
        }
    }

    bufSendHex(str, delay) {
        var data = fromHexString(str);
        this.bufSend(data, delay);
    }
}
