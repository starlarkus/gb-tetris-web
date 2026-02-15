/**
 * WebSocket-based serial communication for BGB emulator bridge.
 * Sends high-level JSON commands to the bridge, receives game events back.
 * The bridge handles all BGB byte-level timing internally.
 *
 * For app.js to distinguish BGB mode from WebUSB mode, check:
 *   if (this.serial instanceof WebSocketSerial)
 */

class WebSocketSerial {
    constructor() {
        // Legacy bufSend support (used by some app.js code paths that also run on WebUSB)
        this.buffer = [];
        this.send_active = false;
        this.ws = null;
        this.ready = false;

        // Event callbacks (set by app.js)
        this.onconnected = null;    // bridge probe succeeded
        this.onheight = null;       // height value from Game Boy
        this.onlines = null;        // lines signal from Game Boy
        this.onwin = null;          // Game Boy reports win
        this.onlose = null;         // Game Boy reports lose
        this.onscreenfilled = null; // Game Boy reports screen filled
    }

    async getDevice() {
        const port = prompt("Enter BGB Bridge WebSocket port:", "8767");
        if (!port) throw new Error("Cancelled");

        return new Promise((resolve, reject) => {
            const url = "ws://localhost:" + port;
            this.ws = new WebSocket(url);

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
                this._handleMessage(event.data);
            };
        });
    }

    _handleMessage(data) {
        try {
            const msg = JSON.parse(data);
            switch (msg.event) {
                case 'connected':
                    console.log("Bridge: probe succeeded");
                    if (this.onconnected) this.onconnected();
                    break;
                case 'height':
                    if (this.onheight) this.onheight(msg.value);
                    break;
                case 'lines':
                    if (this.onlines) this.onlines(msg.value);
                    break;
                case 'win':
                    console.log("Bridge: Game Boy reports WIN");
                    if (this.onwin) this.onwin();
                    break;
                case 'lose':
                    console.log("Bridge: Game Boy reports LOSE");
                    if (this.onlose) this.onlose();
                    break;
                case 'screen_filled':
                    console.log("Bridge: screen filled");
                    if (this.onscreenfilled) this.onscreenfilled();
                    break;
                default:
                    console.log("Bridge: unknown event", msg);
            }
        } catch (e) {
            console.error("Bridge message parse error:", e, data);
        }
    }

    // ── JSON command senders ──────────────────────────────────────────

    sendCommand(cmd) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.error("WebSocket not connected");
            return;
        }
        this.ws.send(JSON.stringify(cmd));
    }

    setGame(game) {
        this.sendCommand({ cmd: "set_game", game: game });
    }

    setMusic(musicByte) {
        this.sendCommand({ cmd: "set_music", music: musicByte });
    }

    confirmMusic() {
        this.sendCommand({ cmd: "confirm_music" });
    }

    startGame(garbage, tiles, isFirst) {
        this.sendCommand({
            cmd: "start_game",
            garbage: Array.from(garbage),
            tiles: Array.from(tiles),
            is_first: isFirst
        });
    }

    setHeight(height) {
        this.sendCommand({ cmd: "set_height", value: height });
    }

    queueCommand(value) {
        this.sendCommand({ cmd: "queue_command", value: value });
    }

    // ── Legacy interface stubs ────────────────────────────────────────
    // These exist so app.js code paths that call them don't crash,
    // but in BGB mode the bridge handles all timing internally.

    send(data) {
        // No-op in bridge mode; bridge handles exchanges
        return Promise.resolve();
    }

    sendHex(str) {
        return this.send(fromHexString(str));
    }

    read(num) {
        // No-op in bridge mode; events come via callbacks
        return new Promise((resolve) => {
            // Return empty data immediately
            resolve({ data: new DataView(new ArrayBuffer(0)) });
        });
    }

    readHex(num) {
        return this.read(num).then(result => buf2hex(result.data.buffer));
    }

    clearBuffer() {
        this.buffer = [];
        this.send_active = false;
        console.log("Buffer cleared");
    }

    bufSendFunction() {
        // No-op in bridge mode
        this.send_active = false;
    }

    bufSend(data, delay) {
        // No-op in bridge mode
    }

    bufSendHex(str, delay) {
        // No-op in bridge mode
    }
}
