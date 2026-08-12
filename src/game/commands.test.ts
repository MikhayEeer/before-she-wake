import { describe, expect, it } from 'vitest'

import { applyGameCommand, type GameCommand } from './commands'
import { makePlacedCard } from './engine'
import type {
  CardId,
  CardInstance,
  EffectState,
  GameState,
  PlacedCard,
  Player,
} from './types'
import { RuleError } from './types'

function card(cardId: CardId, uid: string): CardInstance {
  return { cardId, uid }
}

function player(id: string, cardIds: CardId[]): Player {
  return {
    id,
    name: id.toUpperCase(),
    kind: 'human',
    hand: cardIds.map((cardId, index) => card(cardId, `${id}-${cardId}-${index}`)),
    suspicion: [],
    intel: [],
  }
}

function placed(cardId: CardId, uid: string, byPlayerId = 'p1'): PlacedCard {
  return makePlacedCard(cardId, uid, byPlayerId)
}

function stateWith(
  players: Player[],
  phase: EffectState,
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

function standardPlayers(): Player[] {
  return [
    player('p1', ['library-committee', 'criminal']),
    player('p2', ['student-president', 'go-home-club']),
    player('p3', ['infected']),
  ]
}

describe('applyGameCommand authorization', () => {
  it('rejects a player who is not the current decision maker before dispatching', () => {
    const game = stateWith(standardPlayers(), { kind: 'turn', actorId: 'p1' })
    const original = structuredClone(game)

    expect(() => applyGameCommand(game, 'p2', {
      type: 'play-turn-action',
      cardUid: game.players[0].hand[0].uid,
      use: 'harmony',
    })).toThrowError('你不是当前需要行动的玩家。')
    expect(game).toEqual(original)
  })

  it('checks identity before reporting a command and phase mismatch', () => {
    const game = stateWith(standardPlayers(), { kind: 'turn', actorId: 'p1' })

    expect(() => applyGameCommand(game, 'p2', {
      type: 'confirm-honor-result',
    })).toThrowError('你不是当前需要行动的玩家。')
  })

  it('uses the authenticated player for news selection', () => {
    const game = stateWith(standardPlayers(), {
      kind: 'news-pass',
      actorId: 'p1',
      participants: ['p1', 'p2'],
      cursor: 1,
      selections: { p1: 'p1-library-committee-0' },
    })

    const next = applyGameCommand(game, 'p2', {
      type: 'select-news-card',
      cardUid: game.players[1].hand[0].uid,
    })

    expect(next.phase).toEqual({ kind: 'turn', actorId: 'p2' })
    expect(next.players[0].hand.map(({ cardId }) => cardId)).toContain('student-president')
    expect(next.players[1].hand.map(({ cardId }) => cardId)).toContain('library-committee')
  })
})

describe('applyGameCommand dispatch', () => {
  it('dispatches play-turn-action', () => {
    const game = stateWith(standardPlayers(), { kind: 'turn', actorId: 'p1' })
    const used = game.players[0].hand[0]

    const next = applyGameCommand(game, 'p1', {
      type: 'play-turn-action',
      cardUid: used.uid,
      use: 'harmony',
    })

    expect(next.harmony).toEqual([{ card: used, byPlayerId: 'p1' }])
  })

  it('dispatches take-played-card', () => {
    const game = stateWith(standardPlayers(), {
      kind: 'take-played',
      actorId: 'p1',
      playedCardUid: 'trigger',
    }, {
      played: [placed('honor-student', 'public-card', 'p2')],
    })

    const next = applyGameCommand(game, 'p1', {
      type: 'take-played-card',
      cardUid: 'public-card',
    })

    expect(next.players[0].hand.map(({ cardId }) => cardId)).toContain('honor-student')
  })

  it('dispatches inspect-player', () => {
    const game = stateWith(standardPlayers(), { kind: 'inspect-player', actorId: 'p1' })

    const next = applyGameCommand(game, 'p1', {
      type: 'inspect-player',
      targetPlayerId: 'p2',
    })

    expect(next.phase).toMatchObject({
      kind: 'inspect-result',
      targetId: 'p2',
      cardIds: ['student-president', 'go-home-club'],
    })
  })

  it('dispatches confirm-inspect-result', () => {
    const game = stateWith(standardPlayers(), {
      kind: 'inspect-result',
      actorId: 'p1',
      targetId: 'p2',
      cardIds: ['student-president', 'go-home-club'],
    })

    const next = applyGameCommand(game, 'p1', { type: 'confirm-inspect-result' })

    expect(next.phase).toEqual({ kind: 'turn', actorId: 'p2' })
  })

  it('dispatches draw-young-lady-card', () => {
    const game = stateWith(standardPlayers(), { kind: 'young-lady', actorId: 'p1' })

    const next = applyGameCommand(game, 'p1', {
      type: 'draw-young-lady-card',
      targetPlayerId: 'p2',
    })

    expect(next.phase).toMatchObject({
      kind: 'young-lady-return',
      actorId: 'p1',
      targetId: 'p2',
    })
    expect(next.players[0].hand).toHaveLength(3)
  })

  it('dispatches return-young-lady-card', () => {
    const players = standardPlayers()
    players[0].hand.push(card('alien', 'drawn-card'))
    const game = stateWith(players, {
      kind: 'young-lady-return',
      actorId: 'p1',
      targetId: 'p2',
      drawnCardUid: 'drawn-card',
    })

    const next = applyGameCommand(game, 'p1', {
      type: 'return-young-lady-card',
      cardUid: 'drawn-card',
    })

    expect(next.players[1].hand.map(({ uid }) => uid)).toContain('drawn-card')
  })

  it('dispatches choose-class-exchange', () => {
    const game = stateWith(standardPlayers(), { kind: 'class-pick', actorId: 'p1' })
    const ownCardUid = game.players[0].hand[0].uid

    const next = applyGameCommand(game, 'p1', {
      type: 'choose-class-exchange',
      targetPlayerId: 'p2',
      cardUid: ownCardUid,
    })

    expect(next.phase).toEqual({
      kind: 'class-receive',
      actorId: 'p1',
      targetId: 'p2',
      actorCardUid: ownCardUid,
    })
  })

  it('dispatches finish-class-exchange for the target decision maker', () => {
    const players = standardPlayers()
    const actorCardUid = players[0].hand[0].uid
    const targetCardUid = players[1].hand[0].uid
    const game = stateWith(players, {
      kind: 'class-receive',
      actorId: 'p1',
      targetId: 'p2',
      actorCardUid,
    })

    const next = applyGameCommand(game, 'p2', {
      type: 'finish-class-exchange',
      cardUid: targetCardUid,
    })

    expect(next.players[0].hand.map(({ uid }) => uid)).toContain(targetCardUid)
    expect(next.players[1].hand.map(({ uid }) => uid)).toContain(actorCardUid)
  })

  it('dispatches select-news-card', () => {
    const game = stateWith(standardPlayers(), {
      kind: 'news-pass',
      actorId: 'p1',
      participants: ['p1', 'p2'],
      cursor: 0,
      selections: {},
    })
    const selectedUid = game.players[0].hand[0].uid

    const next = applyGameCommand(game, 'p1', {
      type: 'select-news-card',
      cardUid: selectedUid,
    })

    expect(next.phase).toMatchObject({ cursor: 1, selections: { p1: selectedUid } })
  })

  it('dispatches confirm-inspect-harmony', () => {
    const game = stateWith(standardPlayers(), {
      kind: 'inspect-harmony',
      actorId: 'p1',
      cardIds: ['student-president'],
    }, {
      harmony: [placed('student-president', 'harmony-card')],
    })

    const next = applyGameCommand(game, 'p1', { type: 'confirm-inspect-harmony' })

    expect(next.phase).toEqual({ kind: 'turn', actorId: 'p2' })
  })

  it('dispatches respond-honor-student for the alien decision maker', () => {
    const game = stateWith([
      player('p1', ['honor-student', 'library-committee']),
      player('p2', ['criminal', 'go-home-club']),
      player('p3', ['alien', 'infected']),
    ], {
      kind: 'honor-alien-choice',
      actorId: 'p1',
      alienPlayerId: 'p3',
      signaledPlayerIds: ['p2'],
    })

    const next = applyGameCommand(game, 'p3', {
      type: 'respond-honor-student',
      impersonate: true,
    })

    expect(next.phase).toEqual({
      kind: 'honor-result',
      actorId: 'p1',
      signaledPlayerIds: ['p2', 'p3'],
    })
  })

  it('dispatches confirm-honor-result', () => {
    const game = stateWith([
      player('p1', ['honor-student', 'library-committee']),
      player('p2', ['criminal', 'go-home-club']),
      player('p3', ['alien', 'infected']),
    ], {
      kind: 'honor-result',
      actorId: 'p1',
      signaledPlayerIds: ['p2'],
    })

    const next = applyGameCommand(game, 'p1', { type: 'confirm-honor-result' })

    expect(next.phase).toEqual({ kind: 'turn', actorId: 'p2' })
  })

  it('dispatches move-suspicion-card', () => {
    const players = standardPlayers()
    players[1].suspicion = [placed('student-president', 'suspicion-card', 'p3')]
    const game = stateWith(players, { kind: 'move-suspicion', actorId: 'p1' })

    const next = applyGameCommand(game, 'p1', {
      type: 'move-suspicion-card',
      sourcePlayerId: 'p2',
      cardIndex: 0,
      destinationPlayerId: 'p3',
    })

    expect(next.players[1].suspicion).toEqual([])
    expect(next.players[2].suspicion[0].card.uid).toBe('suspicion-card')
  })

  it('dispatches retrieve-infected-card', () => {
    const game = stateWith(standardPlayers(), {
      kind: 'infected-retrieve',
      actorId: 'p1',
    }, {
      harmony: [placed('student-president', 'harmony-card')],
    })

    const next = applyGameCommand(game, 'p1', {
      type: 'retrieve-infected-card',
      harmonyIndex: 0,
    })

    expect(next.harmony).toEqual([])
    expect(next.players[0].hand.map(({ uid }) => uid)).toContain('harmony-card')
  })

  it('dispatches exchange-harmony-card', () => {
    const game = stateWith(standardPlayers(), {
      kind: 'exchange-harmony',
      actorId: 'p1',
    }, {
      harmony: [placed('student-president', 'harmony-card', 'p2')],
    })
    const ownCardUid = game.players[0].hand[0].uid

    const next = applyGameCommand(game, 'p1', {
      type: 'exchange-harmony-card',
      cardUid: ownCardUid,
      harmonyIndex: 0,
    })

    expect(next.players[0].hand.map(({ uid }) => uid)).toContain('harmony-card')
    expect(next.harmony[0].card.uid).toBe(ownCardUid)
  })

  it('does not allow a phase-specific confirmation command to confirm another result', () => {
    const game = stateWith(standardPlayers(), {
      kind: 'honor-result',
      actorId: 'p1',
      signaledPlayerIds: ['p2'],
    })
    const command: GameCommand = { type: 'confirm-inspect-result' }

    expect(() => applyGameCommand(game, 'p1', command)).toThrow(RuleError)
    expect(game.phase.kind).toBe('honor-result')
  })
})
