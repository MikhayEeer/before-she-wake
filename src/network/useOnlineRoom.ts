import { useCallback, useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'

import type { GameCommand } from '../game/commands'
import type {
  Ack,
  ClientToServerEvents,
  RoomSnapshot,
  ServerToClientEvents,
  SessionCredentials,
  SessionStart,
} from '../shared/protocol'

const SESSION_KEY = 'before-she-wake:online-session:v1'
const REQUEST_TIMEOUT_MS = 10_000

type OnlineSocket = Socket<ServerToClientEvents, ClientToServerEvents>
export type ConnectionState = 'connected' | 'connecting' | 'disconnected'

function loadCredentials(): SessionCredentials | null {
  try {
    const value = localStorage.getItem(SESSION_KEY)
    if (!value) return null
    const parsed = JSON.parse(value) as Partial<SessionCredentials>
    if (!parsed.roomCode || !parsed.playerId || !parsed.resumeToken) return null
    return parsed as SessionCredentials
  } catch {
    return null
  }
}

function saveCredentials(credentials: SessionCredentials | null): void {
  if (credentials) localStorage.setItem(SESSION_KEY, JSON.stringify(credentials))
  else localStorage.removeItem(SESSION_KEY)
}

function responseError<T>(response: Extract<Ack<T>, { ok: false }>): Error {
  const error = new Error(response.message)
  error.name = response.code
  return error
}

export function useOnlineRoom() {
  const socketRef = useRef<OnlineSocket | null>(null)
  const activeRef = useRef(false)
  const connectedBeforeRef = useRef(false)
  const credentialsRef = useRef<SessionCredentials | null>(null)
  const snapshotRef = useRef<RoomSnapshot | null>(null)
  const [credentials, setCredentialsState] = useState<SessionCredentials | null>(() => loadCredentials())
  const [snapshot, setSnapshotState] = useState<RoomSnapshot | null>(null)
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const setCredentials = useCallback((next: SessionCredentials | null) => {
    credentialsRef.current = next
    setCredentialsState(next)
    saveCredentials(next)
  }, [])

  const setSnapshot = useCallback((next: RoomSnapshot | null) => {
    snapshotRef.current = next
    setSnapshotState(next)
  }, [])

  useEffect(() => {
    credentialsRef.current = credentials
  }, [credentials])

  useEffect(() => {
    const socket: OnlineSocket = io({ autoConnect: false })
    socketRef.current = socket

    const resumeInBackground = () => {
      const saved = credentialsRef.current
      if (!saved || !activeRef.current) return
      socket.emit('room:resume', saved, (response) => {
        if (response.ok) {
          setSnapshot(response.data)
          setError('')
          return
        }
        if (response.snapshot) setSnapshot(response.snapshot)
        setError(response.message)
        if (response.code === 'INVALID_SESSION' || response.code === 'ROOM_NOT_FOUND') {
          activeRef.current = false
        }
      })
    }

    socket.on('connect', () => {
      setConnectionState('connected')
      if (connectedBeforeRef.current) resumeInBackground()
      connectedBeforeRef.current = true
    })
    socket.on('disconnect', () => setConnectionState('disconnected'))
    socket.io.on('reconnect_attempt', () => setConnectionState('connecting'))
    socket.on('room:snapshot', (next) => {
      if (!activeRef.current) return
      setSnapshot(next)
      setError('')
    })
    socket.on('room:error', (roomError) => {
      if (roomError.snapshot) setSnapshot(roomError.snapshot)
      setError(roomError.message)
    })
    socket.connect()

    return () => {
      socket.removeAllListeners()
      socket.io.removeAllListeners()
      socket.disconnect()
      socketRef.current = null
    }
  }, [setSnapshot])

  const requireSocket = useCallback(async (): Promise<OnlineSocket> => {
    const socket = socketRef.current
    if (!socket) throw new Error('实时连接尚未初始化。')
    if (socket.connected) return socket
    setConnectionState('connecting')
    socket.connect()
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        cleanup()
        reject(new Error('连接服务器超时，请检查网络后重试。'))
      }, REQUEST_TIMEOUT_MS)
      const cleanup = () => {
        window.clearTimeout(timer)
        socket.off('connect', onConnect)
        socket.off('connect_error', onError)
      }
      const onConnect = () => {
        cleanup()
        resolve()
      }
      const onError = () => {
        cleanup()
        reject(new Error('无法连接房间服务器。'))
      }
      socket.once('connect', onConnect)
      socket.once('connect_error', onError)
    })
    return socket
  }, [])

  const request = useCallback(async <T,>(
    emit: (socket: OnlineSocket, acknowledge: (response: Ack<T>) => void) => void,
  ): Promise<T> => {
    const socket = await requireSocket()
    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        reject(new Error('服务器响应超时，请重试。'))
      }, REQUEST_TIMEOUT_MS)
      emit(socket, (response) => {
        window.clearTimeout(timer)
        if (response.ok) {
          resolve(response.data)
          return
        }
        if (response.snapshot) setSnapshot(response.snapshot)
        reject(responseError(response))
      })
    })
  }, [requireSocket, setSnapshot])

  const run = useCallback(async <T,>(operation: () => Promise<T>): Promise<T> => {
    setBusy(true)
    setError('')
    try {
      return await operation()
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '请求未能完成。'
      setError(message)
      throw caught
    } finally {
      setBusy(false)
    }
  }, [])

  const createRoom = useCallback((playerName: string) => run(async () => {
    const session = await request<SessionStart>((socket, acknowledge) => {
      socket.emit('room:create', { playerName }, acknowledge)
    })
    activeRef.current = true
    setCredentials(session.credentials)
    setSnapshot(session.snapshot)
  }), [request, run, setCredentials, setSnapshot])

  const joinRoom = useCallback((playerName: string, roomCode: string) => run(async () => {
    const session = await request<SessionStart>((socket, acknowledge) => {
      socket.emit('room:join', { playerName, roomCode }, acknowledge)
    })
    activeRef.current = true
    setCredentials(session.credentials)
    setSnapshot(session.snapshot)
  }), [request, run, setCredentials, setSnapshot])

  const resumeRoom = useCallback(() => run(async () => {
    const saved = credentialsRef.current
    if (!saved) throw new Error('没有可恢复的房间凭证。')
    const next = await request<RoomSnapshot>((socket, acknowledge) => {
      socket.emit('room:resume', saved, acknowledge)
    })
    activeRef.current = true
    setSnapshot(next)
  }), [request, run, setSnapshot])

  const setReady = useCallback((ready: boolean) => run(async () => {
    const next = await request<RoomSnapshot>((socket, acknowledge) => {
      socket.emit('room:ready', { ready }, acknowledge)
    })
    setSnapshot(next)
  }), [request, run, setSnapshot])

  const startGame = useCallback(() => run(async () => {
    const next = await request<RoomSnapshot>((socket, acknowledge) => {
      socket.emit('room:start', acknowledge)
    })
    setSnapshot(next)
  }), [request, run, setSnapshot])

  const sendCommand = useCallback((command: GameCommand) => run(async () => {
    const current = snapshotRef.current
    if (!current) throw new Error('尚未进入在线房间。')
    const next = await request<RoomSnapshot>((socket, acknowledge) => {
      socket.emit('game:command', {
        commandId: crypto.randomUUID(),
        expectedRevision: current.revision,
        command,
      }, acknowledge)
    })
    setSnapshot(next)
  }), [request, run, setSnapshot])

  const leaveRoom = useCallback(() => run(async () => {
    const retainCredentials = snapshotRef.current?.status === 'playing'
    await request<null>((socket, acknowledge) => socket.emit('room:leave', acknowledge))
    activeRef.current = false
    setSnapshot(null)
    if (!retainCredentials) setCredentials(null)
  }), [request, run, setCredentials, setSnapshot])

  const forgetSession = useCallback(() => {
    activeRef.current = false
    setSnapshot(null)
    setCredentials(null)
    setError('')
  }, [setCredentials, setSnapshot])

  return {
    snapshot,
    credentials,
    connectionState,
    busy,
    error,
    createRoom,
    joinRoom,
    resumeRoom,
    setReady,
    startGame,
    sendCommand,
    leaveRoom,
    forgetSession,
    clearError: () => setError(''),
  }
}
