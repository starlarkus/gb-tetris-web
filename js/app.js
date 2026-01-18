/**
 * GB Tetris Web Application
 * Converted from React to vanilla JavaScript
 */

class OnlineTetris {
    // Music codes
    SONG_A = "1C";
    SONG_B = "1D";
    SONG_C = "1E";
    SONG_OFF = "1F";

    // Application states
    StateConnect = "Connect";
    StateConnecting = "Connecting";
    StateConnectingTetris = "ConnectingTetris";
    StateSelectMusic = "SelectMusic";
    StateSelectHandicap = "SelectHandicap";
    StateJoiningGame = "JoiningGame";
    StateLobby = "Lobby";
    StateStartingGame = "StartingGame";
    StateJoinGame = "SelectJoinGame";
    StateInGame = "InGame";
    StateFinished = "StateFinished";
    StateError = "StateError";

    // Player states (sync with server)
    STATE_ALIVE = 0;
    STATE_DEAD = 1;
    STATE_WINNER = 2;

    constructor() {
        this.currentState = this.StateConnect;
        this.music = this.SONG_A;
        this.name = "Foo";
        this.gameCode = "";
        this.users = [];
        this.height = 0;
        this.difficulty = 0;
        this.uuid = "";
        this.isAdmin = false;
        this.serial = null;
        this.gb = null;

        this.init();
    }

    init() {
        // Check for WebUSB support
        if (!navigator.usb) {
            this.showScreen('screen-no-webusb');
            return;
        }

        // Generate random username
        document.getElementById('username').value = this.generateName();

        // Bind event listeners
        this.bindEvents();

        // Show initial screen
        this.updateUI();
    }

    generateName() {
        const prefixes = ["Green", "Yellow", "Red", "Purple", "Blue", "Orange"];
        const suffixes = ["I-Piece", "O-Piece", "T-Piece", "J-Piece", "L-Piece", "S-Piece", "Z-Piece"];
        return prefixes[Math.floor(Math.random() * prefixes.length)] + " " +
            suffixes[Math.floor(Math.random() * suffixes.length)];
    }

    bindEvents() {
        // Connect button
        document.getElementById('btn-connect').addEventListener('click', () => this.handleConnectClick());

        // Music buttons
        document.getElementById('btn-music-a').addEventListener('click', () => this.setMusic(this.SONG_A));
        document.getElementById('btn-music-b').addEventListener('click', () => this.setMusic(this.SONG_B));
        document.getElementById('btn-music-c').addEventListener('click', () => this.setMusic(this.SONG_C));
        document.getElementById('btn-music-off').addEventListener('click', () => this.setMusic(this.SONG_OFF));
        document.getElementById('btn-music-next').addEventListener('click', () => this.handleMusicSelected());

        // Create/Join game buttons
        document.getElementById('btn-create-game').addEventListener('click', () => {
            const name = document.getElementById('username').value;
            this.handleCreateGame(name);
        });
        document.getElementById('btn-join-game').addEventListener('click', () => {
            const name = document.getElementById('username').value;
            const code = document.getElementById('game-code-input').value;
            this.handleJoinGame(name, code);
        });

        // Game code input - Enter key
        document.getElementById('game-code-input').addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                const name = document.getElementById('username').value;
                const code = document.getElementById('game-code-input').value;
                this.handleJoinGame(name, code);
            }
        });

        // Lobby buttons
        document.getElementById('btn-start-game').addEventListener('click', () => this.handleStartGame());
        document.getElementById('btn-send-rng').addEventListener('click', () => {
            const presetRng = document.getElementById('preset-rng').value;
            this.handleSendPresetRng(presetRng);
        });

        // Finished screen - next game button
        document.getElementById('btn-finished-next').addEventListener('click', () => this.handleStartGame());
    }

    // Hide all screens
    hideAllScreens() {
        const screens = document.querySelectorAll('.screen');
        screens.forEach(screen => screen.style.display = 'none');
    }

    // Show a specific screen
    showScreen(screenId) {
        this.hideAllScreens();
        const screen = document.getElementById(screenId);
        if (screen) {
            screen.style.display = 'block';
        }
    }

    // Update UI based on current state
    updateUI() {
        switch (this.currentState) {
            case this.StateConnect:
                this.showScreen('screen-connect');
                break;
            case this.StateConnecting:
                this.showScreen('screen-connecting');
                break;
            case this.StateConnectingTetris:
                this.showScreen('screen-connecting-tetris');
                break;
            case this.StateSelectMusic:
                this.showScreen('screen-music');
                break;
            case this.StateSelectHandicap:
                this.showScreen('screen-select-game');
                break;
            case this.StateJoiningGame:
                this.showScreen('screen-joining');
                break;
            case this.StateLobby:
                this.showScreen('screen-lobby');
                this.updateLobbyUI();
                break;
            case this.StateStartingGame:
                this.showScreen('screen-starting');
                break;
            case this.StateInGame:
                this.showScreen('screen-ingame');
                this.updateInGameUI();
                break;
            case this.StateFinished:
                this.showScreen('screen-finished');
                this.updateFinishedUI();
                break;
            case this.StateError:
                this.showScreen('screen-error');
                break;
            default:
                console.error("Invalid state:", this.currentState);
        }
    }

    // Set state and update UI
    setState(newState) {
        this.currentState = newState;
        this.updateUI();
    }

    // Update lobby display
    updateLobbyUI() {
        document.getElementById('lobby-game-code').textContent = this.gameCode;
        this.renderPlayers('lobby-players', this.users);

        // Show/hide admin controls
        if (this.isAdmin) {
            document.getElementById('lobby-admin-controls').style.display = 'block';
            document.getElementById('lobby-waiting').style.display = 'none';
        } else {
            document.getElementById('lobby-admin-controls').style.display = 'none';
            document.getElementById('lobby-waiting').style.display = 'block';
        }
    }

    updateInGameUI() {
        document.getElementById('ingame-game-code').textContent = this.gameCode;
        this.renderPlayers('ingame-players', this.users);
    }

    updateFinishedUI() {
        document.getElementById('finished-game-code').textContent = this.gameCode;
        this.renderPlayers('finished-players', this.users);
    }

    // Render player cards
    renderPlayers(containerId, users) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';

        users.forEach(user => {
            const playerDiv = document.createElement('div');
            playerDiv.className = 'col-3';

            let imgSrc, statusText;
            if (user.state === this.STATE_ALIVE) {
                imgSrc = 'images/animation.gif';
                statusText = `Height: ${user.height}<br/>Wins: ${user.num_wins}`;
            } else if (user.state === this.STATE_DEAD) {
                imgSrc = 'images/dead.png';
                statusText = `Game Over<br/>Wins: ${user.num_wins}`;
            } else if (user.state === this.STATE_WINNER) {
                imgSrc = 'images/win.png';
                statusText = `Winner!!!<br/>Wins: ${user.num_wins}`;
            } else {
                imgSrc = 'images/animation.gif';
                statusText = `Wins: ${user.num_wins || 0}`;
            }

            playerDiv.innerHTML = `
        <img src="${imgSrc}" class="gameboy" alt="${user.name}" />
        <p>
          <b>${user.name}</b><br/>
          ${statusText}
        </p>
      `;

            container.appendChild(playerDiv);
        });
    }

    // Connection handling
    handleConnectClick() {
        this.serial = new Serial();
        this.setState(this.StateConnecting);

        this.serial.getDevice().then(() => {
            console.log("USB connected, updating status.");
            this.setState(this.StateConnectingTetris);
            this.attemptTetrisConnection();
        }).catch(c => {
            console.log("Connection cancelled or failed");
            this.setState(this.StateConnect);
        });
    }

    attemptTetrisConnection() {
        console.log("Attempt connection...");
        this.serial.sendHex("29");
        this.serial.readHex(64).then(result => {
            if (result === "55") {
                console.log("SUCCESS!");
                this.setState(this.StateSelectMusic);
                this.startMusicTimer();
            } else {
                console.log("Fail");
                setTimeout(() => {
                    this.attemptTetrisConnection();
                }, 100);
            }
        },
            error => {
                this.currentState = this.StateError;
                document.getElementById('error-message').textContent = error;
                this.updateUI();
                console.log("ERROR");
                console.log(error);
            });
    }

    // Music selection
    setMusic(music) {
        this.music = music;
    }

    startMusicTimer() {
        setTimeout(() => {
            console.log("Sending music");
            if (this.currentState === this.StateSelectMusic) {
                console.log("Music sent");
                this.serial.sendHex(this.music);
                this.serial.read(64);
                this.startMusicTimer();
            } else {
                console.log("invalid state");
            }
        }, 100);
    }

    handleMusicSelected() {
        this.serial.sendHex("50");
        this.serial.read(64);
        this.setState(this.StateSelectHandicap);
    }

    // Handicap timer (not heavily used but keeping for compatibility)
    startHandicapTimer() {
        setTimeout(() => {
            console.log("Handicap timer");
            if (this.currentState === this.StateSelectHandicap) {
                console.log("Sending handicap");
                this.serial.sendHex("00");
                this.serial.read(1).then(result => {
                    var selectedDifficulty = result.data.getUint8(0);
                    console.log("Selected difficulty:", selectedDifficulty);
                    this.difficulty = selectedDifficulty;
                    this.startHandicapTimer();
                });
            } else {
                console.log("Invalid state, stopping handicap timer.");
            }
        }, 100);
    }

    // Game creation/joining
    handleCreateGame(name) {
        console.log("Create new game");
        console.log(name);
        this.isAdmin = true;
        this.name = name;
        this.setState(this.StateJoiningGame);
        this.gb = GBWebsocket.initiateGame(name);
        this.setGbCallbacks();
    }

    handleJoinGame(name, gameCode) {
        if (!gameCode || gameCode.length < 1 || gameCode.length > 4) {
            console.error('not a valid input. must have length 1-4');
            return;
        }
        console.log("Join game");
        console.log(name);
        console.log(gameCode);
        this.isAdmin = false;
        this.name = name;
        this.gameCode = gameCode;
        this.setState(this.StateJoiningGame);
        this.gb = GBWebsocket.joinGame(name, gameCode);
        this.setGbCallbacks();
    }

    setGbCallbacks() {
        this.gb.onconnected = this.gbConnected.bind(this);
        this.gb.oninfoupdate = this.gbInfoUpdate.bind(this);
        this.gb.ongamestart = this.gbGameStart.bind(this);
        this.gb.ongameupdate = this.gbGameUpdate.bind(this);
        this.gb.ongameend = this.gbGameEnd.bind(this);
        this.gb.onuserinfo = this.gbUserInfo.bind(this);
        this.gb.onlines = this.gbLines.bind(this);
        this.gb.onwin = this.gbWin.bind(this);
        this.gb.onlose = this.gbLose.bind(this);
        this.gb.onerror = this.gbError.bind(this);
    }

    // WebSocket callbacks
    gbConnected(gb) {
        console.log("We're connected!");
        console.log(gb.users);
        this.gameCode = gb.game_name;
        this.users = gb.users;
        this.setState(this.StateLobby);
    }

    gbInfoUpdate(gb) {
        console.log("Got game update.");
        console.log(gb.users);
        this.gameCode = gb.game_name;
        this.users = gb.users;

        // Check if game ended (status 2 = finished)
        // This handles the case where we didn't receive an explicit win/lose message
        if (gb.game_status === gb.GAME_STATE_FINISHED && this.currentState === this.StateInGame) {
            console.log("Game ended via status update - transitioning to Finished");
            this.setState(this.StateFinished);
        } else {
            this.updateUI();
        }
    }

    gbUserInfo(gb) {
        console.log("userinfo");
        this.uuid = gb.uuid;
    }

    gbError(gb, errorMsg) {
        console.error("Game error:", errorMsg);
        document.getElementById('error-message').textContent = errorMsg;
        this.setState(this.StateError);
    }

    gbGameStart(gb) {
        console.log("Got game start.");

        // Step 1: start game message
        if (this.isFirstGame()) {
            console.log('is first game');
            this.serial.bufSendHex("60", 150);
            this.serial.bufSendHex("29", 4);
        } else {
            console.log('is not first game');
            // begin communication again
            this.serial.bufSendHex("60", 70);
            this.serial.bufSendHex("02", 70);
            this.serial.bufSendHex("02", 70);
            this.serial.bufSendHex("02", 70);
            this.serial.bufSendHex("79", 330);
            // send start
            this.serial.bufSendHex("60", 150);
            this.serial.bufSendHex("29", 70);
        }

        console.log("Sending initial garbage", gb.garbage);
        // Step 3: send initial garbage
        for (var i = 0; i < gb.garbage.length; i++) {
            this.serial.bufSend(new Uint8Array([gb.garbage[i]]), 4);
        }

        // Step 4: send master again
        this.serial.bufSendHex("29", 8);
        console.log("Sending tiles");
        // Step 5: send tiles
        for (var i = 0; i < gb.tiles.length; i++) {
            this.serial.bufSend(new Uint8Array([gb.tiles[i]]), 4);
        }

        // Step 6: and go
        this.serial.bufSendHex("30", 70);
        this.serial.bufSendHex("00", 70);
        this.serial.bufSendHex("02", 70);
        this.serial.bufSendHex("02", 70);
        this.serial.bufSendHex("20", 70);

        // Wait 2 seconds and then start game
        setTimeout(() => {
            this.setState(this.StateInGame);
            this.startGameTimer();
        }, 2000);
    }

    gbGameUpdate(gb) {
        console.log("game update");
    }

    gbGameEnd(gb) {
        console.log("game end");
    }

    gbLines(gb, lines) {
        console.log("lines - clearing buffer for priority");
        this.serial.clearBuffer();
        this.serial.bufSend(new Uint8Array([lines]), 10);
    }

    gbWin(gb) {
        console.log("WIN! - clearing buffer for priority");
        this.serial.clearBuffer();
        this.serial.bufSendHex("AA", 50); // aa indicates BAR FULL
        this.serial.bufSendHex("02", 50);
        this.serial.bufSendHex("02", 50);
        this.serial.bufSendHex("02", 50);
        this.serial.bufSendHex("43", 50); // go to final screen
        this.setState(this.StateFinished);
    }

    gbLose(gb) {
        console.log("LOSE! - clearing buffer for priority");
        this.serial.clearBuffer();
        this.serial.bufSendHex("77", 50); // 77 indicates other player reached 30 lines
        this.serial.bufSendHex("02", 50);
        this.serial.bufSendHex("02", 50);
        this.serial.bufSendHex("02", 50);
        this.serial.bufSendHex("43", 50); // go to final screen
        this.setState(this.StateFinished);
    }

    // Game logic
    isFirstGame() {
        for (var u of this.users) {
            if (u.num_wins > 0) {
                return false;
            }
        }
        return true;
    }

    updateHeight(height) {
        if (this.height !== height) {
            console.log("Height increased!");
            console.log(height);
            this.height = height;
            this.gb.sendHeight(height);
        }
    }

    startGameTimer() {
        setTimeout(() => {
            // Send opponent's max height to Game Boy
            var heights = [0].concat(this.gb.getOtherUsers().map(u => u.height || 0));
            var opponentHeight = Math.max(...heights);
            this.serial.send(new Uint8Array([opponentHeight]));
            this.serial.read(64).then(result => {
                var data = result.data.buffer;
                // Note: data.length is intentionally used (undefined for ArrayBuffer)
                // to match React behavior - ensures we always process the first byte
                if (data.length > 1) {
                    console.log("Data too long");
                    console.log(data.length);
                    // Ignore old data in buffer
                    this.startGameTimer();
                } else {
                    var value = (new Uint8Array(data))[0];
                    if (value < 20) {
                        this.updateHeight(value);
                    } else if ((value >= 0x80) && (value <= 0x85)) { // lines sent
                        console.log("Sending lines!", value.toString(16));
                        this.gb.sendLines(value);
                    } else if (value === 0x77) { // we won by reaching 30 lines
                        console.log("We reached 30 lines - WIN!");
                        this.setState(this.StateFinished);
                        this.gb.sendReached30Lines();
                    } else if (value === 0xaa) { // we lost...
                        console.log("We topped out - LOSE!");
                        this.setState(this.StateFinished);
                        this.gb.sendDead();
                    } else if (value === 0xFF) { // screen is filled after loss
                        this.serial.bufSendHex("43", 10);
                    }
                }
                this.startGameTimer();
            });
        }, 100);
    }

    gbHeight() {
        var heights = [0].concat(this.gb.getOtherUsers().map(u => u.height));
        var maxHeight = Math.max(...heights);
        this.serial.bufSend(new Uint8Array([maxHeight]), 10);
    }

    handleStartGame() {
        this.gb.sendStart();
        this.setState(this.StateStartingGame);
    }

    handleSendPresetRng(presetRng) {
        this.gb.sendPresetRng(presetRng);
    }
}

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new OnlineTetris();
});
