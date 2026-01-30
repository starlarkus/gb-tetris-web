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

class Serial {
    constructor() {
        this.buffer = [];
        this.send_active = false;
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
                // Verify reset is available (some browsers/platforms might implement it differently)
                if (device.reset) return device.reset();
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
