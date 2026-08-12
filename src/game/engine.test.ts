import { describe, expect, it } from 'vitest'

import { DECK_COUNTS } from './cards'
import {
  buildDeck,
  calculateSuspicion,
  chooseClassExchange,
  confirmPrivateResult,
  createGame,
  drawYoungLadyCard,
  exchangeHarmonyCard,
  finishClassExchange,
  inspectPlayer,
  makePlacedCard,
  moveSuspicionCard,
  playTurnAction,
  respondHonorStudent,
  returnYoungLadyCard,
  retrieveInfectedCard,
  selectNewsCard,
  settleGame,
  takePlayedCard,
} from './engine'
import type {
  CardId,
  CardInstance,
  EffectState,
  GameState,
  PlacedCard,
  Player,
  PlayerConfig,
  PlayerKind,
} from './types'
import { RuleError } from './types'

function card(cardId: CardId, uid: string = cardId): CardInstance {
  return { cardId, uid }
}

function player(
  id: string,
  cardIds: CardId[],
  kind: PlayerKind = 'human',
): Player {
  return {
    id,
    name: id.toUpperCase(),
    kind,
    hand: cardIds.map((cardId, index) => card(cardId, `${id}-${cardId}-${index}`)),
    suspicion: [],
    intel: [],
  }
}

function stateWith(
  players: Player[],
  phase: EffectState = { kind: 'turn', actorId: players[0].id },
  overrides: Partial<GameState> = {},
): GameState {
  return {
    version: 1,
    status: 'playing',
    players,
    harmony: [],
    played: [],
    unused: [],
    phase,
    firstPlayerId: players[0].id,
    currentPlayerId: phase.actorId,
    pendingInfected: [],
    turn: 1,
    rngSeed: 123,
    log: [],
    result: null,
    ...overrides,
  }
}

function placed(cardId: CardId, uid: string, byPlayerId = 'p1'): PlacedCard {
  return makePlacedCard(cardId, uid, byPlayerId)
}

function finalState(
  finalCards: CardId[],
  harmony: CardId[] = [],
  suspicion: Partial<Record<number, CardId[]>> = {},
): GameState {
  const players = finalCards.map((cardId, index) => player(`p${index + 1}`, [cardId]))
  Object.entries(suspicion).forEach(([rawIndex, cardIds]) => {
    const index = Number(rawIndex)
    players[index].suspicion = (cardIds ?? []).map((cardId, cardIndex) =>
      placed(cardId, `suspicion-${index}-${cardIndex}`),
    )
  })
  return stateWith(players, { kind: 'turn', actorId: players[0].id }, {
    harmony: harmony.map((cardId, index) => placed(cardId, `harmony-${index}`)),
  })
}

describe('deck creation and dealing', () => {
  const deckSizes: Record<number, number> = { 3: 18, 4: 24, 5: 25, 6: 24 }

  it.each([3, 4, 5, 6])('builds the exact %i-player deck deterministically', (playerCount) => {
    const expectedCounts = DECK_COUNTS[playerCount]
    const expectedSize = Object.values(expectedCounts).reduce<number>(
      (sum, count) => sum + (count ?? 0),
      0,
    )
    const deck = buildDeck(playerCount, 20260711)

    expect(expectedSize).toBe(deckSizes[playerCount])
    expect(deck).toHaveLength(expectedSize)
    expect(new Set(deck.map(({ uid }) => uid)).size).toBe(expectedSize)
    expect(buildDeck(playerCount, 20260711)).toEqual(deck)
    Object.entries(expectedCounts).forEach(([cardId, count]) => {
      expect(deck.filter((entry) => entry.cardId === cardId)).toHaveLength(count ?? 0)
    })
  })

  it.each([3, 4, 5, 6])('deals the full deck evenly to %i players', (playerCount) => {
    const configs: PlayerConfig[] = Array.from({ length: playerCount }, (_, index) => ({
      id: `p${index + 1}`,
      name: ` Player ${index + 1} `,
      kind: index === 0 ? 'human' : 'ai',
    }))
    const game = createGame(configs, 99 + playerCount)
    const allCards = [
      ...game.players.flatMap(({ hand }) => hand),
      ...game.unused,
    ]

    expect(new Set(game.players.map(({ hand }) => hand.length))).toEqual(new Set([
      deckSizes[playerCount] / playerCount,
    ]))
    expect(game.unused).toEqual([])
    expect(new Set(allCards.map(({ uid }) => uid)).size).toBe(allCards.length)
    expect(game.players.find(({ id }) => id === game.firstPlayerId)?.hand)
      .toEqual(expect.arrayContaining([expect.objectContaining({ cardId: 'student-president' })]))
    expect(game.currentPlayerId).toBe(game.firstPlayerId)
    expect(game.phase).toEqual({ kind: 'turn', actorId: game.firstPlayerId })
    expect(game.players[0].name).toBe('Player 1')
  })

  it('rejects unsupported player counts and blank names', () => {
    expect(() => buildDeck(2)).toThrow(RuleError)
    expect(() => createGame([
      { id: 'p1', name: 'A', kind: 'human' },
      { id: 'p2', name: 'B', kind: 'ai' },
      { id: 'p3', name: ' ', kind: 'ai' },
    ], 1)).toThrow(RuleError)
  })
})

describe('normal turn actions', () => {
  it.each(['harmony', 'suspicion', 'ability'] as const)(
    'never permits the criminal card to be used as %s',
    (use) => {
      const game = stateWith([
        player('p1', ['criminal', 'library-committee']),
        player('p2', ['student-president', 'library-committee']),
        player('p3', ['student-president']),
      ])
      const original = structuredClone(game)

      expect(() => playTurnAction(game, {
        cardUid: game.players[0].hand[0].uid,
        use,
        targetPlayerId: use === 'suspicion' ? 'p2' : undefined,
      })).toThrow(RuleError)
      expect(game).toEqual(original)
    },
  )

  it('places a card into harmony and advances without mutating the input state', () => {
    const game = stateWith([
      player('p1', ['student-president', 'criminal']),
      player('p2', ['library-committee', 'go-home-club']),
      player('p3', ['infected']),
    ])
    const usedCard = game.players[0].hand[0]

    const next = playTurnAction(game, { cardUid: usedCard.uid, use: 'harmony' })

    expect(next.harmony).toEqual([{ card: usedCard, byPlayerId: 'p1' }])
    expect(next.players[0].hand.map(({ cardId }) => cardId)).toEqual(['criminal'])
    expect(next.phase).toEqual({ kind: 'turn', actorId: 'p2' })
    expect(next.turn).toBe(2)
    expect(game.harmony).toEqual([])
    expect(game.players[0].hand).toHaveLength(2)
  })

  it('places suspicion only on another player and totals card points with a zero floor', () => {
    const game = stateWith([
      player('p1', ['class-representative', 'criminal']),
      player('p2', ['library-committee', 'go-home-club']),
      player('p3', ['infected']),
    ])
    const usedCard = game.players[0].hand[0]

    expect(() => playTurnAction(game, {
      cardUid: usedCard.uid,
      use: 'suspicion',
      targetPlayerId: 'p1',
    })).toThrow(RuleError)

    const next = playTurnAction(game, {
      cardUid: usedCard.uid,
      use: 'suspicion',
      targetPlayerId: 'p2',
    })
    next.players[1].suspicion.push(placed('alien', 'negative'))
    next.players[2].suspicion.push(placed('alien', 'only-negative'))

    expect(next.players[1].suspicion[0]).toEqual({ card: usedCard, byPlayerId: 'p1' })
    expect(calculateSuspicion(next)).toEqual({ p1: 0, p2: 1, p3: 0 })
  })
})

describe('special abilities', () => {
  it('lets health committee retrieve an older public card', () => {
    const game = stateWith([
      player('p1', ['health-committee', 'criminal']),
      player('p2', ['library-committee', 'go-home-club']),
      player('p3', ['infected']),
    ], undefined, {
      played: [
        placed('honor-student', 'own-public', 'p1'),
        placed('health-committee', 'other-health', 'p2'),
        placed('honor-student', 'old-public', 'p2'),
      ],
    })

    const pending = playTurnAction(game, {
      cardUid: game.players[0].hand[0].uid,
      use: 'ability',
    })
    expect(pending.phase).toEqual({
      kind: 'take-played',
      actorId: 'p1',
      playedCardUid: game.players[0].hand[0].uid,
    })
    expect(() => takePlayedCard(pending, 'own-public')).toThrow(RuleError)
    expect(() => takePlayedCard(pending, 'other-health')).toThrow(RuleError)
    expect(() => takePlayedCard(pending, game.players[0].hand[0].uid)).toThrow(RuleError)

    const next = takePlayedCard(pending, 'old-public')
    expect(next.players[0].hand.map(({ cardId }) => cardId)).toEqual([
      'criminal',
      'honor-student',
    ])
    expect(next.played.map(({ card }) => card.uid)).toEqual([
      'own-public',
      'other-health',
      game.players[0].hand[0].uid,
    ])
  })

  it('records discipline committee and library committee inspections before confirmation', () => {
    const disciplineGame = stateWith([
      player('p1', ['discipline-committee', 'criminal']),
      player('p2', ['alien', 'go-home-club']),
      player('p3', ['infected']),
    ])
    const inspectPending = playTurnAction(disciplineGame, {
      cardUid: disciplineGame.players[0].hand[0].uid,
      use: 'ability',
    })
    const inspected = inspectPlayer(inspectPending, 'p2')

    expect(inspected.phase).toMatchObject({
      kind: 'inspect-result',
      actorId: 'p1',
      targetId: 'p2',
      cardIds: ['alien', 'go-home-club'],
    })
    expect(inspected.players[0].intel[0].cardIds).toEqual(['alien', 'go-home-club'])
    expect(confirmPrivateResult(inspected).phase).toEqual({ kind: 'turn', actorId: 'p2' })

    const libraryGame = stateWith([
      player('p1', ['library-committee', 'criminal']),
      player('p2', ['library-committee', 'go-home-club']),
      player('p3', ['infected']),
    ], undefined, {
      harmony: [placed('student-president', 'h-1'), placed('alien', 'h-2')],
    })
    const libraryPending = playTurnAction(libraryGame, {
      cardUid: libraryGame.players[0].hand[0].uid,
      use: 'ability',
    })

    expect(libraryPending.phase).toMatchObject({
      kind: 'inspect-harmony',
      cardIds: ['student-president', 'alien'],
    })
    expect(libraryPending.players[0].intel[0].cardIds).toEqual([
      'student-president',
      'alien',
    ])
    expect(libraryPending.harmony.map(({ card }) => card.uid)).toEqual(['h-1', 'h-2'])
  })

  it('makes the criminal signal to honor student and lets the alien impersonate', () => {
    const game = stateWith([
      player('p1', ['honor-student', 'library-committee']),
      player('p2', ['criminal', 'go-home-club']),
      player('p3', ['alien', 'infected']),
    ])
    const pending = playTurnAction(game, {
      cardUid: game.players[0].hand[0].uid,
      use: 'ability',
    })

    expect(pending.phase).toEqual({
      kind: 'honor-alien-choice',
      actorId: 'p1',
      alienPlayerId: 'p3',
      signaledPlayerIds: ['p2'],
    })

    const declined = respondHonorStudent(pending, false)
    expect(declined.phase).toEqual({
      kind: 'honor-result',
      actorId: 'p1',
      signaledPlayerIds: ['p2'],
    })

    const impersonated = respondHonorStudent(pending, true)
    expect(impersonated.phase).toEqual({
      kind: 'honor-result',
      actorId: 'p1',
      signaledPlayerIds: ['p2', 'p3'],
    })
    expect(impersonated.players[0].intel[0].title).toContain('P2、P3')
    expect(confirmPrivateResult(impersonated).phase).toEqual({ kind: 'turn', actorId: 'p2' })
  })

  it('signals a criminal-alien holder once without an extra impersonation phase', () => {
    const game = stateWith([
      player('p1', ['honor-student', 'library-committee']),
      player('p2', ['criminal', 'alien', 'go-home-club']),
      player('p3', ['infected', 'student-president']),
    ])

    const result = playTurnAction(game, {
      cardUid: game.players[0].hand[0].uid,
      use: 'ability',
    })

    expect(result.phase).toEqual({
      kind: 'honor-result',
      actorId: 'p1',
      signaledPlayerIds: ['p2'],
    })
    if (result.phase.kind !== 'honor-result') throw new Error('Expected honor-result')
    expect(result.phase.signaledPlayerIds.filter((id) => id === 'p2')).toHaveLength(1)
    expect(result.players[0].intel[0].title).toBe('优等生示意：P2')
    expect(confirmPrivateResult(result).phase).toEqual({ kind: 'turn', actorId: 'p2' })
  })

  it('lets young lady draw randomly and then choose a card to return', () => {
    const youngLadyGame = stateWith([
      player('p1', ['young-lady', 'library-committee']),
      player('p2', ['alien', 'go-home-club']),
      player('p3', ['infected']),
    ])
    const youngLadyPending = playTurnAction(youngLadyGame, {
      cardUid: youngLadyGame.players[0].hand[0].uid,
      use: 'ability',
    })
    const drawn = drawYoungLadyCard(youngLadyPending, 'p2')
    expect(drawn.phase.kind).toBe('young-lady-return')
    if (drawn.phase.kind !== 'young-lady-return') throw new Error('Expected young-lady-return')
    expect(drawn.players[0].hand.map(({ uid }) => uid)).toContain(drawn.phase.drawnCardUid)
    expect(drawn.players[1].hand).toHaveLength(1)

    const returnedOwnCard = returnYoungLadyCard(
      drawn,
      youngLadyPending.players[0].hand[0].uid,
    )
    expect(returnedOwnCard.players[0].hand.map(({ uid }) => uid)).toEqual([
      drawn.phase.drawnCardUid,
    ])
    expect(returnedOwnCard.players[1].hand.map(({ cardId }) => cardId)).toContain(
      'library-committee',
    )

    const returnedDrawnCard = returnYoungLadyCard(drawn, drawn.phase.drawnCardUid)
    expect(returnedDrawnCard.players[0].hand.map(({ cardId }) => cardId)).toEqual([
      'library-committee',
    ])
    expect(returnedDrawnCard.players[1].hand.map(({ cardId }) => cardId).sort()).toEqual([
      'alien',
      'go-home-club',
    ])
  })

  it('resolves class representative exchange without exposing cards', () => {

    const classGame = stateWith([
      player('p1', ['class-representative', 'library-committee']),
      player('p2', ['alien', 'go-home-club']),
      player('p3', ['infected']),
    ])
    const classPending = playTurnAction(classGame, {
      cardUid: classGame.players[0].hand[0].uid,
      use: 'ability',
    })
    const targetPending = chooseClassExchange(
      classPending,
      'p2',
      classPending.players[0].hand[0].uid,
    )
    expect(targetPending.phase).toMatchObject({ kind: 'class-receive', targetId: 'p2' })

    const classNext = finishClassExchange(targetPending, targetPending.players[1].hand[0].uid)
    expect(classNext.players[0].hand.map(({ cardId }) => cardId)).toEqual(['alien'])
    expect(classNext.players[1].hand.map(({ cardId }) => cardId)).toEqual([
      'go-home-club',
      'library-committee',
    ])
  })

  it('passes news club selections clockwise among active players only', () => {
    const game = stateWith([
      player('p1', ['news-club', 'library-committee']),
      player('p2', ['alien', 'go-home-club']),
      player('p3', ['infected']),
    ])
    let next = playTurnAction(game, {
      cardUid: game.players[0].hand[0].uid,
      use: 'ability',
    })
    expect(next.phase).toMatchObject({
      kind: 'news-pass',
      participants: ['p1', 'p2'],
      cursor: 0,
    })

    const p1Passed = next.players[0].hand[0]
    next = selectNewsCard(next, 'p1', p1Passed.uid)
    expect(() => selectNewsCard(next, 'p1', p1Passed.uid)).toThrow(RuleError)
    const p2Passed = next.players[1].hand[0]
    next = selectNewsCard(next, 'p2', p2Passed.uid)

    expect(next.players[0].hand).toEqual([p2Passed])
    expect(next.players[1].hand.map(({ cardId }) => cardId)).toEqual([
      'go-home-club',
      'library-committee',
    ])
    expect(next.players[2].hand.map(({ cardId }) => cardId)).toEqual(['infected'])
  })

  it('moves an existing suspicion card with accomplice', () => {
    const players = [
      player('p1', ['accomplice', 'criminal']),
      player('p2', ['library-committee', 'go-home-club']),
      player('p3', ['infected']),
    ]
    players[1].suspicion = [placed('student-president', 'suspect-card', 'p3')]
    const game = stateWith(players)
    const pending = playTurnAction(game, {
      cardUid: game.players[0].hand[0].uid,
      use: 'ability',
    })

    const next = moveSuspicionCard(pending, 'p2', 0, 'p3')
    expect(next.players[1].suspicion).toEqual([])
    expect(next.players[2].suspicion).toEqual([
      placed('student-president', 'suspect-card', 'p3'),
    ])
  })

  it('schedules infected retrieval for the actor next turn', () => {
    let game = stateWith([
      player('p1', ['infected', 'library-committee', 'criminal']),
      player('p2', ['student-president', 'go-home-club']),
      player('p3', ['student-president', 'alien']),
    ], undefined, { harmony: [placed('student-president', 'harmony-secret', 'p2')] })

    game = playTurnAction(game, { cardUid: game.players[0].hand[0].uid, use: 'ability' })
    expect(game.pendingInfected).toEqual(['p1'])
    game = playTurnAction(game, { cardUid: game.players[1].hand[0].uid, use: 'ability' })
    game = playTurnAction(game, { cardUid: game.players[2].hand[0].uid, use: 'ability' })

    expect(game.phase).toEqual({ kind: 'infected-retrieve', actorId: 'p1' })
    expect(game.pendingInfected).toEqual([])
    const next = retrieveInfectedCard(game, 0)
    expect(next.phase).toEqual({ kind: 'turn', actorId: 'p1' })
    expect(next.harmony).toEqual([])
    expect(next.players[0].hand.map(({ uid }) => uid)).toContain('harmony-secret')
  })

  it('does not trigger infected retrieval after its public card is removed', () => {
    let game = stateWith([
      player('p1', ['infected', 'library-committee', 'criminal']),
      player('p2', ['health-committee', 'student-president']),
      player('p3', ['student-president', 'alien']),
    ], undefined, { harmony: [placed('student-president', 'harmony-secret', 'p2')] })

    game = playTurnAction(game, { cardUid: game.players[0].hand[0].uid, use: 'ability' })
    const infectedUid = game.played.find(({ card }) => card.cardId === 'infected')?.card.uid
    expect(infectedUid).toBeDefined()

    game = playTurnAction(game, { cardUid: game.players[1].hand[0].uid, use: 'ability' })
    game = takePlayedCard(game, infectedUid!)
    game = playTurnAction(game, { cardUid: game.players[2].hand[0].uid, use: 'ability' })

    expect(game.phase).toEqual({ kind: 'turn', actorId: 'p1' })
    expect(game.pendingInfected).toEqual([])
    expect(game.harmony.map(({ card }) => card.uid)).toEqual(['harmony-secret'])
  })

  it('exchanges a harmony card in place for go-home club', () => {
    const game = stateWith([
      player('p1', ['go-home-club', 'library-committee']),
      player('p2', ['alien', 'student-president']),
      player('p3', ['infected']),
    ], undefined, {
      harmony: [
        placed('student-president', 'harmony-first', 'p2'),
        placed('honor-student', 'harmony-card', 'p2'),
        placed('alien', 'harmony-last', 'p3'),
      ],
    })
    const pending = playTurnAction(game, {
      cardUid: game.players[0].hand[0].uid,
      use: 'ability',
    })
    const ownCard = pending.players[0].hand[0]

    const next = exchangeHarmonyCard(pending, ownCard.uid, 1)
    expect(next.players[0].hand.map(({ uid }) => uid)).toEqual(['harmony-card'])
    expect(next.harmony.map(({ card }) => card.uid)).toEqual([
      'harmony-first',
      ownCard.uid,
      'harmony-last',
    ])
    expect(next.harmony[1]).toEqual({ card: ownCard, byPlayerId: 'p1' })
  })
})

describe('five-level victory priority', () => {
  it('priority 1: an imprisoned alien overrides every other satisfied condition', () => {
    const result = settleGame(finalState(
      ['alien', 'criminal', 'student-president'],
      ['student-president', 'student-president', 'student-president'],
      { 0: ['student-president'] },
    ))

    expect(result.winners).toEqual(['p1'])
    expect(result.imprisoned).toEqual(['p1'])
    expect(result.harmonySucceeded).toBe(true)
    expect(result.reason).toContain('优先级 1')
  })

  it('priority 2: an infected wins on failed harmony even while imprisoned', () => {
    const result = settleGame(finalState(
      ['infected', 'criminal', 'go-home-club'],
      [],
      { 0: ['student-president'] },
    ))

    expect(result.winners).toEqual(['p1'])
    expect(result.imprisoned).toEqual(['p1'])
    expect(result.harmonySucceeded).toBe(false)
    expect(result.reason).toContain('优先级 2')
  })

  it('priority 3: a free criminal wins with an accomplice even when the accomplice is imprisoned', () => {
    const result = settleGame(finalState(
      ['criminal', 'accomplice', 'student-president', 'go-home-club'],
      ['student-president', 'student-president', 'student-president'],
      { 1: ['student-president'] },
    ))

    expect(result.winners).toEqual(['p1', 'p2'])
    expect(result.imprisoned).toEqual(['p2'])
    expect(result.harmonySucceeded).toBe(true)
    expect(result.reason).toContain('优先级 3')
  })

  it('priority 4: successful harmony rewards a good identity even while imprisoned', () => {
    const result = settleGame(finalState(
      ['criminal', 'student-president', 'go-home-club'],
      ['student-president', 'student-president', 'student-president'],
      { 0: ['student-president'], 1: ['student-president'] },
    ))

    expect(result.winners).toEqual(['p2'])
    expect(result.imprisoned).toEqual(['p1', 'p2'])
    expect(result.reason).toContain('优先级 4')
  })

  it('priority 5: go-home club can win while imprisoned when no higher condition is met', () => {
    const result = settleGame(finalState(
      ['criminal', 'go-home-club', 'alien'],
      [],
      { 0: ['student-president'], 1: ['student-president'] },
    ))

    expect(result.winners).toEqual(['p2'])
    expect(result.imprisoned).toEqual(['p1', 'p2'])
    expect(result.reason).toContain('优先级 5')
  })
})
