# GB-Tetris-Web

Web frontend for online Game Boy Tetris multiplayer. Connects to a Game Boy via WebUSB and to the game server via WebSockets.

## Requirements

- Chrome or Edge browser (for WebUSB support)
- [GB Link Cable USB adapter](https://github.com/starlarkus/gb-link-firmware-reconfigurable)
- Game Boy with Tetris cartridge

## HTTPS Note

WebUSB requires HTTPS. For local development, `localhost` is allowed without HTTPS but will only allow connections to a ws:// backend server

## Configuration

WebSocket server settings are in `js/gbwebsocket.js`:
