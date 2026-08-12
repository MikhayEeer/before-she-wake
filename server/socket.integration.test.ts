// @vitest-environment node

import type { AddressInfo } from 'node:net'

import { io as createClient, type Socket } from 'socket.io-client'
import { afterEach, describe, expect, it } from 'vitest'

import type {
  Ack,
  ClientToServerEvents,
  RoomSnapshot,
  ServerToClientEvents,
  SessionStart,
} from '../src/shared/protocol'
import { createGameServer } from './index'

type TestClient = Socket<ServerToClientEvents, ClientToServerEvents>

const clients: TestClient[] = []
let closeServer: (() => Promise<void>) | null = null

function emitAck<T>(client: TestClient, event: string, ...args: unknown[]): Promise<T> {
  return new Promise((resolve, reject) => {
    const acknowledge = (response: Ack<T>) => {
      if (response.ok) resolve(response.data)
      else reject(new Error(`${response.code}: ${response.message}`))
    }
    ;(client.emit as (...values: unknown[]) => void)(event, ...args, acknowledge)
  })
}

function connect(url: string): Promise<TestClient> {
  const client: TestClient = createClient(url, { forceNew: true, reconnection: false })
  clients.push(client)
  return new Promise((resolve, reject) => {
    client.once('connect', () => resolve(client))
    client.once('connect_error', reject)
  })
}

function nextSnapshot(client: TestClient, predicate: (snapshot: RoomSnapshot) => boolean): Promise<RoomSnapshot> {
  return new Promise((resolve) => {
    const listener = (snapshot: RoomSnapshot) => {
      if (!predicate(snapshot)) return
      client.off('room:snapshot', listener)
      resolve(snapshot)
    }
    client.on('room:snapshot', listener)
  })
}

afterEach(async () => {
  clients.splice(0).forEach((client) => client.close())
  await closeServer?.()
  closeServer = null
})

describe('Socket.IO multiplayer integration', () => {
  it('lets three independent clients join, ready, start, and receive personalized updates', async () => {
    const server = createGameServer()
    await new Promise<void>((resolve) => server.httpServer.listen(0, '127.0.0.1', resolve))
    const { port } = server.httpServer.address() as AddressInfo
    const url = `http://127.0.0.1:${port}`
    closeServer = () => new Promise<void>((resolve) => server.io.close(() => resolve()))

    const [host, second, third] = await Promise.all([connect(url), connect(url), connect(url)])
    const hostSession = await emitAck<SessionStart>(host, 'room:create', { playerName: '白石' })
    const secondSession = await emitAck<SessionStart>(second, 'room:join', {
      roomCode: hostSession.credentials.roomCode,
      playerName: '千夏',
    })
    await emitAck<SessionStart>(third, 'room:join', {
      roomCode: hostSession.credentials.roomCode,
      playerName: '弥生',
    })

    await Promise.all([
      emitAck<RoomSnapshot>(host, 'room:ready', { ready: true }),
      emitAck<RoomSnapshot>(second, 'room:ready', { ready: true }),
      emitAck<RoomSnapshot>(third, 'room:ready', { ready: true }),
    ])

    const secondStarted = nextSnapshot(second, (snapshot) => snapshot.status === 'playing')
    const thirdStarted = nextSnapshot(third, (snapshot) => snapshot.status === 'playing')
    const hostStarted = await emitAck<RoomSnapshot>(host, 'room:start')
    const views = [hostStarted, await secondStarted, await thirdStarted]

    for (const view of views) {
      const self = view.game!.players.find((player) => player.id === view.viewerId)!
      const opponents = view.game!.players.filter((player) => player.id !== view.viewerId)
      expect(self.hand.every((card) => card.hidden === false)).toBe(true)
      expect(opponents.flatMap((player) => player.hand).every((card) => card.hidden === true)).toBe(true)
    }

    const actingIndex = views.findIndex((snapshot) => snapshot.canAct)
    const actingClient = [host, second, third][actingIndex]
    const actingView = views[actingIndex]
    const ownHand = actingView.game!.players.find((player) => player.id === actingView.viewerId)!.hand
    const card = ownHand.find((candidate) => candidate.hidden === false && candidate.cardId !== 'criminal')!
    const updated = await emitAck<RoomSnapshot>(actingClient, 'game:command', {
      commandId: 'integration-turn-1',
      expectedRevision: actingView.revision,
      command: { type: 'play-turn-action', cardUid: card.uid, use: 'harmony' },
    })

    expect(updated.revision).toBe(actingView.revision + 1)
    expect(updated.game!.harmony).toHaveLength(1)
    expect(secondSession.credentials.resumeToken).not.toBe(hostSession.credentials.resumeToken)
  })
})
