import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto'

import { applyGameCommand, type GameCommand } from '../src/game/commands'
import { createGame } from '../src/game/engine'
import { RuleError, type GameState } from '../src/game/types'
import type {
  GameCommandEnvelope,
  RoomPlayerView,
  RoomSnapshot,
  SessionCredentials,
  SessionStart,
} from '../src/shared/protocol'
import { cardHandle, projectGame } from './project-view'

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const MIN_PLAYERS = 3
const MAX_PLAYERS = 6
const MAX_PROCESSED_COMMANDS = 256
const ROOM_IDLE_MS = 24 * 60 * 60 * 1000

interface RoomSeat {
  id: string
  name: string
  tokenHash: string
  ready: boolean
  socketIds: Set<string>
}

interface RoomRecord {
  code: string
  secret: string
  hostPlayerId: string
  seats: RoomSeat[]
  game: GameState | null
  revision: number
  processedCommands: Set<string>
  lastActivity: number
}

interface SocketSession {
  roomCode: string
  playerId: string
}

export class RoomError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'RoomError'
  }
}

function normalizeName(value: string): string {
  const name = value.trim().replace(/\s+/g, ' ')
  if (name.length < 1 || name.length > 16) {
    throw new RoomError('INVALID_NAME', '昵称应为 1 至 16 个字符。')
  }
  return name
}

function normalizeRoomCode(value: string): string {
  return value.trim().toUpperCase()
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function tokensMatch(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(tokenHash(token), 'hex')
  const expected = Buffer.from(expectedHash, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

function createRoomCode(existing: Map<string, RoomRecord>): string {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const bytes = randomBytes(6)
    const code = Array.from(bytes, (byte) => ROOM_ALPHABET[byte % ROOM_ALPHABET.length]).join('')
    if (!existing.has(code)) return code
  }
  throw new RoomError('ROOM_CODE_EXHAUSTED', '暂时无法创建房间，请稍后重试。')
}

function publicSeat(seat: RoomSeat, hostPlayerId: string): RoomPlayerView {
  return {
    id: seat.id,
    name: seat.name,
    kind: 'human',
    ready: seat.ready,
    connected: seat.socketIds.size > 0,
    isHost: seat.id === hostPlayerId,
  }
}

export class RoomService {
  private readonly rooms = new Map<string, RoomRecord>()
  private readonly socketSessions = new Map<string, SocketSession>()

  createRoom(socketId: string, rawName: string): SessionStart {
    this.detachSocket(socketId)
    const name = normalizeName(rawName)
    const code = createRoomCode(this.rooms)
    const token = randomBytes(32).toString('base64url')
    const playerId = randomUUID()
    const seat: RoomSeat = {
      id: playerId,
      name,
      tokenHash: tokenHash(token),
      ready: false,
      socketIds: new Set([socketId]),
    }
    const room: RoomRecord = {
      code,
      secret: randomBytes(32).toString('base64url'),
      hostPlayerId: playerId,
      seats: [seat],
      game: null,
      revision: 0,
      processedCommands: new Set(),
      lastActivity: Date.now(),
    }
    this.rooms.set(code, room)
    this.socketSessions.set(socketId, { roomCode: code, playerId })
    const credentials = { roomCode: code, playerId, resumeToken: token }
    return { credentials, snapshot: this.snapshot(room, playerId) }
  }

  joinRoom(socketId: string, rawCode: string, rawName: string): SessionStart {
    this.detachSocket(socketId)
    const code = normalizeRoomCode(rawCode)
    const room = this.requireRoom(code)
    if (room.game) throw new RoomError('GAME_STARTED', '该房间已经开始游戏。')
    if (room.seats.length >= MAX_PLAYERS) throw new RoomError('ROOM_FULL', '房间已经满员。')
    const name = normalizeName(rawName)
    if (room.seats.some((seat) => seat.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      throw new RoomError('NAME_TAKEN', '房间内已有同名玩家。')
    }
    const token = randomBytes(32).toString('base64url')
    const playerId = randomUUID()
    room.seats.push({
      id: playerId,
      name,
      tokenHash: tokenHash(token),
      ready: false,
      socketIds: new Set([socketId]),
    })
    room.lastActivity = Date.now()
    this.socketSessions.set(socketId, { roomCode: code, playerId })
    const credentials = { roomCode: code, playerId, resumeToken: token }
    return { credentials, snapshot: this.snapshot(room, playerId) }
  }

  resumeRoom(socketId: string, credentials: SessionCredentials): RoomSnapshot {
    this.detachSocket(socketId)
    const room = this.requireRoom(normalizeRoomCode(credentials.roomCode))
    const seat = room.seats.find((candidate) => candidate.id === credentials.playerId)
    if (!seat || !tokensMatch(credentials.resumeToken, seat.tokenHash)) {
      throw new RoomError('INVALID_SESSION', '房间凭证已经失效。')
    }
    seat.socketIds.add(socketId)
    room.lastActivity = Date.now()
    this.socketSessions.set(socketId, { roomCode: room.code, playerId: seat.id })
    return this.snapshot(room, seat.id)
  }

  setReady(socketId: string, ready: boolean): RoomSnapshot {
    const { room, seat } = this.requireSocketSeat(socketId)
    if (room.game) throw new RoomError('GAME_STARTED', '游戏开始后不能修改准备状态。')
    seat.ready = Boolean(ready)
    room.lastActivity = Date.now()
    return this.snapshot(room, seat.id)
  }

  startGame(socketId: string): RoomSnapshot {
    const { room, seat } = this.requireSocketSeat(socketId)
    if (seat.id !== room.hostPlayerId) throw new RoomError('NOT_HOST', '只有房主可以开始游戏。')
    if (room.game) throw new RoomError('GAME_STARTED', '游戏已经开始。')
    if (room.seats.length < MIN_PLAYERS || room.seats.length > MAX_PLAYERS) {
      throw new RoomError('PLAYER_COUNT', `游戏需要 ${MIN_PLAYERS} 至 ${MAX_PLAYERS} 名玩家。`)
    }
    if (room.seats.some((candidate) => !candidate.ready || candidate.socketIds.size === 0)) {
      throw new RoomError('NOT_READY', '所有玩家在线并准备后才能开始。')
    }
    const seed = randomBytes(4).readUInt32BE(0)
    room.game = createGame(
      room.seats.map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        kind: 'human' as const,
      })),
      seed,
    )
    room.revision = 1
    room.processedCommands.clear()
    room.lastActivity = Date.now()
    return this.snapshot(room, seat.id)
  }

  applyCommand(socketId: string, envelope: GameCommandEnvelope): RoomSnapshot {
    const { room, seat } = this.requireSocketSeat(socketId)
    if (!room.game) throw new RoomError('GAME_NOT_STARTED', '房间还没有开始游戏。')
    if (!envelope.commandId || envelope.commandId.length > 96) {
      throw new RoomError('INVALID_COMMAND', '行动标识无效。')
    }
    const commandKey = `${seat.id}:${envelope.commandId}`
    if (room.processedCommands.has(commandKey)) return this.snapshot(room, seat.id)
    if (envelope.expectedRevision !== room.revision) {
      throw new RoomError('STALE_STATE', '牌局状态已经变化，请按最新状态重新操作。')
    }

    try {
      const command = this.resolveCommandHandles(room, seat.id, envelope.command)
      room.game = applyGameCommand(room.game, seat.id, command)
    } catch (error) {
      if (error instanceof RoomError) throw error
      if (error instanceof RuleError) throw new RoomError('RULE_ERROR', error.message)
      throw error
    }

    room.revision += 1
    room.processedCommands.add(commandKey)
    while (room.processedCommands.size > MAX_PROCESSED_COMMANDS) {
      const oldest = room.processedCommands.values().next().value as string | undefined
      if (!oldest) break
      room.processedCommands.delete(oldest)
    }
    room.lastActivity = Date.now()
    return this.snapshot(room, seat.id)
  }

  leaveRoom(socketId: string): string | null {
    const session = this.socketSessions.get(socketId)
    if (!session) return null
    const room = this.rooms.get(session.roomCode)
    this.socketSessions.delete(socketId)
    if (!room) return session.roomCode
    const seatIndex = room.seats.findIndex((seat) => seat.id === session.playerId)
    if (seatIndex < 0) return room.code
    const seat = room.seats[seatIndex]
    seat.socketIds.delete(socketId)
    if (!room.game) {
      room.seats.splice(seatIndex, 1)
      if (room.seats.length === 0) {
        this.rooms.delete(room.code)
        return room.code
      }
      if (room.hostPlayerId === seat.id) room.hostPlayerId = room.seats[0].id
    }
    room.lastActivity = Date.now()
    return room.code
  }

  disconnect(socketId: string): string | null {
    const session = this.socketSessions.get(socketId)
    if (!session) return null
    const room = this.rooms.get(session.roomCode)
    const seat = room?.seats.find((candidate) => candidate.id === session.playerId)
    seat?.socketIds.delete(socketId)
    this.socketSessions.delete(socketId)
    if (room) room.lastActivity = Date.now()
    return room?.code ?? session.roomCode
  }

  getRoomCodeForSocket(socketId: string): string | null {
    return this.socketSessions.get(socketId)?.roomCode ?? null
  }

  getSnapshotForSocket(socketId: string): RoomSnapshot | null {
    const session = this.socketSessions.get(socketId)
    if (!session) return null
    const room = this.rooms.get(session.roomCode)
    if (!room) return null
    return this.snapshot(room, session.playerId)
  }

  prune(now = Date.now()): string[] {
    const removed: string[] = []
    for (const [code, room] of this.rooms) {
      const hasConnections = room.seats.some((seat) => seat.socketIds.size > 0)
      if (!hasConnections && now - room.lastActivity > ROOM_IDLE_MS) {
        this.rooms.delete(code)
        removed.push(code)
      }
    }
    return removed
  }

  private snapshot(room: RoomRecord, viewerId: string): RoomSnapshot {
    const players = room.seats.map((seat) => publicSeat(seat, room.hostPlayerId))
    if (!room.game) {
      return {
        roomCode: room.code,
        revision: room.revision,
        status: 'lobby',
        viewerId,
        hostPlayerId: room.hostPlayerId,
        players,
        game: null,
        decisionPlayerId: null,
        canAct: false,
      }
    }
    const projected = projectGame(room.game, viewerId, room.secret, room.revision)
    return {
      roomCode: room.code,
      revision: room.revision,
      status: room.game.status,
      viewerId,
      hostPlayerId: room.hostPlayerId,
      players,
      ...projected,
    }
  }

  private resolveCommandHandles(
    room: RoomRecord,
    viewerId: string,
    command: GameCommand,
  ): GameCommand {
    const game = room.game!
    const ownCards = game.players.find((player) => player.id === viewerId)?.hand ?? []
    const resolveOwn = (handle: string) => this.resolveHandle(room, viewerId, handle, ownCards)
    const resolvePlayed = (handle: string) => this.resolveHandle(
      room,
      viewerId,
      handle,
      game.played.map((entry) => entry.card),
    )

    switch (command.type) {
      case 'play-turn-action':
      case 'return-young-lady-card':
      case 'finish-class-exchange':
      case 'select-news-card':
        return { ...command, cardUid: resolveOwn(command.cardUid) }
      case 'choose-class-exchange':
        return { ...command, cardUid: resolveOwn(command.cardUid) }
      case 'exchange-harmony-card':
        return { ...command, cardUid: resolveOwn(command.cardUid) }
      case 'take-played-card':
        return { ...command, cardUid: resolvePlayed(command.cardUid) }
      default:
        return structuredClone(command)
    }
  }

  private resolveHandle(
    room: RoomRecord,
    viewerId: string,
    handle: string,
    candidates: Array<{ uid: string }>,
  ): string {
    const card = candidates.find(
      (candidate) => cardHandle(room.secret, viewerId, candidate.uid) === handle,
    )
    if (!card) throw new RoomError('INVALID_CARD', '所选牌已经变化，请重新选择。')
    return card.uid
  }

  private requireRoom(code: string): RoomRecord {
    const room = this.rooms.get(code)
    if (!room) throw new RoomError('ROOM_NOT_FOUND', '没有找到这个房间。')
    return room
  }

  private requireSocketSeat(socketId: string): { room: RoomRecord; seat: RoomSeat } {
    const session = this.socketSessions.get(socketId)
    if (!session) throw new RoomError('NOT_IN_ROOM', '请先创建、加入或恢复房间。')
    const room = this.requireRoom(session.roomCode)
    const seat = room.seats.find((candidate) => candidate.id === session.playerId)
    if (!seat) throw new RoomError('INVALID_SESSION', '玩家席位已经失效。')
    return { room, seat }
  }

  private detachSocket(socketId: string): void {
    const existing = this.socketSessions.get(socketId)
    if (!existing) return
    const room = this.rooms.get(existing.roomCode)
    room?.seats.find((seat) => seat.id === existing.playerId)?.socketIds.delete(socketId)
    this.socketSessions.delete(socketId)
  }
}
