import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import express from 'express'
import { Server } from 'socket.io'

import type {
  Ack,
  ClientToServerEvents,
  RoomSnapshot,
  ServerToClientEvents,
} from '../src/shared/protocol'
import { RoomError, RoomService } from './room-service'

interface GameServerOptions {
  clientOrigin?: string
}

export function createGameServer(options: GameServerOptions = {}) {
  const app = express()
  const httpServer = createServer(app)
  const roomService = new RoomService()
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: options.clientOrigin
      ? { origin: options.clientOrigin.split(',').map((origin) => origin.trim()) }
      : undefined,
  })

  app.disable('x-powered-by')
  app.get('/healthz', (_request, response) => {
    response.json({ ok: true, service: 'before-she-wake' })
  })

  const distDirectory = resolve(process.cwd(), 'dist')
  const indexFile = resolve(distDirectory, 'index.html')
  if (existsSync(distDirectory)) app.use(express.static(distDirectory))
  app.use((request, response, next) => {
    if (request.method === 'GET' && request.accepts('html') && existsSync(indexFile)) {
      response.sendFile(indexFile)
      return
    }
    next()
  })

  const leaveSocketRooms = async (socket: Parameters<Parameters<typeof io.on>[1]>[0]) => {
    await Promise.all(
      [...socket.rooms]
        .filter((roomCode) => roomCode !== socket.id)
        .map((roomCode) => socket.leave(roomCode)),
    )
  }

  const broadcastRoom = (roomCode: string | null) => {
    if (!roomCode) return
    const socketIds = io.sockets.adapter.rooms.get(roomCode)
    if (!socketIds) return
    for (const socketId of socketIds) {
      const snapshot = roomService.getSnapshotForSocket(socketId)
      if (snapshot) io.sockets.sockets.get(socketId)?.emit('room:snapshot', snapshot)
    }
  }

  const failure = <T,>(socketId: string, error: unknown): Ack<T> => {
    const known = error instanceof RoomError
    const snapshot = roomService.getSnapshotForSocket(socketId) ?? undefined
    return {
      ok: false,
      code: known ? error.code : 'SERVER_ERROR',
      message: known ? error.message : '服务器暂时无法完成请求。',
      ...(snapshot ? { snapshot } : {}),
    }
  }

  io.on('connection', (socket) => {
    socket.on('room:create', async (request, acknowledge) => {
      try {
        await leaveSocketRooms(socket)
        const session = roomService.createRoom(socket.id, request.playerName)
        await socket.join(session.credentials.roomCode)
        acknowledge({ ok: true, data: session })
        broadcastRoom(session.credentials.roomCode)
      } catch (error) {
        acknowledge(failure(socket.id, error))
      }
    })

    socket.on('room:join', async (request, acknowledge) => {
      try {
        await leaveSocketRooms(socket)
        const session = roomService.joinRoom(socket.id, request.roomCode, request.playerName)
        await socket.join(session.credentials.roomCode)
        acknowledge({ ok: true, data: session })
        broadcastRoom(session.credentials.roomCode)
      } catch (error) {
        acknowledge(failure(socket.id, error))
      }
    })

    socket.on('room:resume', async (credentials, acknowledge) => {
      try {
        await leaveSocketRooms(socket)
        const snapshot = roomService.resumeRoom(socket.id, credentials)
        await socket.join(snapshot.roomCode)
        acknowledge({ ok: true, data: snapshot })
        broadcastRoom(snapshot.roomCode)
      } catch (error) {
        acknowledge(failure(socket.id, error))
      }
    })

    socket.on('room:ready', (request, acknowledge) => {
      try {
        const snapshot = roomService.setReady(socket.id, request.ready)
        acknowledge({ ok: true, data: snapshot })
        broadcastRoom(snapshot.roomCode)
      } catch (error) {
        acknowledge(failure(socket.id, error))
      }
    })

    socket.on('room:start', (acknowledge) => {
      try {
        const snapshot = roomService.startGame(socket.id)
        acknowledge({ ok: true, data: snapshot })
        broadcastRoom(snapshot.roomCode)
      } catch (error) {
        acknowledge(failure(socket.id, error))
      }
    })

    socket.on('game:command', (envelope, acknowledge) => {
      try {
        const snapshot = roomService.applyCommand(socket.id, envelope)
        acknowledge({ ok: true, data: snapshot })
        broadcastRoom(snapshot.roomCode)
      } catch (error) {
        const response = failure<RoomSnapshot>(socket.id, error)
        acknowledge(response)
        if (!response.ok && response.snapshot) socket.emit('room:snapshot', response.snapshot)
      }
    })

    socket.on('room:leave', async (acknowledge) => {
      const roomCode = roomService.getRoomCodeForSocket(socket.id)
      try {
        roomService.leaveRoom(socket.id)
        if (roomCode) await socket.leave(roomCode)
        acknowledge({ ok: true, data: null })
        broadcastRoom(roomCode)
      } catch (error) {
        acknowledge(failure(socket.id, error))
      }
    })

    socket.on('disconnect', () => {
      const roomCode = roomService.disconnect(socket.id)
      broadcastRoom(roomCode)
    })
  })

  const cleanupTimer = setInterval(() => roomService.prune(), 15 * 60 * 1000)
  cleanupTimer.unref()

  return { app, httpServer, io, roomService }
}

export async function startServer() {
  const port = Number(process.env.PORT ?? (process.env.NODE_ENV === 'production' ? 3000 : 3001))
  const host = process.env.HOST ?? '0.0.0.0'
  const server = createGameServer({ clientOrigin: process.env.CLIENT_ORIGIN })
  await new Promise<void>((resolveListening) => {
    server.httpServer.listen(port, host, resolveListening)
  })
  console.log(`Before She Wake server listening on http://${host}:${port}`)
  return server
}

const entryPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : ''
if (import.meta.url === entryPath) {
  startServer().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
