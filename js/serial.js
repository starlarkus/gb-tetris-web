/**
 * Serial communication via WebUSB for Game Boy Link Cable
 * Converted from React module to vanilla JavaScript
 */

const fromHexString = hexString =>
    new Uint8Array(hexString.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

function buf2hex(buffer) {
    return [...new Uint8Array(buffer)].map(x => x.toString(16).padStart(2, '0')).join('');
}

const toHexString = bytes =>
    bytes.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '');

class Serial {
    constructor() {
        this.buffer = [];
        this.send_active = false;
    }

    // Clean up any previously paired devices that may be in a stale state
    static async cleanupPreviousDevices() {
        try {
            const devices = await navigator.usb.getDevices();
            for (const device of devices) {
                if (device.opened) {
                    console.log("Found stale device, closing...");
                    try {
                        await device.close();
                    } catch (e) {
                        console.log("Could not close stale device:", e);
                    }
                }
            }
        } catch (e) {
            console.log("Cleanup error:", e);
        }
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
        this.ready = false;

        try {
            // Request a device (shows picker dialog)
            const device = await Serial.requestPort();
            console.log("Opening device...");
            this.device = device;

            // If device was previously opened (stale connection), close it first
            if (device.opened) {
                console.log("Device was previously opened, closing first...");
                try {
                    await device.close();
                } catch (e) {
                    console.log("Close error (ignoring):", e);
                }
            }

            // Open the device fresh
            console.log("Opening device fresh...");
            await device.open();

            // Reset the device to clear any stale state
            console.log("Resetting device...");
            try {
                await device.reset();
            } catch (e) {
                console.log("Reset error (ignoring):", e);
            }

            // Re-open after reset if needed
            if (!device.opened) {
                console.log("Re-opening after reset...");
                await device.open();
            }

            console.log("Selecting configuration");
            await device.selectConfiguration(1);

            console.log("Getting endpoints");
            this.getEndpoints(device.configuration.interfaces);

            console.log("Claiming interface");
            await device.claimInterface(this.ifNum);

            console.log("Select alt interface");
            await device.selectAlternateInterface(this.ifNum, 0);

            console.log("Control Transfer Out");
            await device.controlTransferOut({
                'requestType': 'class',
                'recipient': 'interface',
                'request': 0x22,
                'value': 0x01,
                'index': this.ifNum
            });

            console.log("Ready!");
            this.ready = true;

            // Set up cleanup on page unload
            window.addEventListener('beforeunload', () => {
                this.close();
            });

        } catch (err) {
            console.error("Device connection error:", err);
            throw err;
        }
    }

    // Reset the USB device
    async reset() {
        if (this.device && this.device.opened) {
            try {
                console.log("Resetting device...");
                await this.device.reset();
                console.log("Device reset complete");
            } catch (err) {
                console.error("Reset error:", err);
            }
        }
    }

    // Close and release the USB device
    async close() {
        if (this.device && this.device.opened) {
            try {
                console.log("Closing device...");
                // Release the interface first
                if (this.ifNum !== undefined) {
                    await this.device.releaseInterface(this.ifNum);
                }
                await this.device.close();
                console.log("Device closed");
                this.ready = false;
            } catch (err) {
                console.error("Close error:", err);
            }
        }
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
