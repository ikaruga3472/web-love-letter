const createRoom = (spec, roomId) => {
  const state = spec.initialState(roomId);
  const pushLog = (line) => {
    if (!line) return;
    state.log.push(line);
    if (state.log.length > 100) state.log.shift();
  };

  const join = (id, name) => {
    if (state.started && !state.players[id]) {
      return { error: '게임이 이미 시작되었습니다.' };
    }
    if (!state.players[id] && spec.maxPlayers && state.order.length >= spec.maxPlayers) {
      return { error: '방 인원이 가득 찼습니다.' };
    }
    if (!state.players[id]) {
      const playerName = name?.trim() || `플레이어-${state.order.length + 1}`;
      state.players[id] = {
        id,
        name: playerName,
      };
      state.order.push(id);
      state.runtime.players[id] = spec.createRuntimePlayer();
      pushLog(`${playerName}님이 ${state.roomId} 방에 입장했습니다.`);
    } else if (name) {
      state.players[id].name = name.trim();
    }
    return spec.buildView(state, id);
  };

  const start = () => {
    if (state.started && !state.ended) return { error: '게임이 이미 시작되었습니다.' };
    if (state.order.length < (spec.minPlayers || 2)) {
      return { error: `최소 ${spec.minPlayers || 2}명의 플레이어가 필요합니다.` };
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
    if (!state.started) return { error: '게임이 아직 시작되지 않았습니다.' };
    if (state.ended) return { error: '이번 라운드가 이미 종료되었습니다.' };
    if (state.currentPlayer !== playerId) return { error: '지금은 당신의 차례가 아닙니다.' };
    if (state.runtime.players[playerId]?.eliminated) {
      return { error: '탈락한 플레이어는 행동할 수 없습니다.' };
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
