import React from 'react';

import {Player} from './player.js';

class Lobby extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      preset_rng: undefined,
    }
  }

  handlePresetRngChanged(event) {
    this.setState({
      preset_rng: event.target.value
    });
  }

  render() {
    var userbar;
    var settingsBar;
    if(this.props.admin) {
      userbar = <button onClick={(e) => this.props.onStartGame()} className="btn btn-lg btn-secondary">Start game!</button>
      settingsBar = (<div>
        <p>
          &nbsp;
        </p>
        <h3>Optional: send custom Garbage, Pieces and Well column to the server</h3>
        <p>
          <a href="https://minoselector.gblink.io" target="_blank">&gt; Click here to generate your own RNG &lt;</a>
        </p>
        <textarea rows="4" onChange={this.handlePresetRngChanged.bind(this)} value={this.state.preset_rng}></textarea>
        <div>
          <button onClick={(e) => this.props.onSendPresetRng(this.state.preset_rng)} className="btn btn-lg btn-secondary">Send RNG to Server</button>
        </div>
      </div>
      )
    } else {
      userbar = <p>Please wait for the lobby leader to start the game!</p>
      settingsBar = <span></span>
    }

    return (
      <div>
        <h2>In Lobby: {this.props.game_code}</h2>
        <h4>Players:</h4>
        <div className="container">
          <div className="row justify-content-center">
              {this.props.users.map((user, index) => (
                <Player key="lobby-{user.name}" user={user} />
            ))}
          </div>
        </div>
        {userbar}
        {settingsBar}
      </div>
    )
  }
}

export { Lobby };
