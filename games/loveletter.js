const baseDeck = [
  { name: 'Guard', value: 1, count: 5 },
  { name: 'Priest', value: 2, count: 2 },
  { name: 'Baron', value: 3, count: 2 },
  { name: 'Handmaid', value: 4, count: 2 },
  { name: 'Prince', value: 5, count: 2 },
  { name: 'King', value: 6, count: 1 },
  { name: 'Countess', value: 7, count: 1 },
  { name: 'Princess', value: 8, count: 1 },
];

const makeDeck = () => {
  const deck = [];
  baseDeck.forEach((card) => {
    for (let i = 0; i < card.count; i += 1) {
      deck.push({ name: card.name, value: card.value });
    }
  });
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
};

const initialState = (roomId) => ({
  roomId,
  started: false,
  ended: false,
  winner: null,
  players: {},
  order: [],
  deck: [],
  discard: [],
  burns: [],
  currentPlayer: null,
  log: [],
  runtime: { players: {}, lastPeek: null },
});

const createRuntimePlayer = () => ({
  hand: [],
  eliminated: false,
  protected: false,
});

const setup = (state) => {
  state.deck = makeDeck();
  state.discard = [];
  state.burns = [];
  state.log = [`Game starting with ${state.order.length} players.`];
  state.ended = false;
  state.winner = null;
  state.runtime = { players: {}, lastPeek: null };
  state.order.forEach((id) => {
    state.runtime.players[id] = createRuntimePlayer();
  });

  const burnCount = state.order.length === 2 ? 4 : 1;
  for (let i = 0; i < burnCount; i += 1) {
    const card = state.deck.pop();
    if (card) state.burns.push(card);
  }
  state.log.push(`Burned ${burnCount} card(s).`);

  state.order.forEach((id) => {
    drawCard(state, id);
  });
};

const drawCard = (state, playerId) => {
  if (!state.deck.length) return null;
  const card = state.deck.pop();
  const p = state.runtime.players[playerId];
  if (p) {
    p.hand.push(card);
  }
  return card;
};

const startTurn = (state) => {
  state.runtime.lastPeek = null;
  const player = state.runtime.players[state.currentPlayer];
  if (!player || player.eliminated) return;
  player.protected = false;
  const drawn = drawCard(state, state.currentPlayer);
  if (drawn) state.log.push(`${state.players[state.currentPlayer].name} draws.`);
  else state.log.push('Deck empty, final turns.');
};

const validateCountess = (player) => {
  const hasCountess = player.hand.some((c) => c.name === 'Countess');
  const hasRoyal = player.hand.some((c) => c.name === 'King' || c.name === 'Prince');
  return !(hasCountess && hasRoyal);
};

const eliminate = (state, playerId, reason) => {
  const p = state.runtime.players[playerId];
  if (p && !p.eliminated) {
    p.eliminated = true;
    state.log.push(`${state.players[playerId].name} is eliminated${reason ? ` (${reason})` : ''}.`);
  }
};

const handleAction = (state, actorId, payload) => {
  const actorRuntime = state.runtime.players[actorId];
  const actorInfo = state.players[actorId];
  if (!actorRuntime) return { error: 'Unknown actor.' };
  if (!validateCountess(actorRuntime) && actorRuntime.hand[payload.cardIndex]?.name !== 'Countess') {
    return { error: 'Must play Countess when holding King or Prince.' };
  }

  const card = actorRuntime.hand.splice(payload.cardIndex, 1)[0];
  if (!card) return { error: 'Invalid card selection.' };

  state.discard.push({ ...card, by: actorInfo.name, target: payload.targetId, guess: payload.guess });
  state.log.push(`${actorInfo.name} plays ${card.name}.`);

  const target = payload.targetId ? state.runtime.players[payload.targetId] : null;
  const targetInfo = payload.targetId ? state.players[payload.targetId] : null;

  if (card.name === 'Guard') {
    if (!payload.targetId || payload.targetId === actorId || !target || target.protected || target.eliminated) {
      state.log.push('Guard has no effect.');
    } else if (payload.guess === 1) {
      state.log.push('Guard cannot guess Guard.');
    } else if (target.hand[0]?.value === payload.guess) {
      eliminate(state, payload.targetId, 'Guard guess');
    } else {
      state.log.push('Guard guess misses.');
    }
  } else if (card.name === 'Priest') {
    if (target && payload.targetId !== actorId && !target.protected && !target.eliminated && target.hand[0]) {
      state.runtime.lastPeek = { viewerId: actorId, targetId: payload.targetId, card: target.hand[0] };
      state.log.push(`${actorInfo.name} peeks at ${targetInfo.name}.`);
    }
  } else if (card.name === 'Baron') {
    if (target && payload.targetId !== actorId && !target.protected && !target.eliminated && target.hand[0]) {
      const myVal = actorRuntime.hand[0]?.value ?? 0;
      const targetVal = target.hand[0].value;
      if (myVal > targetVal) eliminate(state, payload.targetId, 'Baron');
      else if (targetVal > myVal) eliminate(state, actorId, 'Baron');
      else state.log.push('Baron tie, no one eliminated.');
    }
  } else if (card.name === 'Handmaid') {
    actorRuntime.protected = true;
  } else if (card.name === 'Prince') {
    const victimId = payload.targetId || actorId;
    const victim = state.runtime.players[victimId];
    if (victim && !victim.eliminated && (!victim.protected || victimId === actorId)) {
      const dumped = victim.hand.pop();
      if (dumped) {
        state.log.push(`${state.players[victimId].name} discards ${dumped.name}.`);
        state.discard.push({ ...dumped, by: state.players[victimId].name });
        if (dumped.name === 'Princess') {
          eliminate(state, victimId, 'Princess discarded');
        } else {
          drawCard(state, victimId);
        }
      }
    } else {
      state.log.push('Prince has no effect.');
    }
  } else if (card.name === 'King') {
    if (target && payload.targetId !== actorId && !target.protected && !target.eliminated) {
      const temp = actorRuntime.hand;
      actorRuntime.hand = target.hand;
      target.hand = temp;
      state.log.push(`${actorInfo.name} swaps hands with ${targetInfo.name}.`);
    }
  } else if (card.name === 'Countess') {
    // No effect.
  } else if (card.name === 'Princess') {
    eliminate(state, actorId, 'Princess played');
  }

  return { ok: true };
};

const checkEnd = (state) => {
  const alive = state.order.filter((id) => !state.runtime.players[id]?.eliminated);
  if (alive.length === 1) {
    return { ended: true, winner: alive[0] };
  }
  if (!state.deck.length) {
    let winner = alive[0] || null;
    let bestValue = -1;
    alive.forEach((pid) => {
      const handVal = state.runtime.players[pid].hand[0]?.value ?? 0;
      if (handVal > bestValue) {
        bestValue = handVal;
        winner = pid;
      }
    });
    return { ended: true, winner };
  }
  return { ended: false };
};

const buildView = (state, viewerId) => {
  const viewer = state.players[viewerId];
  const runtime = state.runtime.players[viewerId];
  const peek = state.runtime.lastPeek;
  return {
    roomId: state.roomId,
    started: state.started,
    ended: state.ended,
    winner: state.winner ? { id: state.winner, name: state.players[state.winner]?.name } : null,
    deckCount: state.deck.length,
    discard: state.discard.slice(-10),
    currentPlayer: state.currentPlayer,
    burns: state.started ? state.burns.length : 0,
    you: viewer
      ? {
          id: viewer.id,
          name: viewer.name,
          hand: runtime?.hand || [],
          eliminated: runtime?.eliminated || false,
          protected: runtime?.protected || false,
          peek:
            peek && peek.viewerId === viewerId && peek.card
              ? { targetId: peek.targetId, card: peek.card }
              : null,
        }
      : null,
    players: state.order.map((id) => {
      const p = state.players[id];
      const r = state.runtime.players[id];
      return {
        id,
        name: p?.name || 'Unknown',
        handCount: r?.hand.length || 0,
        eliminated: r?.eliminated || false,
        protected: r?.protected || false,
        isYou: id === viewerId,
        isCurrent: id === state.currentPlayer,
      };
    }),
    log: state.log.slice(-16),
  };
};

module.exports = {
  id: 'loveletter',
  minPlayers: 2,
  maxPlayers: 4,
  initialState,
  createRuntimePlayer,
  setup,
  startTurn,
  handleAction,
  checkEnd,
  buildView,
};
