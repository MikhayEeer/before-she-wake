import { CARDS, DECK_COUNTS, GOOD_CARD_IDS, HARMONY_TARGET } from './cards'
import type {
  CardId,
  CardInstance,
  GameResult,
  GameState,
  PlacedCard,
  Player,
  PlayerConfig,
  TurnAction,
} from './types'
import { RuleError } from './types'

const UINT32_SIZE = 0x1_0000_0000

function copyState(state: GameState): GameState {
  return structuredClone(state)
}

function nextRandom(state: Pick<GameState, 'rngSeed'>): number {
  state.rngSeed = (Math.imul(state.rngSeed, 1664525) + 1013904223) >>> 0
  return state.rngSeed / UINT32_SIZE
}

function shuffle<T>(items: T[], seedState: Pick<GameState, 'rngSeed'>): T[] {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const target = Math.floor(nextRandom(seedState) * (index + 1))
    ;[items[index], items[target]] = [items[target], items[index]]
  }
  return items
}

function getPlayer(state: GameState, playerId: string): Player {
  const player = state.players.find((candidate) => candidate.id === playerId)
  if (!player) throw new RuleError('找不到该玩家。')
  return player
}

function removeHandCard(player: Player, cardUid: string): CardInstance {
  const index = player.hand.findIndex((card) => card.uid === cardUid)
  if (index < 0) throw new RuleError('这张牌已经不在手中。')
  return player.hand.splice(index, 1)[0]
}

function addLog(
  state: GameState,
  text: string,
  tone: 'normal' | 'alert' | 'quiet' = 'normal',
): void {
  state.log.unshift({
    id: `log-${state.turn}-${state.log.length}-${state.rngSeed}`,
    turn: state.turn,
    text,
    tone,
  })
  state.log = state.log.slice(0, 80)
}

function addIntel(state: GameState, playerId: string, title: string, cardIds: CardId[]): void {
  getPlayer(state, playerId).intel.unshift({
    id: `intel-${state.turn}-${state.rngSeed}-${cardIds.join('-')}`,
    turn: state.turn,
    title,
    cardIds,
  })
}

function activeTargets(state: GameState, actorId: string): Player[] {
  return state.players.filter((player) => player.id !== actorId && player.hand.length > 1)
}

function startNormalTurn(state: GameState, playerId: string): void {
  state.currentPlayerId = playerId
  const pendingIndex = state.pendingInfected.indexOf(playerId)
  if (pendingIndex >= 0) {
    state.pendingInfected.splice(pendingIndex, 1)
    const infectedStillPresent = state.played.some(
      (entry) => entry.byPlayerId === playerId && entry.card.cardId === 'infected',
    )
    if (infectedStillPresent && state.harmony.length > 0) {
      state.phase = { kind: 'infected-retrieve', actorId: playerId }
      addLog(state, `${getPlayer(state, playerId).name} 的感染者效果开始结算。`, 'alert')
      return
    }
  }
  state.phase = { kind: 'turn', actorId: playerId }
}

function finishGame(state: GameState): void {
  state.status = 'finished'
  state.result = settleGame(state)
  addLog(state, '所有领队身份已经锁定，开始最终结算。', 'alert')
}

function endTurnInPlace(state: GameState, actorId: string): void {
  if (state.players.every((player) => player.hand.length === 1)) {
    finishGame(state)
    return
  }

  const actorIndex = state.players.findIndex((player) => player.id === actorId)
  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const candidate = state.players[(actorIndex + offset) % state.players.length]
    if (candidate.hand.length > 1) {
      state.turn += 1
      startNormalTurn(state, candidate.id)
      return
    }
  }
  finishGame(state)
}

function beginAbility(state: GameState, actorId: string, playedCard: CardInstance): void {
  const actor = getPlayer(state, actorId)
  const definition = CARDS[playedCard.cardId]

  switch (playedCard.cardId) {
    case 'health-committee': {
      const canTake = state.played.some(
        (entry) =>
          entry.byPlayerId !== actorId && entry.card.cardId !== 'health-committee',
      )
      if (canTake) {
        state.phase = { kind: 'take-played', actorId, playedCardUid: playedCard.uid }
      } else {
        addLog(state, '公开区没有可取回的旧牌，保健委员未产生额外效果。', 'quiet')
        endTurnInPlace(state, actorId)
      }
      return
    }
    case 'discipline-committee':
      if (state.players.length > 1) {
        state.phase = { kind: 'inspect-player', actorId }
      } else {
        endTurnInPlace(state, actorId)
      }
      return
    case 'young-lady':
      if (activeTargets(state, actorId).length > 0) {
        state.phase = { kind: 'young-lady', actorId }
      } else {
        addLog(state, '没有可交换身份的玩家，大小姐效果跳过。', 'quiet')
        endTurnInPlace(state, actorId)
      }
      return
    case 'news-club': {
      const participants = state.players
        .filter((player) => player.id === actorId || player.hand.length > 1)
        .map((player) => player.id)
      if (participants.length > 1 && participants.every((id) => getPlayer(state, id).hand.length > 0)) {
        state.phase = {
          kind: 'news-pass',
          actorId,
          participants,
          cursor: 0,
          selections: {},
        }
      } else {
        addLog(state, '没有足够的行动玩家传递手牌，新闻部效果跳过。', 'quiet')
        endTurnInPlace(state, actorId)
      }
      return
    }
    case 'class-representative':
      if (actor.hand.length > 0 && activeTargets(state, actorId).length > 0) {
        state.phase = { kind: 'class-pick', actorId }
      } else {
        addLog(state, '没有可交换身份的玩家，班级委员效果跳过。', 'quiet')
        endTurnInPlace(state, actorId)
      }
      return
    case 'library-committee': {
      if (state.harmony.length > 0) {
        const cardIds = state.harmony.map((entry) => entry.card.cardId)
        addIntel(state, actorId, '查看调和区', cardIds)
        state.phase = { kind: 'inspect-harmony', actorId, cardIds }
      } else {
        addLog(state, '调和区仍为空，图书委员没有发现线索。', 'quiet')
        endTurnInPlace(state, actorId)
      }
      return
    }
    case 'honor-student': {
      const signaledPlayerIds = state.players
        .filter(
          (player) =>
            player.id !== actorId && player.hand.some((card) => card.cardId === 'criminal'),
        )
        .map((player) => player.id)
      const alienHolder = state.players.find(
        (player) =>
          player.id !== actorId &&
          player.hand.some((card) => card.cardId === 'alien') &&
          !player.hand.some((card) => card.cardId === 'criminal'),
      )
      if (alienHolder) {
        state.phase = {
          kind: 'honor-alien-choice',
          actorId,
          alienPlayerId: alienHolder.id,
          signaledPlayerIds,
        }
      } else {
        const names = signaledPlayerIds.map((id) => getPlayer(state, id).name)
        addIntel(state, actorId, `优等生示意：${names.join('、') || '无人'}`, [])
        state.phase = { kind: 'honor-result', actorId, signaledPlayerIds }
      }
      return
    }
    case 'accomplice':
      if (state.players.some((player) => player.suspicion.length > 0)) {
        state.phase = { kind: 'move-suspicion', actorId }
      } else {
        addLog(state, '场上还没有质疑牌，共犯效果跳过。', 'quiet')
        endTurnInPlace(state, actorId)
      }
      return
    case 'infected':
      if (!state.pendingInfected.includes(actorId)) state.pendingInfected.push(actorId)
      addLog(state, `${actor.name} 的感染者效果将在下次行动前触发。`, 'alert')
      endTurnInPlace(state, actorId)
      return
    case 'go-home-club':
      if (actor.hand.length > 0 && state.harmony.length > 0) {
        state.phase = { kind: 'exchange-harmony', actorId }
      } else {
        addLog(state, '调和区没有可交换的牌，归宅部效果跳过。', 'quiet')
        endTurnInPlace(state, actorId)
      }
      return
    default:
      addLog(state, `${definition.name} 发动后没有额外效果。`, 'quiet')
      endTurnInPlace(state, actorId)
  }
}

export function buildDeck(playerCount: number, seed = 1): CardInstance[] {
  const counts = DECK_COUNTS[playerCount]
  if (!counts) throw new RuleError('玩家人数必须在 3 到 6 人之间。')
  let serial = 0
  const deck = (Object.entries(counts) as [CardId, number][]).flatMap(([cardId, count]) =>
    Array.from({ length: count }, () => ({
      uid: `card-${seed}-${serial++}`,
      cardId,
    })),
  )
  return shuffle(deck, { rngSeed: seed >>> 0 || 1 })
}

export function createGame(configs: PlayerConfig[], seed = Date.now()): GameState {
  if (configs.length < 3 || configs.length > 6) {
    throw new RuleError('游戏需要 3 到 6 名玩家。')
  }
  if (configs.some((config) => !config.name.trim())) {
    throw new RuleError('每名玩家都需要一个名字。')
  }

  const normalizedSeed = seed >>> 0 || 1
  const deck = buildDeck(configs.length, normalizedSeed)
  const cardsPerPlayer = Math.floor(deck.length / configs.length)
  const players: Player[] = configs.map((config) => ({
    id: config.id,
    name: config.name.trim(),
    kind: config.kind,
    hand: deck.splice(0, cardsPerPlayer),
    suspicion: [],
    intel: [],
  }))
  const firstPlayer =
    players.find((player) => player.hand.some((card) => card.cardId === 'student-president')) ?? players[0]

  const state: GameState = {
    version: 1,
    status: 'playing',
    players,
    harmony: [],
    played: [],
    unused: deck,
    phase: { kind: 'turn', actorId: firstPlayer.id },
    firstPlayerId: firstPlayer.id,
    currentPlayerId: firstPlayer.id,
    pendingInfected: [],
    turn: 1,
    rngSeed: normalizedSeed,
    log: [],
    result: null,
  }
  addLog(state, `${firstPlayer.name} 持有学生会长，成为起始玩家。`, 'alert')
  addLog(state, `每位玩家获得 ${cardsPerPlayer} 张牌，${deck.length} 张牌未进入本局。`, 'quiet')
  return state
}

export function getDecisionPlayerId(state: GameState): string | null {
  if (state.status === 'finished') return null
  if (state.phase.kind === 'news-pass') {
    return state.phase.participants[state.phase.cursor] ?? null
  }
  if (state.phase.kind === 'class-receive') return state.phase.targetId
  if (state.phase.kind === 'honor-alien-choice') return state.phase.alienPlayerId
  return state.phase.actorId
}

export function playTurnAction(state: GameState, action: TurnAction): GameState {
  if (state.status !== 'playing' || state.phase.kind !== 'turn') {
    throw new RuleError('当前不能执行普通行动。')
  }
  const next = copyState(state)
  const actorId = next.phase.actorId
  if (actorId !== next.currentPlayerId) throw new RuleError('还没有轮到这名玩家。')
  const actor = getPlayer(next, actorId)
  if (actor.hand.length <= 1) throw new RuleError('最后身份已经锁定。')
  const card = actor.hand.find((candidate) => candidate.uid === action.cardUid)
  if (!card) throw new RuleError('请选择自己手中的牌。')
  if (card.cardId === 'criminal') throw new RuleError('犯人不能被主动使用。')
  const definition = CARDS[card.cardId]
  const removed = removeHandCard(actor, card.uid)

  if (action.use === 'harmony') {
    next.harmony.push({ card: removed, byPlayerId: actorId })
    addLog(next, `${actor.name} 将一张牌面朝下放入调和区。`)
    endTurnInPlace(next, actorId)
    return next
  }

  if (action.use === 'suspicion') {
    if (!action.targetPlayerId || action.targetPlayerId === actorId) {
      throw new RuleError('质疑必须指向另一名玩家。')
    }
    const target = getPlayer(next, action.targetPlayerId)
    target.suspicion.push({ card: removed, byPlayerId: actorId })
    addLog(next, `${actor.name} 向 ${target.name} 放置了一张面朝下的质疑牌。`, 'alert')
    endTurnInPlace(next, actorId)
    return next
  }

  next.played.push({ card: removed, byPlayerId: actorId })
  addLog(next, `${actor.name} 发动了「${definition.name}」。`)
  beginAbility(next, actorId, removed)
  return next
}

export function takePlayedCard(state: GameState, cardUid: string): GameState {
  if (state.phase.kind !== 'take-played') throw new RuleError('当前不能取回公开牌。')
  const next = copyState(state)
  if (next.phase.kind !== 'take-played') throw new RuleError('行动状态已经变化。')
  const index = next.played.findIndex((entry) => entry.card.uid === cardUid)
  if (index < 0) throw new RuleError('这张公开牌已经被取走。')
  const actor = getPlayer(next, next.phase.actorId)
  const candidate = next.played[index]
  if (candidate.byPlayerId === actor.id || candidate.card.cardId === 'health-committee') {
    throw new RuleError('只能取回其他玩家发动的非保健委员牌。')
  }
  const [entry] = next.played.splice(index, 1)
  actor.hand.push(entry.card)
  addLog(next, `${actor.name} 用保健委员取回了「${CARDS[entry.card.cardId].name}」。`)
  endTurnInPlace(next, actor.id)
  return next
}

export function inspectPlayer(state: GameState, targetId: string): GameState {
  if (state.phase.kind !== 'inspect-player') throw new RuleError('当前不能查看手牌。')
  const next = copyState(state)
  if (next.phase.kind !== 'inspect-player') throw new RuleError('行动状态已经变化。')
  if (targetId === next.phase.actorId) throw new RuleError('请选择另一名玩家。')
  const target = getPlayer(next, targetId)
  const cardIds = target.hand.map((card) => card.cardId)
  addIntel(next, next.phase.actorId, `查看 ${target.name} 的手牌`, cardIds)
  next.phase = { kind: 'inspect-result', actorId: next.phase.actorId, targetId, cardIds }
  addLog(next, `${getPlayer(next, next.phase.actorId).name} 查看了 ${target.name} 的手牌。`, 'quiet')
  return next
}

export function confirmPrivateResult(state: GameState): GameState {
  if (
    state.phase.kind !== 'inspect-result' &&
    state.phase.kind !== 'inspect-harmony' &&
    state.phase.kind !== 'honor-result'
  ) {
    throw new RuleError('当前没有待确认的秘密信息。')
  }
  const next = copyState(state)
  const actorId = next.phase.actorId
  endTurnInPlace(next, actorId)
  return next
}

export function respondHonorStudent(state: GameState, impersonate: boolean): GameState {
  if (state.phase.kind !== 'honor-alien-choice') {
    throw new RuleError('当前不需要回应优等生。')
  }
  const next = copyState(state)
  if (next.phase.kind !== 'honor-alien-choice') throw new RuleError('行动状态已经变化。')
  const signaledPlayerIds = [...next.phase.signaledPlayerIds]
  if (impersonate && !signaledPlayerIds.includes(next.phase.alienPlayerId)) {
    signaledPlayerIds.push(next.phase.alienPlayerId)
  }
  const names = signaledPlayerIds.map((id) => getPlayer(next, id).name)
  addIntel(next, next.phase.actorId, `优等生示意：${names.join('、') || '无人'}`, [])
  addLog(
    next,
    `${getPlayer(next, next.phase.actorId).name} 完成了优等生的秘密查验。`,
    'quiet',
  )
  next.phase = {
    kind: 'honor-result',
    actorId: next.phase.actorId,
    signaledPlayerIds,
  }
  return next
}

export function drawYoungLadyCard(state: GameState, targetId: string): GameState {
  if (state.phase.kind !== 'young-lady') throw new RuleError('当前不能使用大小姐效果。')
  const next = copyState(state)
  if (next.phase.kind !== 'young-lady') throw new RuleError('行动状态已经变化。')
  const actor = getPlayer(next, next.phase.actorId)
  const target = getPlayer(next, targetId)
  if (actor.id === target.id || target.hand.length <= 1) throw new RuleError('该玩家的最终身份受到保护。')
  const targetCardIndex = Math.floor(nextRandom(next) * target.hand.length)
  const targetCard = target.hand[targetCardIndex]
  target.hand.splice(targetCardIndex, 1)
  actor.hand.push(targetCard)
  next.phase = {
    kind: 'young-lady-return',
    actorId: actor.id,
    targetId: target.id,
    drawnCardUid: targetCard.uid,
  }
  addLog(next, `${actor.name} 从 ${target.name} 手中随机抽取了一张牌。`, 'quiet')
  return next
}

export function returnYoungLadyCard(state: GameState, cardUid: string): GameState {
  if (state.phase.kind !== 'young-lady-return') throw new RuleError('当前不需要归还大小姐抽取的手牌。')
  const next = copyState(state)
  if (next.phase.kind !== 'young-lady-return') throw new RuleError('行动状态已经变化。')
  const actor = getPlayer(next, next.phase.actorId)
  const target = getPlayer(next, next.phase.targetId)
  const returnedCard = removeHandCard(actor, cardUid)
  target.hand.push(returnedCard)
  addLog(next, `${actor.name} 向 ${target.name} 背面交还了一张牌。`)
  endTurnInPlace(next, actor.id)
  return next
}

// Kept as a convenience for deterministic simulations and integration tests.
export function resolveYoungLady(
  state: GameState,
  targetId: string,
  ownCardUid: string,
  _targetCardIndex?: number,
): GameState {
  return returnYoungLadyCard(drawYoungLadyCard(state, targetId), ownCardUid)
}

export function chooseClassExchange(
  state: GameState,
  targetId: string,
  ownCardUid: string,
): GameState {
  if (state.phase.kind !== 'class-pick') throw new RuleError('当前不能指定班级委员的交换对象。')
  const next = copyState(state)
  if (next.phase.kind !== 'class-pick') throw new RuleError('行动状态已经变化。')
  const actor = getPlayer(next, next.phase.actorId)
  const target = getPlayer(next, targetId)
  if (actor.id === target.id || target.hand.length <= 1) throw new RuleError('该玩家的最终身份受到保护。')
  if (!actor.hand.some((card) => card.uid === ownCardUid)) throw new RuleError('请选择要交出的手牌。')
  next.phase = {
    kind: 'class-receive',
    actorId: actor.id,
    targetId: target.id,
    actorCardUid: ownCardUid,
  }
  addLog(next, `${actor.name} 邀请 ${target.name} 与自己交换手牌。`, 'quiet')
  return next
}

export function finishClassExchange(state: GameState, targetCardUid: string): GameState {
  if (state.phase.kind !== 'class-receive') throw new RuleError('当前不需要响应班级委员。')
  const next = copyState(state)
  if (next.phase.kind !== 'class-receive') throw new RuleError('行动状态已经变化。')
  const actor = getPlayer(next, next.phase.actorId)
  const target = getPlayer(next, next.phase.targetId)
  const actorCard = removeHandCard(actor, next.phase.actorCardUid)
  const targetCard = removeHandCard(target, targetCardUid)
  actor.hand.push(targetCard)
  target.hand.push(actorCard)
  addLog(next, `${actor.name} 与 ${target.name} 完成了秘密交换。`)
  endTurnInPlace(next, actor.id)
  return next
}

export function selectNewsCard(state: GameState, playerId: string, cardUid: string): GameState {
  if (state.phase.kind !== 'news-pass') throw new RuleError('当前不在新闻部传牌阶段。')
  const next = copyState(state)
  if (next.phase.kind !== 'news-pass') throw new RuleError('行动状态已经变化。')
  const phase = next.phase
  const expectedId = phase.participants[phase.cursor]
  if (playerId !== expectedId) throw new RuleError('还没轮到这名玩家选择传牌。')
  const player = getPlayer(next, playerId)
  if (!player.hand.some((card) => card.uid === cardUid)) throw new RuleError('请选择自己的一张手牌。')
  phase.selections[playerId] = cardUid
  phase.cursor += 1

  if (phase.cursor < phase.participants.length) return next

  const passedCards = new Map<string, CardInstance>()
  phase.participants.forEach((id) => {
    passedCards.set(id, removeHandCard(getPlayer(next, id), phase.selections[id]))
  })
  phase.participants.forEach((id, index) => {
    const receiverId = phase.participants[(index + 1) % phase.participants.length]
    getPlayer(next, receiverId).hand.push(passedCards.get(id)!)
  })
  const actorId = phase.actorId
  addLog(next, '新闻部完成传递：每名行动玩家都收到了一张未知手牌。')
  endTurnInPlace(next, actorId)
  return next
}

export function moveSuspicionCard(
  state: GameState,
  sourceId: string,
  cardIndex: number,
  destinationId: string,
): GameState {
  if (state.phase.kind !== 'move-suspicion') throw new RuleError('当前不能移动质疑牌。')
  const next = copyState(state)
  if (next.phase.kind !== 'move-suspicion') throw new RuleError('行动状态已经变化。')
  if (sourceId === destinationId) throw new RuleError('请选择另一名接收者。')
  if (destinationId === next.phase.actorId) throw new RuleError('共犯不能把质疑牌移到自己面前。')
  const source = getPlayer(next, sourceId)
  const destination = getPlayer(next, destinationId)
  const entry = source.suspicion[cardIndex]
  if (!entry) throw new RuleError('该位置没有质疑牌。')
  source.suspicion.splice(cardIndex, 1)
  destination.suspicion.push(entry)
  addLog(next, `${getPlayer(next, next.phase.actorId).name} 将一张质疑牌从 ${source.name} 移到了 ${destination.name}。`)
  endTurnInPlace(next, next.phase.actorId)
  return next
}

export function retrieveInfectedCard(state: GameState, harmonyIndex: number): GameState {
  if (state.phase.kind !== 'infected-retrieve') throw new RuleError('当前不能从调和区取牌。')
  const next = copyState(state)
  if (next.phase.kind !== 'infected-retrieve') throw new RuleError('行动状态已经变化。')
  const entry = next.harmony[harmonyIndex]
  if (!entry) throw new RuleError('该位置没有调和牌。')
  next.harmony.splice(harmonyIndex, 1)
  const actor = getPlayer(next, next.phase.actorId)
  actor.hand.push(entry.card)
  addLog(next, `${actor.name} 从调和区秘密取回了一张牌。`, 'alert')
  next.phase = { kind: 'turn', actorId: actor.id }
  return next
}

export function exchangeHarmonyCard(
  state: GameState,
  ownCardUid: string,
  harmonyIndex: number,
): GameState {
  if (state.phase.kind !== 'exchange-harmony') throw new RuleError('当前不能交换调和牌。')
  const next = copyState(state)
  if (next.phase.kind !== 'exchange-harmony') throw new RuleError('行动状态已经变化。')
  const actor = getPlayer(next, next.phase.actorId)
  const ownCard = removeHandCard(actor, ownCardUid)
  const harmonyEntry = next.harmony[harmonyIndex]
  if (!harmonyEntry) throw new RuleError('该位置没有调和牌。')
  actor.hand.push(harmonyEntry.card)
  next.harmony.splice(harmonyIndex, 1, { card: ownCard, byPlayerId: actor.id })
  addLog(next, `${actor.name} 用归宅部交换了一张调和牌。`)
  endTurnInPlace(next, actor.id)
  return next
}

export function calculateSuspicion(state: GameState): Record<string, number> {
  return Object.fromEntries(
    state.players.map((player) => [
      player.id,
      Math.max(0, player.suspicion.reduce((sum, entry) => sum + CARDS[entry.card.cardId].point, 0)),
    ]),
  )
}

export function settleGame(state: GameState): GameResult {
  const harmonyTarget = HARMONY_TARGET[state.players.length]
  const harmonyPoints = state.harmony.reduce(
    (sum, entry) => sum + CARDS[entry.card.cardId].point,
    0,
  )
  const harmonySucceeded = harmonyPoints >= harmonyTarget
  const suspicionPoints = calculateSuspicion(state)
  const maximum = Math.max(...Object.values(suspicionPoints))
  const maximumPlayers = state.players.filter((player) => suspicionPoints[player.id] === maximum)
  const imprisoned =
    maximumPlayers.length === state.players.length ? [] : maximumPlayers.map((player) => player.id)
  const finalHolders = (cardIds: CardId[]) =>
    state.players
      .filter(
        (player) =>
          player.hand.length === 1 &&
          cardIds.includes(player.hand[0].cardId),
      )
      .map((player) => player.id)

  const alienWinners = state.players
    .filter(
      (player) =>
        imprisoned.includes(player.id) && player.hand.length === 1 && player.hand[0].cardId === 'alien',
    )
    .map((player) => player.id)
  if (alienWinners.length > 0) {
    return {
      winners: alienWinners,
      reason: '外星人成为了唯一最高质疑阵营，触发优先级 1。',
      harmonyPoints,
      harmonyTarget,
      harmonySucceeded,
      suspicionPoints,
      imprisoned,
    }
  }

  if (!harmonySucceeded) {
    const infectedWinners = finalHolders(['infected'])
    if (infectedWinners.length > 0) {
      return {
        winners: infectedWinners,
        reason: '调和失败，感染者触发优先级 2。',
        harmonyPoints,
        harmonyTarget,
        harmonySucceeded,
        suspicionPoints,
        imprisoned,
      }
    }
  }

  const freeCriminal = finalHolders(['criminal']).filter((id) => !imprisoned.includes(id))
  if (freeCriminal.length > 0) {
    const accomplices = finalHolders(['accomplice'])
    return {
      winners: [...freeCriminal, ...accomplices],
      reason: '犯人未被监禁，犯人阵营触发优先级 3。',
      harmonyPoints,
      harmonyTarget,
      harmonySucceeded,
      suspicionPoints,
      imprisoned,
    }
  }

  if (harmonySucceeded) {
    const goodWinners = finalHolders(GOOD_CARD_IDS)
    if (goodWinners.length > 0) {
      return {
        winners: goodWinners,
        reason: '调和成功，善方身份触发优先级 4。',
        harmonyPoints,
        harmonyTarget,
        harmonySucceeded,
        suspicionPoints,
        imprisoned,
      }
    }
  }

  const homeWinners = finalHolders(['go-home-club'])
  return {
    winners: homeWinners,
    reason:
      homeWinners.length > 0
        ? '更高优先级均未满足，归宅部触发优先级 5。'
        : '没有最终身份满足胜利条件。',
    harmonyPoints,
    harmonyTarget,
    harmonySucceeded,
    suspicionPoints,
    imprisoned,
  }
}

export function makePlacedCard(cardId: CardId, uid: string, byPlayerId = 'test'): PlacedCard {
  return { card: { cardId, uid }, byPlayerId }
}
