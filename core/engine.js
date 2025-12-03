const createRoom = (spec, roomId) => {
  const state = spec.initialState(roomId);

  const join = (id, name) => {
    if (state.started && !state.players[id]) {
      return { error: 'Game already started.' };
    }
    if (!state.players[id] && spec.maxPlayers && state.order.length >= spec.maxPlayers) {
      return { error: 'Room full.' };
    }
    if (!state.players[id]) {
      const playerName = name?.trim() || `Player-${state.order.length + 1}`;
      state.players[id] = {
        id,
        name: playerName,
      };
      state.order.push(id);
      state.runtime.players[id] = spec.createRuntimePlayer();
    } else if (name) {
      state.players[id].name = name.trim();
    }
    return spec.buildView(state, id);
  };

  const start = () => {
    if (state.started && !state.ended) return { error: 'Game already started.' };
    if (state.order.length < (spec.minPlayers || 2)) {
      return { error: `Need at least ${spec.minPlayers || 2} players.` };
    }
    state.ended = false;
    spec.setup(state);
    state.started = true;
    state.currentPlayer = state.order[0];
    spec.startTurn(state);
    return { ok: true };
  };

  const nextPlayer = () => {
    if (!state.order.length) return;
    let hops = 0;
    do {
      const idx = state.order.indexOf(state.currentPlayer);
      state.currentPlayer = state.order[(idx + 1) % state.order.length];
      hops += 1;
      const p = state.runtime.players[state.currentPlayer];
      if (p && !p.eliminated) break;
    } while (hops <= state.order.length);
  };

  const act = (playerId, action) => {
    if (!state.started) return { error: 'Game not started.' };
    if (state.ended) return { error: 'Round already ended.' };
    if (state.currentPlayer !== playerId) return { error: 'Not your turn.' };
    if (state.runtime.players[playerId]?.eliminated) {
      return { error: 'Eliminated players cannot act.' };
    }

    const result = spec.handleAction(state, playerId, action);
    if (result?.error) return result;

    const endResult = spec.checkEnd(state);
    if (endResult?.ended) {
      state.ended = true;
      state.winner = endResult.winner;
      state.started = false;
      return { ok: true, ended: true };
    }

    if (!result?.stayTurn) {
      nextPlayer();
    }
    spec.startTurn(state);
    return { ok: true };
  };

  const leave = (playerId) => {
    delete state.players[playerId];
    delete state.runtime.players[playerId];
    state.order = state.order.filter((id) => id !== playerId);
    if (state.currentPlayer === playerId) {
      state.currentPlayer = state.order[0] || null;
      if (state.currentPlayer) spec.startTurn(state);
    }
  };

  const viewFor = (viewerId) => spec.buildView(state, viewerId);

  return { roomId, state, join, start, act, leave, viewFor };
};

module.exports = { createRoom };
