/**
 * WebSocket-based serial communication for BGB emulator bridge.
 * Drop-in replacement for the Serial class — same interface, but
 * talks to the bridge over a WebSocket instead of WebUSB.
 */

class WebSocketSerial {
    constructor() {
        this.buffer = [];
        this.send_active = false;
        this.ws = null;
        this.ready = false;
        this._pendingRead = null; // {resolve, reject, timer}
        this.receiveBuffer = []; // Buffered incoming bytes (matches USB IN endpoint buffering)
    }

    async getDevice() {
        const port = prompt("Enter BGB Bridge WebSocket port:", "8767");
        if (!port) throw new Error("Cancelled");

        return new Promise((resolve, reject) => {
            const url = "ws://localhost:" + port;
            this.ws = new WebSocket(url);
            this.ws.binaryType = "arraybuffer";

            this.ws.onopen = () => {
                console.log("WebSocket connected to bridge at " + url);
                this.ready = true;
                resolve();
            };

            this.ws.onerror = (e) => {
                console.error("WebSocket error:", e);
                reject(new Error("Could not connect to BGB Bridge at " + url));
            };

            this.ws.onclose = () => {
                console.log("WebSocket closed");
                this.ready = false;
            };

            this.ws.onmessage = (event) => {
                // Buffer all incoming bytes (mirrors USB IN endpoint buffering)
                const incoming = new Uint8Array(event.data);
                for (let i = 0; i < incoming.length; i++) {
                    this.receiveBuffer.push(incoming[i]);
                }
                this._tryResolveRead();
            };
        });
    }

    send(data) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return Promise.reject(new Error("WebSocket not connected"));
        }
        this.ws.send(data);
        return Promise.resolve();
    }

    sendHex(str) {
        return this.send(fromHexString(str));
    }

    read(num) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this._pendingRead = null;
                reject("Cannot connect to BGB Bridge. Please check the bridge is running.");
            }, 2000);
            this._pendingRead = { resolve, reject, timer };
            // If data is already buffered, resolve immediately
            this._tryResolveRead();
        });
    }

    _tryResolveRead() {
        if (this._pendingRead && this.receiveBuffer.length > 0) {
            const pending = this._pendingRead;
            this._pendingRead = null;
            clearTimeout(pending.timer);
            // Drain all buffered bytes into a single response (matches USB transferIn)
            const bytes = new Uint8Array(this.receiveBuffer);
            this.receiveBuffer = [];
            pending.resolve({ data: new DataView(bytes.buffer) });
        }
    }

    readHex(num) {
        return new Promise((resolve, reject) => {
            this.read(num).then(result => {
                resolve(buf2hex(result.data.buffer));
            }, error => {
                reject(error);
            });
        });
    }

    clearBuffer() {
        this.buffer = [];
        this.send_active = false;
        // Also clear any pending read and received data
        if (this._pendingRead) {
            clearTimeout(this._pendingRead.timer);
            this._pendingRead = null;
        }
        this.receiveBuffer = [];
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
