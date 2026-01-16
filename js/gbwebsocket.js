/**
 * WebSocket communication for GB Tetris multiplayer
 * Converted from React module to vanilla JavaScript
 */

// WebSocket configuration - update these as needed
const WEBSOCKET_HOST = 'tetrisserver.gblink.io';
const WEBSOCKET_PORT = 443;

// Note: fromHexString is already defined in serial.js which loads first

function getWell(hexNum) {
    console.log(hexNum);
    if (hexNum === 0x0c) {
        return 2;
    } else if (hexNum === 0x04 || hexNum === 0x18) {
        return 4;
    } else if (hexNum === 0x00 || hexNum === 0x10) {
        return 6;
    } else if (hexNum === 0x08) {
        return 8;
    } else {
        return 10;
    }
}

class GBWebsocket {
    // Needs to be in sync with server!!!
    GAME_STATE_LOBBY = 0
    GAME_STATE_RUNNING = 1
    GAME_STATE_FINISHED = 2
    GAME_STATE_ERROR = 9998
    GAME_STATE_NONE = 9999

    constructor(url, name) {
        console.log('url', url);
        this.ws = new WebSocket(url);
        this.ws.onmessage = (function (event) {
            console.log(this);
            this.onMessage(event);
        }).bind(this);

        this.onconnected = function (gb) {
            console.log("On connected not implemented");
        }

        this.oninfoupdate = function (gb) {
            console.log("On info update not implemented!");
        }
        this.ongamestart = function (gb) {
            console.log("On game start not implemented!");
        }

        this.ongameupdate = function (gb) {
            console.log("Game update not implemented!");
        }

        this.ongameend = function (gb) {
            console.log("Game end not implemented!");
        }

        this.onuserinfo = function (gb) {
            console.log("User info not implemented!")
        }

        this.onlines = function (gb, lines) {
            console.log("Lines not implemented!")
        }

        this.onwin = function (gb) {
            console.log("Win not implemented!")
        }

        this.onlose = function (gb) {
            console.log("Lose not implemented!")
        }
        console.log(this.ongameupdate);

        this.admin = false;
        this.name = name;
        this.game_name = "YOU SHOULD NEVER SEE THIS";
        this.game_status = this.GAME_STATE_NONE;
        this.users = []
        this.uuid = ""
        this.waitForConnection();
    }

    sendRegisterMessage() {
        this.ws.send(JSON.stringify({
            "type": "register",
            "name": this.name
        }));
    }

    getOtherUsers() {
        var res = this.users.filter(u => u.uuid != this.uuid);
        return res;
    }

    waitForConnection() {
        if (this.ws.readyState === 1) {
            console.log("Connection ready")
            this.sendRegisterMessage();
            this.onconnected(this);
        } else {
            setTimeout(
                this.waitForConnection.bind(this),
                100
            );
        }
    }

    sendLines(lines) {
        this.ws.send(JSON.stringify({
            "type": "lines",
            "lines": lines
        }));
    }

    sendHeight(height) {
        this.ws.send(JSON.stringify({
            "type": "update",
            "height": height
        }));
    }

    sendStart() {
        this.ws.send(JSON.stringify({
            "type": "start"
        }))
    }

    sendDead() {
        this.ws.send(JSON.stringify({
            "type": "dead"
        }))
    }

    sendReached30Lines() {
        this.ws.send(JSON.stringify({
            "type": "reached_30_lines"
        }))
    }

    sendPresetRng(presetRng) {
        var presetRngJson;
        try {
            presetRngJson = JSON.parse(presetRng);
        } catch (e) {
            presetRngJson = {
                "garbage": presetRng,
                "pieces": "",
                "well_column": ""
            }
        }
        var presetRngForServer = JSON.stringify({
            "type": "preset_rng",
            "garbage": presetRngJson.garbage,
            "pieces": presetRngJson.pieces,
            "well_column": presetRngJson.well_column,
        });
        console.log('sending', presetRngForServer)
        this.ws.send(presetRngForServer);
    }

    static initiateGame(name) {
        var gb = new GBWebsocket(`wss://${WEBSOCKET_HOST}:${WEBSOCKET_PORT}/create`, name);
        gb.admin = true;
        return gb;
    }

    static joinGame(name, code) {
        return new GBWebsocket(`wss://${WEBSOCKET_HOST}:${WEBSOCKET_PORT}/join/` + code, name)
    }

    onMessage(event) {
        console.log("onMessage");
        console.log(event);
        console.log("Parsed message:");
        var message = JSON.parse(event.data);
        console.log(message);

        switch (message.type) {
            case "game_info":
                console.log("New game info", message);
                this.game_name = message.name;
                this.game_status = message.state;
                this.users = message.users;
                this.oninfoupdate(this);
                break;
            case "user_info":
                this.uuid = message.uuid;
                this.onuserinfo(this);
                break;
            case "garbage":
                console.log("garbage:")
                console.log(message.garbage);
                this.garbage = fromHexString(String(message.garbage));
                break;
            case "start_game":
                console.log("Game starting!");
                console.log("Tiles:")
                console.log(message.tiles);
                this.tiles = fromHexString(String(message.tiles));
                this.ongamestart(this);
                break;
            case "game_update":
                console.log("Game update!");
                this.ongameupdate(this);
                break;
            case "error":
                console.log("Error!")
                this.state = this.GAME_STATE_ERROR;
                this.ongameupdate(this);
                break;
            case "end":
                console.log("End!")
                this.state = this.GAME_STATE_FINISHED;
                this.ongameend(this);
                break;
            case "lines":
                console.log("Lines")
                this.onlines(this, message.lines);
                break;
            case "win":
                this.onwin(this);
                break;
            case "reached_30_lines":
                this.onlose(this);
                break;
            default:
                console.log("Unknown message");
                console.log(message);
                break;
        }
    }
}
