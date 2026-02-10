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
    StateModeSelect = "ModeSelect";
    StateMatchmaking = "Matchmaking";
    StateOpponentDisconnect = "OpponentDisconnect";

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
        this.isMatchmaking = false;
        this.serial = null;
        this.gb = null;

        // Queue for win/lose commands and 0x43 screen-fill
        this.winLoseQueue = [];
        this.gameLoopActive = false;
        this.gameStarting = false; // True during the 2-second game start sequence
        this.gameStartedAt = 0; // Timestamp when game loop actually started
        this.countdownInterval = null; // Interval for matchmaking countdown display
        this.hasPlayedBefore = false; // Tracks if Game Boy has played a game (survives reconnects)

        this.init();
    }

    init() {
        // Check for WebUSB support
        if (!navigator.usb) {
            this.showScreen('screen-no-webusb');
            return;
        }

        // Load saved username or generate a random one
        var savedName = localStorage.getItem('tetris_username');
        document.getElementById('username').value = savedName || this.generateName();

        // Save username when changed; regenerate random name if blanked out
        document.getElementById('username').addEventListener('change', () => {
            var val = document.getElementById('username').value.trim();
            if (val) {
                localStorage.setItem('tetris_username', val);
            } else {
                localStorage.removeItem('tetris_username');
                document.getElementById('username').value = this.generateName();
            }
        });

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

        // Matchmaking ready-up button
        document.getElementById('btn-ready-next').addEventListener('click', () => this.handleReadyNext());

        // Mode selection buttons
        document.getElementById('btn-find-match').addEventListener('click', () => this.handleFindMatch());
        document.getElementById('btn-private-lobby').addEventListener('click', () => this.handlePrivateLobby());

        // Matchmaking buttons
        document.getElementById('btn-cancel-matchmaking').addEventListener('click', () => this.handleCancelMatchmaking());

        // Opponent disconnect buttons
        document.getElementById('btn-rematch').addEventListener('click', () => this.handleRematch());
        document.getElementById('btn-back-to-menu').addEventListener('click', () => this.handleBackToMenu());

        // Leave lobby buttons (lobby and finished screens)
        document.getElementById('btn-leave-lobby-pre').addEventListener('click', () => this.handleLeaveLobby());
        document.getElementById('btn-leave-lobby').addEventListener('click', () => this.handleLeaveLobby());

        // Reconnect Game Boy button (mode select screen)
        document.getElementById('btn-reinit-gameboy').addEventListener('click', () => this.handleReinitGameboy());
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
            case this.StateModeSelect:
                this.showScreen('screen-mode-select');
                break;
            case this.StateMatchmaking:
                this.showScreen('screen-matchmaking');
                break;
            case this.StateOpponentDisconnect:
                this.showScreen('screen-opponent-disconnect');
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
            document.getElementById('btn-start-game').disabled = this.users.length < 2;
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

        // Clear any previous countdown interval
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }

        document.getElementById('btn-leave-lobby').style.display = 'inline-block';

        if (this.isMatchmaking) {
            // Matchmaking: both players get ready-up controls
            document.getElementById('finished-admin-controls').style.display = 'none';
            document.getElementById('finished-waiting').style.display = 'none';
            document.getElementById('finished-matchmaking-controls').style.display = 'none';

            // Reset ready-up UI state
            document.getElementById('btn-ready-next').disabled = false;
            document.getElementById('btn-ready-next').textContent = 'Start Next Round';
            document.getElementById('finished-countdown').style.display = 'none';
            document.getElementById('finished-ready-status').textContent = '';

            // Show after 5 seconds to let Game Boys stabilize
            setTimeout(() => {
                if (this.currentState === this.StateFinished) {
                    document.getElementById('finished-matchmaking-controls').style.display = 'block';
                }
            }, 5000);
        } else {
            // Private lobby: host-only start (unchanged)
            document.getElementById('finished-matchmaking-controls').style.display = 'none';
            if (this.isAdmin) {
                document.getElementById('finished-admin-controls').style.display = 'none';
                document.getElementById('finished-waiting').textContent = 'Please wait...';
                document.getElementById('finished-waiting').style.display = 'block';

                setTimeout(() => {
                    if (this.currentState === this.StateFinished) {
                        document.getElementById('finished-admin-controls').style.display = 'block';
                        document.getElementById('finished-waiting').style.display = 'none';
                        document.getElementById('btn-finished-next').disabled = this.users.length < 2;
                    }
                }, 5000);
            } else {
                document.getElementById('finished-admin-controls').style.display = 'none';
                document.getElementById('finished-waiting').style.display = 'block';
            }
        }
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
        // If coming from rematch flow, go directly to matchmaking
        if (this.isMatchmaking) {
            this.handleFindMatch();
        } else {
            this.setState(this.StateModeSelect);
        }
    }

    // Mode selection handlers
    handleFindMatch() {
        console.log("Find Match clicked");
        this.isMatchmaking = true;
        this.name = document.getElementById('username')?.value || this.generateName();
        this.setState(this.StateMatchmaking);
        this.gb = GBWebsocket.findMatch(this.name);
        this.setGbCallbacks();
    }

    handlePrivateLobby() {
        console.log("Private Lobby clicked");
        this.isMatchmaking = false;
        this.setState(this.StateSelectHandicap);
    }

    handleCancelMatchmaking() {
        console.log("Cancel matchmaking");
        if (this.gb) {
            this.gb.cancelMatchmaking();
            this.gb = null;
        }
        this.setState(this.StateModeSelect);
    }

    handleRematch() {
        console.log("Rematch - reinitializing Tetris connection");
        // Player has restarted Tetris, need to re-establish connection
        if (this.gb) {
            this.gb._closedByUs = true;
            this.gb.ws.close();
            this.gb = null;
        }
        this.isMatchmaking = true; // Remember we want matchmaking after music
        this.setState(this.StateConnectingTetris);
        this.attemptTetrisConnection();
    }

    handleLeaveLobby() {
        console.log("Leaving lobby");
        if (this.gb) {
            this.gb._closedByUs = true;
            this.gb.ws.close();
            this.gb = null;
        }
        this.gameLoopActive = false;
        this.setState(this.StateModeSelect);
    }

    handleReinitGameboy() {
        console.log("Reconnecting Game Boy");
        this.hasPlayedBefore = false;
        this.setState(this.StateConnectingTetris);
        this.attemptTetrisConnection();
    }

    handleBackToMenu() {
        console.log("Back to menu - reinitializing Tetris connection");
        // Player has restarted Tetris, need to re-establish connection
        if (this.gb) {
            this.gb._closedByUs = true;
            this.gb.ws.close();
            this.gb = null;
        }
        this.isMatchmaking = false;
        this.setState(this.StateConnectingTetris);
        this.attemptTetrisConnection();
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
        this.gb.onmatchfound = this.gbMatchFound.bind(this);
        this.gb.onopponentdisconnect = this.gbOpponentDisconnect.bind(this);
        this.gb.onplayerready = this.gbPlayerReady.bind(this);
        this.gb.oncountdownstarted = this.gbCountdownStarted.bind(this);
    }

    // WebSocket callbacks
    gbConnected(gb) {
        console.log("We're connected!");
        console.log(gb.users);
        this._handlingDisconnect = false;
        // For matchmaking, stay on the "Finding Opponent..." screen
        // until match_found arrives with actual game data
        if (this.isMatchmaking) {
            return;
        }
        this.gameCode = gb.game_name;
        this.users = gb.users;
        this.setState(this.StateLobby);
    }

    gbInfoUpdate(gb) {
        console.log("Got game update.");
        console.log(gb.users);
        this.gameCode = gb.game_name;
        this.users = gb.users;

        // If game is starting, reset heights to 0 (server might have stale data)
        if (this.gameStarting) {
            for (var user of this.users) {
                user.height = 0;
            }
        }

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

    gbMatchFound(gb) {
        console.log("Match found!");
        console.log(gb.users);
        this._handlingDisconnect = false;
        this.gameCode = gb.game_name;
        this.users = gb.users;
        this.isAdmin = gb.admin;
        // Go straight to in-game - matchmaking auto-starts the game
        // The game will start via gbGameStart callback
        this.setState(this.StateLobby);
    }

    gbOpponentDisconnect(gb) {
        // Guard against being called twice (from opponent_disconnect msg AND onclose)
        if (this._handlingDisconnect) return;
        this._handlingDisconnect = true;
        console.log("Opponent disconnected!");
        // Stop game loop FIRST to prevent further WS sends
        this.gameLoopActive = false;

        // Clear any running countdown
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }

        const wasInGame = this.currentState === this.StateInGame;

        // Close the old WebSocket
        if (this.gb) {
            this.gb._closedByUs = true;
            this.gb.ws.close();
            this.gb = null;
        }

        if (!this.isMatchmaking) {
            // Private lobby: just go to finished state
            this.setState(this.StateFinished);
            return;
        }

        // Auto-reconnect for matchmaking
        const reconnect = () => {
            this.setState(this.StateMatchmaking);
            this.gb = GBWebsocket.findMatch(this.name);
            this.setGbCallbacks();
        };

        if (wasInGame) {
            // Mid-game: send win to Game Boy, wait, then reconnect
            setTimeout(() => {
                this.serial.clearBuffer();
                this.serial.bufSendHex("AA", 50);
                this.serial.bufSendHex("02", 50);
                this.serial.bufSendHex("02", 50);
                this.serial.bufSendHex("02", 50);
                this.serial.bufSendHex("43", 50);
            }, 200);
            // Wait 3 seconds for Game Boy to settle on results screen, then reconnect
            setTimeout(reconnect, 3000);
        } else {
            // Between rounds or any other state: Game Boy already on results screen
            reconnect();
        }
    }

    gbGameStart(gb) {
        console.log("Got game start.");

        // Clear any running countdown from ready-up
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }

        // Track that Game Boy has played at least one game (survives matchmaking reconnects)
        this.hasPlayedBefore = true;

        // Store whether a game loop was running (for subsequent rounds)
        const wasLoopRunning = this.gameLoopActive;

        // Clear any leftover commands and stop running loop
        this.winLoseQueue = [];
        this.gameLoopActive = false;
        this.gameStarting = true; // Block lines during game start sequence
        this.height = 0; // Reset our height for new game

        // Reset all users' heights for new game (prevents stale UI data)
        for (var user of this.users) {
            user.height = 0;
        }

        // Switch to in-game UI immediately
        this.setState(this.StateInGame);
        this.updateInGameUI();

        // Tell server our height is 0 so other players see us at 0
        this.gb.sendHeight(0);

        // Helper function to send game start sequence
        const sendGameStartSequence = () => {
            // Clear buffer on subsequent games
            if (wasLoopRunning) {
                this.serial.clearBuffer();
            }

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
                this.gameLoopActive = true;
                this.gameStartedAt = Date.now(); // Track when game started
                this.startGameTimer();

                // Wait an additional 2 seconds before accepting lines/heights
                setTimeout(() => {
                    this.gameStarting = false;
                    console.log("Game start complete, now accepting lines");
                }, 2000);
            }, 2000);
        };

        // If game loop was running, wait for it to stop before sending
        // Otherwise (first game), start immediately like React
        if (wasLoopRunning) {
            setTimeout(sendGameStartSequence, 400);
        } else {
            sendGameStartSequence();
        }
    }

    gbGameUpdate(gb) {
        console.log("game update");
    }

    gbGameEnd(gb) {
        console.log("game end");
    }

    gbLines(gb, lines) {
        // Only process lines if game is actually running and not starting
        // This prevents lines from interfering with game start sequence
        if (this.currentState !== this.StateInGame || this.gameStarting) {
            console.log("Ignoring lines - game not in progress or starting");
            return;
        }
        console.log("lines");
        this.serial.bufSend(new Uint8Array([lines]), 10);
    }

    gbWin(gb) {
        console.log("WIN!");
        // Stop game loop and clear buffer before sending win sequence
        this.gameLoopActive = false;
        setTimeout(() => {
            this.serial.clearBuffer();
            this.serial.bufSendHex("AA", 50); // aa indicates BAR FULL
            this.serial.bufSendHex("02", 50); // finish
            this.serial.bufSendHex("02", 50); // finish
            this.serial.bufSendHex("02", 50); // finish
            this.serial.bufSendHex("43", 50); // go to final screen
        }, 200);
        this.setState(this.StateFinished);
    }

    gbLose(gb) {
        console.log("LOSE!");
        // Stop game loop and clear buffer before sending lose sequence
        this.gameLoopActive = false;
        setTimeout(() => {
            this.serial.clearBuffer();
            this.serial.bufSendHex("77", 50); // 77 indicates other player has reached 30 lines
            this.serial.bufSendHex("02", 50); // finish
            this.serial.bufSendHex("02", 50); // finish
            this.serial.bufSendHex("02", 50); // finish
            this.serial.bufSendHex("43", 50); // go to final screen
        }, 200);
        this.setState(this.StateFinished);
    }

    // Game logic
    isFirstGame() {
        if (this.hasPlayedBefore) {
            return false;
        }
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
            if (this.gb) this.gb.sendHeight(height);
        }
    }

    startGameTimer() {
        setTimeout(() => {
            // Stop the loop if game ended or state changed
            if (!this.gameLoopActive) {
                console.log("Game loop stopped (gameLoopActive=false)");
                return;
            }

            // During startup, skip sending anything - just wait
            if (this.gameStarting) {
                this.startGameTimer(); // Just schedule next check
                return;
            }

            // Determine what byte to send - priority: winLose > opponentHeight
            let byteToSend;
            if (this.winLoseQueue.length > 0) {
                byteToSend = this.winLoseQueue.shift();
                console.log("Sending from winLoseQueue:", byteToSend.toString(16));
            } else if (this.gb) {
                // Default: send opponent's max height
                var heights = [0].concat(this.gb.getOtherUsers().map(u => u.height || 0));
                byteToSend = Math.max(...heights);
            } else {
                byteToSend = 0;
            }

            this.serial.send(new Uint8Array([byteToSend]));
            this.serial.read(64).then(result => {
                if (!this.gameLoopActive) return;
                var data = result.data.buffer;
                // Note: data.length is intentionally used (undefined for ArrayBuffer)
                // to match React behavior - ensures we always process the first byte
                if (data.length > 1) {
                    console.log("Data too long");
                    console.log(data.length);
                    // Ignore old data in buffer
                    if (this.gameLoopActive) this.startGameTimer();
                } else {
                    var value = (new Uint8Array(data))[0];
                    if (value < 20) {
                        this.updateHeight(value);
                    } else if ((value >= 0x80) && (value <= 0x85)) { // lines sent
                        console.log("Sending lines!", value.toString(16));
                        if (this.gb) this.gb.sendLines(value);
                    } else if (value === 0x77) { // we won by reaching 30 lines
                        console.log("We reached 30 lines - WIN!");
                        this.setState(this.StateFinished);
                        if (this.gb) this.gb.sendReached30Lines();
                    } else if (value === 0xaa) { // we lost...
                        // Ignore topped-out signal in first 3 seconds (may be leftover from previous game)
                        const timeSinceStart = Date.now() - this.gameStartedAt;
                        if (timeSinceStart < 3000) {
                            console.log("Ignoring topped out - game just started (" + timeSinceStart + "ms ago)");
                        } else {
                            console.log("We topped out - LOSE!");
                            this.setState(this.StateFinished);
                            if (this.gb) this.gb.sendDead();
                        }
                    } else if (value === 0xFF) { // screen is filled after loss
                        // Queue the final screen command instead of using buffer directly
                        this.winLoseQueue.push(0x43);
                    }
                }
                if (this.gameLoopActive) this.startGameTimer();
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

    handleReadyNext() {
        this.gb.sendReadyNext();
        document.getElementById('btn-ready-next').disabled = true;
        document.getElementById('btn-ready-next').textContent = 'Waiting for opponent...';
    }

    gbPlayerReady(gb, uuid) {
        var readyUser = this.users.find(u => u.uuid === uuid);
        var name = readyUser ? readyUser.name : 'A player';
        document.getElementById('finished-ready-status').textContent = name + ' is ready!';
    }

    gbCountdownStarted(gb, seconds) {
        var countdown = seconds;
        var countdownEl = document.getElementById('finished-countdown');
        countdownEl.style.display = 'block';
        countdownEl.textContent = 'Game starting in ' + countdown + 's...';

        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
        }
        this.countdownInterval = setInterval(() => {
            countdown--;
            if (countdown <= 0) {
                clearInterval(this.countdownInterval);
                this.countdownInterval = null;
                countdownEl.textContent = 'Starting...';
            } else {
                countdownEl.textContent = 'Game starting in ' + countdown + 's...';
            }
        }, 1000);
    }
}

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new OnlineTetris();
});
