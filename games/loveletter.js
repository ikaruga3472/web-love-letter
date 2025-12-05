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

const CARD_LABELS = {
  Guard: '경비병',
  Priest: '사제',
  Baron: '남작',
  Handmaid: '시녀',
  Prince: '왕자',
  King: '왕',
  Countess: '백작부인',
  Princess: '공주',
};

const ELIMINATION_REASONS = {
  'Guard guess': '경비병 추측 적중',
  'Princess discarded': '공주를 버렸습니다',
  'Princess played': '공주를 냈습니다',
  Baron: '남작 대결 패배',
};

const labelCard = (name) => CARD_LABELS[name] || name;
const describeReason = (reason) => (reason ? ELIMINATION_REASONS[reason] || reason : '');
const pushLog = (state, line) => {
  if (!line) return;
  state.log.push(line);
  if (state.log.length > 100) state.log.shift();
};

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
  state.ended = false;
  state.winner = null;
  state.runtime = { players: {}, lastPeek: null };
  state.order.forEach((id) => {
    state.runtime.players[id] = createRuntimePlayer();
  });
  pushLog(state, `${state.order.length}명으로 게임을 시작합니다.`);

  const burnCount = state.order.length === 2 ? 4 : 1;
  for (let i = 0; i < burnCount; i += 1) {
    const card = state.deck.pop();
    if (card) state.burns.push(card);
  }
  pushLog(state, `버린 카드: ${burnCount}장.`);

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
  if (drawn) pushLog(state, `${state.players[state.currentPlayer].name}님이 카드를 한 장 뽑았습니다.`);
  else pushLog(state, '덱이 비어 마지막 한 바퀴를 진행합니다.');
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
    const reasonText = describeReason(reason);
    pushLog(state, `${state.players[playerId].name}님이 탈락했습니다${reasonText ? ` (${reasonText})` : ''}.`);
  }
};

const handleAction = (state, actorId, payload) => {
  const actorRuntime = state.runtime.players[actorId];
  const actorInfo = state.players[actorId];
  if (!actorRuntime) return { error: '알 수 없는 플레이어입니다.' };
  if (!validateCountess(actorRuntime) && actorRuntime.hand[payload.cardIndex]?.name !== 'Countess') {
    return { error: '왕자 또는 왕과 함께 있을 때는 반드시 백작부인을 내야 합니다.' };
  }

  const card = actorRuntime.hand.splice(payload.cardIndex, 1)[0];
  if (!card) return { error: '잘못된 카드 선택입니다.' };

  state.discard.push({ ...card, by: actorInfo.name, target: payload.targetId, guess: payload.guess });
  pushLog(state, `${actorInfo.name}님이 ${labelCard(card.name)}를 냈습니다.`);

  const target = payload.targetId ? state.runtime.players[payload.targetId] : null;
  const targetInfo = payload.targetId ? state.players[payload.targetId] : null;

  if (card.name === 'Guard') {
    if (!payload.targetId || payload.targetId === actorId || !target || target.protected || target.eliminated) {
      pushLog(state, '경비병 효과가 적용되지 않았습니다.');
    } else if (payload.guess === 1) {
      pushLog(state, '경비병으로 경비병을 지목할 수 없습니다.');
    } else if (target.hand[0]?.value === payload.guess) {
      eliminate(state, payload.targetId, 'Guard guess');
    } else {
      pushLog(state, '경비병 추측이 빗나갔습니다.');
    }
  } else if (card.name === 'Priest') {
    if (target && payload.targetId !== actorId && !target.protected && !target.eliminated && target.hand[0]) {
      state.runtime.lastPeek = { viewerId: actorId, targetId: payload.targetId, card: target.hand[0] };
      pushLog(state, `${actorInfo.name}님이 ${targetInfo.name}님의 카드를 확인했습니다.`);
    }
  } else if (card.name === 'Baron') {
    if (target && payload.targetId !== actorId && !target.protected && !target.eliminated && target.hand[0]) {
      const myVal = actorRuntime.hand[0]?.value ?? 0;
      const targetVal = target.hand[0].value;
      if (myVal > targetVal) eliminate(state, payload.targetId, 'Baron');
      else if (targetVal > myVal) eliminate(state, actorId, 'Baron');
      else pushLog(state, '남작 대결 무승부로 아무도 탈락하지 않습니다.');
    }
  } else if (card.name === 'Handmaid') {
    actorRuntime.protected = true;
  } else if (card.name === 'Prince') {
    const victimId = payload.targetId || actorId;
    const victim = state.runtime.players[victimId];
    if (victim && !victim.eliminated && (!victim.protected || victimId === actorId)) {
      const dumped = victim.hand.pop();
      if (dumped) {
        pushLog(state, `${state.players[victimId].name}님이 ${labelCard(dumped.name)}를 버렸습니다.`);
        state.discard.push({ ...dumped, by: state.players[victimId].name });
        if (dumped.name === 'Princess') {
          eliminate(state, victimId, 'Princess discarded');
        } else {
          drawCard(state, victimId);
        }
      }
    } else {
      pushLog(state, '왕자 카드 효과가 적용되지 않았습니다.');
    }
  } else if (card.name === 'King') {
    if (target && payload.targetId !== actorId && !target.protected && !target.eliminated) {
      const temp = actorRuntime.hand;
      actorRuntime.hand = target.hand;
      target.hand = temp;
      pushLog(state, `${actorInfo.name}님이 ${targetInfo.name}님과 손패를 교환했습니다.`);
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
        name: p?.name || '알 수 없음',
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
