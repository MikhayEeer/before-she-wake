import { describe, expect, it } from 'vitest'

import type {
  CardId,
  EffectState,
  GameResult,
  GameState,
  Player,
} from '../src/game/types'
import { cardHandle, projectGame } from './project-view'

const ROOM_SECRET = 'test-room-secret-that-never-leaves-the-server'

function player(
  id: string,
  cards: Array<[CardId, string]>,
  intel: Player['intel'] = [],
): Player {
  return {
    id,
    name: id.toUpperCase(),
    kind: 'human',
    hand: cards.map(([cardId, uid]) => ({ cardId, uid })),
    suspicion: [],
    intel,
  }
}

function gameState(
  phase: EffectState = { kind: 'turn', actorId: 'p1' },
  overrides: Partial<GameState> = {},
): GameState {
  const players = [
    player('p1', [
      ['student-president', 'raw-self-student-uid'],
      ['criminal', 'raw-self-criminal-uid'],
    ], [{
      id: 'intel-4-987654321-alien',
      turn: 4,
      title: '只属于 P1 的线索',
      cardIds: ['alien'],
    }]),
    player('p2', [
      ['alien', 'raw-other-alien-uid'],
      ['go-home-club', 'raw-other-home-uid'],
    ], [{
      id: 'raw-other-intel-id',
      turn: 3,
      title: '不能发给 P1',
      cardIds: ['criminal'],
    }]),
    player('p3', [
      ['infected', 'raw-third-infected-uid'],
      ['library-committee', 'raw-third-library-uid'],
    ]),
  ]
  players[1].suspicion.push({
    card: { cardId: 'honor-student', uid: 'raw-suspicion-uid' },
    byPlayerId: 'p1',
  })

  return {
    version: 1,
    status: 'playing',
    players,
    harmony: [{
      card: { cardId: 'health-committee', uid: 'raw-harmony-uid' },
      byPlayerId: 'p2',
    }],
    played: [{
      card: { cardId: 'news-club', uid: 'raw-played-uid' },
      byPlayerId: 'p3',
    }],
    unused: [{ cardId: 'young-lady', uid: 'raw-unused-uid' }],
    phase,
    firstPlayerId: 'p1',
    currentPlayerId: phase.actorId,
    pendingInfected: ['p3'],
    turn: 4,
    rngSeed: 987654321,
    log: [{
      id: 'log-4-0-987654321',
      turn: 4,
      text: 'P3 发动了新闻部。',
      tone: 'normal',
    }],
    result: null,
    ...overrides,
  }
}

describe('projectGame', () => {
  it('keeps only the viewer private data and replaces every real card uid', () => {
    const state = gameState()
    const projection = projectGame(state, 'p1', ROOM_SECRET, 12)
    const serialized = JSON.stringify(projection)
    const self = projection.game.players[0]
    const other = projection.game.players[1]

    expect(projection.decisionPlayerId).toBe('p1')
    expect(projection.canAct).toBe(true)
    expect(self.hand).toEqual([
      {
        uid: cardHandle(ROOM_SECRET, 'p1', 'raw-self-student-uid'),
        cardId: 'student-president',
        hidden: false,
      },
      {
        uid: cardHandle(ROOM_SECRET, 'p1', 'raw-self-criminal-uid'),
        cardId: 'criminal',
        hidden: false,
      },
    ])
    expect(self.intel).toMatchObject([{
      title: '只属于 P1 的线索',
      cardIds: ['alien'],
    }])
    expect(self.intel[0].id).not.toBe(state.players[0].intel[0].id)

    expect(other.hand).toHaveLength(state.players[1].hand.length)
    expect(other.hand.every((card) => card.hidden)).toBe(true)
    expect(other.hand.every((card) => !('cardId' in card))).toBe(true)
    expect(other.intel).toEqual([])
    expect(projection.game.harmony[0].card).not.toHaveProperty('cardId')
    expect(projection.game.players[1].suspicion[0].card).not.toHaveProperty('cardId')
    expect(projection.game.played[0].card).toMatchObject({
      cardId: 'news-club',
      hidden: false,
    })
    expect(projection.game.played[0].card.uid).not.toBe('raw-played-uid')
    expect(projection.game.log[0].id).not.toBe('log-4-0-987654321')

    expect(projection.game).not.toHaveProperty('version')
    expect(projection.game).not.toHaveProperty('unused')
    expect(projection.game).not.toHaveProperty('pendingInfected')
    expect(projection.game).not.toHaveProperty('rngSeed')
    ;[
      'raw-self-student-uid',
      'raw-self-criminal-uid',
      'raw-other-alien-uid',
      'raw-other-home-uid',
      'raw-third-infected-uid',
      'raw-third-library-uid',
      'raw-suspicion-uid',
      'raw-harmony-uid',
      'raw-played-uid',
      'raw-unused-uid',
      'raw-other-intel-id',
      'log-4-0-987654321',
    ].forEach((secretValue) => expect(serialized).not.toContain(secretValue))
  })

  it('uses viewer-bound deterministic HMAC handles', () => {
    const first = cardHandle(ROOM_SECRET, 'p1', 'raw-card-uid')
    const repeated = cardHandle(ROOM_SECRET, 'p1', 'raw-card-uid')
    const anotherViewer = cardHandle(ROOM_SECRET, 'p2', 'raw-card-uid')
    const anotherRoom = cardHandle('another-room-secret', 'p1', 'raw-card-uid')

    expect(first).toBe(repeated)
    expect(first).not.toContain('raw-card-uid')
    expect(anotherViewer).not.toBe(first)
    expect(anotherRoom).not.toBe(first)
  })

  it('does not expose a stale result before the game is finished', () => {
    const staleResult: GameResult = {
      winners: ['p2'],
      reason: '不应提前公开',
      harmonyPoints: 2,
      harmonyTarget: 9,
      harmonySucceeded: false,
      suspicionPoints: { p1: 0, p2: 8, p3: 0 },
      imprisoned: ['p2'],
    }

    expect(projectGame(
      gameState(undefined, { result: staleResult }),
      'p1',
      ROOM_SECRET,
      1,
    ).game.result).toBeNull()
  })

  it('removes news-pass selections and their private card handles', () => {
    const state = gameState({
      kind: 'news-pass',
      actorId: 'p1',
      participants: ['p1', 'p2', 'p3'],
      cursor: 2,
      selections: {
        p1: 'raw-news-selection-one',
        p2: 'raw-news-selection-two',
      },
    })
    const projection = projectGame(state, 'p3', ROOM_SECRET, 8)

    expect(projection.game.phase).toEqual({
      kind: 'news-pass',
      actorId: 'p1',
      participants: ['p1', 'p2', 'p3'],
      cursor: 2,
      selections: {},
    })
    expect(JSON.stringify(projection)).not.toContain('raw-news-selection')
  })

  it.each([
    {
      phase: {
        kind: 'inspect-result',
        actorId: 'p1',
        targetId: 'p2',
        cardIds: ['alien', 'go-home-club'],
      } satisfies EffectState,
      field: 'cardIds',
      expected: ['alien', 'go-home-club'],
    },
    {
      phase: {
        kind: 'inspect-harmony',
        actorId: 'p1',
        cardIds: ['health-committee'],
      } satisfies EffectState,
      field: 'cardIds',
      expected: ['health-committee'],
    },
    {
      phase: {
        kind: 'honor-result',
        actorId: 'p1',
        signaledPlayerIds: ['p2'],
      } satisfies EffectState,
      field: 'signaledPlayerIds',
      expected: ['p2'],
    },
  ])('shows $phase.kind results only to its actor', ({ phase, field, expected }) => {
    const actorView = projectGame(gameState(phase), 'p1', ROOM_SECRET, 1)
    const outsiderView = projectGame(gameState(phase), 'p2', ROOM_SECRET, 1)

    expect(actorView.game.phase).toHaveProperty(field, expected)
    expect(outsiderView.game.phase).not.toHaveProperty(field)
  })

  it('masks the honor-student alien decision from every non-alien viewer', () => {
    const state = gameState({
      kind: 'honor-alien-choice',
      actorId: 'p1',
      alienPlayerId: 'p3',
      signaledPlayerIds: ['p2'],
    })
    const actorView = projectGame(state, 'p1', ROOM_SECRET, 5)
    const signaledView = projectGame(state, 'p2', ROOM_SECRET, 5)
    const alienView = projectGame(state, 'p3', ROOM_SECRET, 5)

    expect(actorView.game.phase).toEqual({ kind: 'private-wait' })
    expect(signaledView.game.phase).toEqual({ kind: 'private-wait' })
    expect(actorView.decisionPlayerId).toBeNull()
    expect(signaledView.decisionPlayerId).toBeNull()
    expect(actorView.canAct).toBe(false)
    expect(JSON.stringify(actorView)).not.toContain('alienPlayerId')
    expect(JSON.stringify(actorView)).not.toContain('signaledPlayerIds')

    expect(alienView.game.phase).toEqual({
      kind: 'honor-alien-choice',
      actorId: 'p1',
      alienPlayerId: 'p3',
    })
    expect(alienView.decisionPlayerId).toBe('p3')
    expect(alienView.canAct).toBe(true)
    expect(JSON.stringify(alienView)).not.toContain('signaledPlayerIds')
  })

  it.each([
    {
      phase: {
        kind: 'young-lady-return',
        actorId: 'p1',
        targetId: 'p2',
        drawnCardUid: 'raw-young-lady-drawn-uid',
      } satisfies EffectState,
      rawUid: 'raw-young-lady-drawn-uid',
      field: 'drawnCardUid',
    },
    {
      phase: {
        kind: 'class-receive',
        actorId: 'p1',
        targetId: 'p2',
        actorCardUid: 'raw-class-actor-card-uid',
      } satisfies EffectState,
      rawUid: 'raw-class-actor-card-uid',
      field: 'actorCardUid',
    },
    {
      phase: {
        kind: 'take-played',
        actorId: 'p1',
        playedCardUid: 'raw-take-played-uid',
      } satisfies EffectState,
      rawUid: 'raw-take-played-uid',
      field: 'playedCardUid',
    },
  ])('replaces $phase.kind private uids with handles', ({ phase, rawUid, field }) => {
    const projection = projectGame(gameState(phase), 'p1', ROOM_SECRET, 3)

    expect(projection.game.phase).toHaveProperty(
      field,
      cardHandle(ROOM_SECRET, 'p1', rawUid),
    )
    expect(JSON.stringify(projection)).not.toContain(rawUid)
  })

  it('reveals final cards and facedown zones only after the game finishes', () => {
    const result: GameResult = {
      winners: ['p1'],
      reason: '测试结算',
      harmonyPoints: 3,
      harmonyTarget: 9,
      harmonySucceeded: false,
      suspicionPoints: { p1: 0, p2: 2, p3: 0 },
      imprisoned: ['p2'],
    }
    const state = gameState(undefined, { status: 'finished', result })
    state.players.forEach((entry) => entry.hand.splice(1))
    const projection = projectGame(state, 'p2', ROOM_SECRET, 20)
    const otherFinalCard = projection.game.players[0].hand[0]
    const harmonyCard = projection.game.harmony[0].card
    const suspicionCard = projection.game.players[1].suspicion[0].card

    expect(projection.decisionPlayerId).toBeNull()
    expect(projection.canAct).toBe(false)
    expect(otherFinalCard).toMatchObject({
      cardId: 'student-president',
      hidden: false,
    })
    expect(harmonyCard).toMatchObject({
      cardId: 'health-committee',
      hidden: false,
    })
    expect(suspicionCard).toMatchObject({
      cardId: 'honor-student',
      hidden: false,
    })
    expect(projection.game.players[0].intel).toEqual([])
    expect(JSON.stringify(projection)).not.toContain('raw-harmony-uid')
    expect(JSON.stringify(projection)).not.toContain('raw-suspicion-uid')
  })
})
