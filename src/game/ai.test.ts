import { describe, expect, it } from 'vitest'

import { runAiStep } from './ai'
import { createGame, getDecisionPlayerId, makePlacedCard } from './engine'
import type {
  CardId,
  EffectState,
  GameState,
  Player,
  PlayerConfig,
  PlayerKind,
} from './types'

function player(id: string, cardIds: CardId[], kind: PlayerKind = 'ai'): Player {
  return {
    id,
    name: id.toUpperCase(),
    kind,
    hand: cardIds.map((cardId, index) => ({
      cardId,
      uid: `${id}-${cardId}-${index}`,
    })),
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
    rngSeed: 731,
    log: [],
    result: null,
    ...overrides,
  }
}

describe('AI progression', () => {
  it('does not act for a human decision or a finished game', () => {
    const humanTurn = stateWith([
      player('p1', ['library-committee', 'criminal'], 'human'),
      player('p2', ['student-president', 'go-home-club']),
      player('p3', ['infected']),
    ])
    expect(runAiStep(humanTurn)).toBe(humanTurn)

    const finished = { ...humanTurn, status: 'finished' as const }
    expect(runAiStep(finished)).toBe(finished)
  })

  it('uses a legal expendable card while preserving criminal as the final identity', () => {
    const game = stateWith([
      player('p1', ['library-committee', 'criminal']),
      player('p2', ['student-president', 'go-home-club']),
      player('p3', ['infected']),
    ])

    const next = runAiStep(game)

    expect(next).not.toBe(game)
    expect(next.players[0].hand.map(({ cardId }) => cardId)).toEqual(['criminal'])
    expect(game.players[0].hand.map(({ cardId }) => cardId)).toEqual([
      'library-committee',
      'criminal',
    ])
    expect([
      ...next.harmony,
      ...next.played,
      ...next.players.flatMap(({ suspicion }) => suspicion),
    ].map(({ card }) => card.cardId)).toContain('library-committee')
  })

  it('makes the same normal-turn choice when only opponents hidden cards change', () => {
    const game = stateWith([
      player('p1', ['student-president', 'go-home-club', 'criminal']),
      player('p2', ['alien', 'infected']),
      player('p3', ['accomplice', 'library-committee']),
    ], undefined, {
      harmony: [makePlacedCard('honor-student', 'hidden-harmony', 'p2')],
    })
    game.players[1].suspicion = [makePlacedCard('young-lady', 'p2-suspicion', 'p3')]

    const hiddenVariant = structuredClone(game)
    hiddenVariant.players[1].hand = hiddenVariant.players[1].hand.map((entry, index) => ({
      ...entry,
      cardId: index === 0 ? 'student-president' : 'news-club',
    }))
    hiddenVariant.players[2].hand = hiddenVariant.players[2].hand.map((entry, index) => ({
      ...entry,
      cardId: index === 0 ? 'young-lady' : 'discipline-committee',
    }))
    hiddenVariant.harmony[0] = {
      ...hiddenVariant.harmony[0],
      card: { ...hiddenVariant.harmony[0].card, cardId: 'alien' },
    }

    expect(hiddenVariant.players.map(({ hand }) => hand.length)).toEqual(
      game.players.map(({ hand }) => hand.length),
    )
    expect(hiddenVariant.players.map(({ suspicion }) => suspicion.length)).toEqual(
      game.players.map(({ suspicion }) => suspicion.length),
    )
    expect(hiddenVariant.harmony).toHaveLength(game.harmony.length)

    const normalTurnChoice = (before: GameState, after: GameState) => {
      if (before.phase.kind !== 'turn') throw new Error('Expected a normal turn')
      const actorBefore = before.players.find(({ id }) => id === before.phase.actorId)!
      const actorAfter = after.players.find(({ id }) => id === before.phase.actorId)!
      const usedCard = actorBefore.hand.find(
        ({ uid }) => !actorAfter.hand.some((candidate) => candidate.uid === uid),
      )!
      const suspicionTarget = after.players.find((candidate) =>
        candidate.suspicion.some(({ card }) => card.uid === usedCard.uid),
      )
      const use = after.harmony.some(({ card }) => card.uid === usedCard.uid)
        ? 'harmony'
        : after.played.some(({ card }) => card.uid === usedCard.uid)
          ? 'ability'
          : 'suspicion'

      return {
        cardUid: usedCard.uid,
        use,
        targetPlayerId: suspicionTarget?.id,
      }
    }

    expect(normalTurnChoice(game, runAiStep(game))).toEqual(
      normalTurnChoice(hiddenVariant, runAiStep(hiddenVariant)),
    )
  })

  it('hands a class representative response to the target AI and completes the exchange', () => {
    const game = stateWith([
      player('p1', ['library-committee']),
      player('p2', ['student-president', 'go-home-club']),
      player('p3', ['alien', 'infected']),
    ], {
      kind: 'class-pick',
      actorId: 'p2',
    }, { currentPlayerId: 'p2' })

    const waitingForTarget = runAiStep(game)
    expect(waitingForTarget.phase.kind).toBe('class-receive')
    expect(getDecisionPlayerId(waitingForTarget)).toBe(
      waitingForTarget.phase.kind === 'class-receive' ? waitingForTarget.phase.targetId : null,
    )

    const exchanged = runAiStep(waitingForTarget)
    expect(exchanged.phase.kind).not.toBe('class-receive')
    expect(exchanged.players.map(({ hand }) => hand.length)).toEqual([1, 2, 2])
  })

  it('advances each AI participant through a news club pass', () => {
    let game = stateWith([
      player('p1', ['library-committee', 'criminal']),
      player('p2', ['student-president', 'go-home-club']),
      player('p3', ['alien', 'infected']),
    ], {
      kind: 'news-pass',
      actorId: 'p1',
      participants: ['p1', 'p2', 'p3'],
      cursor: 0,
      selections: {},
    })
    const originalHands = game.players.map(({ hand }) => hand.map(({ uid }) => uid))

    expect(getDecisionPlayerId(game)).toBe('p1')
    game = runAiStep(game)
    expect(getDecisionPlayerId(game)).toBe('p2')
    game = runAiStep(game)
    expect(getDecisionPlayerId(game)).toBe('p3')
    game = runAiStep(game)

    expect(game.phase.kind).not.toBe('news-pass')
    expect(game.players.map(({ hand }) => hand.length)).toEqual([2, 2, 2])
    expect(game.players.map(({ hand }) => hand.map(({ uid }) => uid))).not.toEqual(originalHands)
  })

  it('advances young lady through random draw and selected return', () => {
    const game = stateWith([
      player('p1', ['library-committee', 'criminal']),
      player('p2', ['alien', 'go-home-club']),
      player('p3', ['infected']),
    ], { kind: 'young-lady', actorId: 'p1' })

    const drawn = runAiStep(game)
    expect(drawn.phase.kind).toBe('young-lady-return')
    expect(drawn.players.map(({ hand }) => hand.length)).toEqual([3, 1, 1])

    const returned = runAiStep(drawn)
    expect(returned.phase.kind).not.toBe('young-lady-return')
    expect(returned.players.map(({ hand }) => hand.length)).toEqual([2, 2, 1])
    expect(returned.players[0].hand.map(({ cardId }) => cardId)).toContain('criminal')
  })

  it('lets an alien AI answer honor student before the actor confirms the result', () => {
    const game = stateWith([
      player('p1', ['library-committee', 'criminal']),
      player('p2', ['go-home-club', 'infected']),
      player('p3', ['alien', 'student-president']),
    ], {
      kind: 'honor-alien-choice',
      actorId: 'p1',
      alienPlayerId: 'p3',
      signaledPlayerIds: ['p2'],
    })

    expect(getDecisionPlayerId(game)).toBe('p3')
    const answered = runAiStep(game)
    expect(answered.phase).toMatchObject({
      kind: 'honor-result',
      actorId: 'p1',
    })
    expect(getDecisionPlayerId(answered)).toBe('p1')

    const confirmed = runAiStep(answered)
    expect(confirmed.phase).toEqual({ kind: 'turn', actorId: 'p2' })
  })

  it('resolves pending retrieval and harmony exchange phases', () => {
    const infectedGame = stateWith([
      player('p1', ['infected', 'criminal']),
      player('p2', ['student-president', 'go-home-club']),
      player('p3', ['alien']),
    ], { kind: 'infected-retrieve', actorId: 'p1' }, {
      harmony: [makePlacedCard('honor-student', 'harmony-1')],
      played: [makePlacedCard('infected', 'played-infected', 'p1')],
    })
    const retrieved = runAiStep(infectedGame)
    expect(retrieved.phase).toEqual({ kind: 'turn', actorId: 'p1' })
    expect(retrieved.harmony).toEqual([])
    expect(retrieved.players[0].hand.map(({ uid }) => uid)).toContain('harmony-1')

    const exchangeGame = stateWith([
      player('p1', ['library-committee', 'criminal']),
      player('p2', ['student-president', 'go-home-club']),
      player('p3', ['alien']),
    ], { kind: 'exchange-harmony', actorId: 'p1' }, {
      harmony: [makePlacedCard('honor-student', 'harmony-2')],
    })
    const exchanged = runAiStep(exchangeGame)
    expect(exchanged.harmony[0].card.cardId).toBe('library-committee')
    expect(exchanged.players[0].hand.map(({ cardId }) => cardId)).toContain('honor-student')
    expect(exchanged.players[0].hand.map(({ cardId }) => cardId)).toContain('criminal')
  })

  it.each([3, 4, 5, 6])('can finish a deterministic all-AI %i-player game', (playerCount) => {
    const configs: PlayerConfig[] = Array.from({ length: playerCount }, (_, index) => ({
      id: `p${index + 1}`,
      name: `AI ${index + 1}`,
      kind: 'ai',
    }))
    let game = createGame(configs, 4000 + playerCount)
    let steps = 0

    while (game.status === 'playing' && steps < 500) {
      const next = runAiStep(game)
      expect(next).not.toBe(game)
      game = next
      steps += 1
    }

    expect(steps).toBeLessThan(500)
    expect(game.status).toBe('finished')
    expect(game.result).not.toBeNull()
    expect(game.players.every(({ hand }) => hand.length === 1)).toBe(true)
  })
})
