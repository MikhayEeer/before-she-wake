import { describe, expect, it } from 'vitest'

import type { GameCommand } from '../src/game/commands'
import type { KnownCardView, SessionStart } from '../src/shared/protocol'
import { RoomError, RoomService } from './room-service'

function createThreePlayerLobby(service: RoomService): SessionStart[] {
  const first = service.createRoom('socket-1', '白石')
  const second = service.joinRoom('socket-2', first.credentials.roomCode, '千夏')
  const third = service.joinRoom('socket-3', first.credentials.roomCode, '弥生')
  service.setReady('socket-1', true)
  service.setReady('socket-2', true)
  service.setReady('socket-3', true)
  return [first, second, third]
}

describe('RoomService', () => {
  it('creates a ready lobby, starts an authoritative game, and projects only viewer-safe state', () => {
    const service = new RoomService()
    const sessions = createThreePlayerLobby(service)
    const started = service.startGame('socket-1')

    expect(started.status).toBe('playing')
    expect(started.revision).toBe(1)
    expect(started.players).toHaveLength(3)

    const firstView = service.getSnapshotForSocket('socket-1')!
    const firstPlayer = firstView.game!.players.find((player) => player.id === firstView.viewerId)!
    const opponent = firstView.game!.players.find((player) => player.id !== firstView.viewerId)!
    expect(firstPlayer.hand.every((card) => card.hidden === false)).toBe(true)
    expect(opponent.hand.every((card) => card.hidden === true)).toBe(true)
    expect((firstPlayer.hand[0] as KnownCardView).uid).toMatch(/^h_[A-Za-z0-9_-]+$/)

    const serialized = JSON.stringify(firstView)
    expect(serialized).not.toContain('rngSeed')
    expect(serialized).not.toContain('unused')
    expect(serialized).not.toContain('pendingInfected')
    expect(sessions[0].credentials.resumeToken.length).toBeGreaterThan(30)
  })

  it('authenticates the decision player, resolves opaque handles, versions commands, and deduplicates retries', () => {
    const service = new RoomService()
    createThreePlayerLobby(service)
    service.startGame('socket-1')

    const socketIds = ['socket-1', 'socket-2', 'socket-3']
    const decisionSocket = socketIds.find((socketId) => service.getSnapshotForSocket(socketId)?.canAct)!
    const waitingSocket = socketIds.find((socketId) => socketId !== decisionSocket)!
    const decisionView = service.getSnapshotForSocket(decisionSocket)!
    const waitingView = service.getSnapshotForSocket(waitingSocket)!
    const decisionPlayer = decisionView.game!.players.find((player) => player.id === decisionView.viewerId)!
    const playable = decisionPlayer.hand.find(
      (card): card is KnownCardView => card.hidden === false && card.cardId !== 'criminal',
    )!
    const command: GameCommand = {
      type: 'play-turn-action',
      cardUid: playable.uid,
      use: 'harmony',
    }

    const waitingPlayer = waitingView.game!.players.find((player) => player.id === waitingView.viewerId)!
    const waitingCard = waitingPlayer.hand.find(
      (card): card is KnownCardView => card.hidden === false && card.cardId !== 'criminal',
    )!
    expect(() => service.applyCommand(waitingSocket, {
      commandId: 'wrong-player',
      expectedRevision: waitingView.revision,
      command: { type: 'play-turn-action', cardUid: waitingCard.uid, use: 'harmony' },
    })).toThrowError(RoomError)

    const applied = service.applyCommand(decisionSocket, {
      commandId: 'command-1',
      expectedRevision: decisionView.revision,
      command,
    })
    expect(applied.revision).toBe(decisionView.revision + 1)
    expect(applied.game!.harmony).toHaveLength(1)

    const repeated = service.applyCommand(decisionSocket, {
      commandId: 'command-1',
      expectedRevision: decisionView.revision,
      command,
    })
    expect(repeated.revision).toBe(applied.revision)
    expect(repeated.game!.harmony).toHaveLength(1)
  })

  it('keeps a playing seat on disconnect and restores it with the resume token', () => {
    const service = new RoomService()
    const sessions = createThreePlayerLobby(service)
    service.startGame('socket-1')
    const before = service.getSnapshotForSocket('socket-2')!

    service.disconnect('socket-2')
    expect(service.getSnapshotForSocket('socket-1')!.players.find(
      (player) => player.id === sessions[1].credentials.playerId,
    )?.connected).toBe(false)

    const restored = service.resumeRoom('socket-2b', sessions[1].credentials)
    expect(restored.viewerId).toBe(before.viewerId)
    expect(restored.revision).toBe(before.revision)
    expect(restored.players.find((player) => player.id === restored.viewerId)?.connected).toBe(true)
  })
})
