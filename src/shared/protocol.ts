import type { GameCommand } from '../game/commands'
import type {
  CardId,
  GameResult,
  GameState,
  PlayerKind,
} from '../game/types'

export interface KnownCardView {
  uid: string
  cardId: CardId
  hidden: false
}

export interface HiddenCardView {
  uid: string
  hidden: true
}

export type CardView = KnownCardView | HiddenCardView

export interface PlacedCardView {
  card: CardView
  byPlayerId?: string
}

export interface IntelRecordView {
  id: string
  turn: number
  title: string
  cardIds: CardId[]
}

export interface GamePlayerView {
  id: string
  name: string
  kind: PlayerKind
  hand: CardView[]
  suspicion: PlacedCardView[]
  intel: IntelRecordView[]
}

export interface GameLogView {
  id: string
  turn: number
  text: string
  tone?: 'normal' | 'alert' | 'quiet'
}

export type GamePhaseView =
  | { kind: 'private-wait' }
  | { kind: 'turn'; actorId: string }
  | { kind: 'take-played'; actorId: string; playedCardUid: string }
  | { kind: 'inspect-player'; actorId: string }
  | { kind: 'inspect-result'; actorId: string; targetId: string; cardIds?: CardId[] }
  | { kind: 'young-lady'; actorId: string }
  | { kind: 'young-lady-return'; actorId: string; targetId: string; drawnCardUid: string }
  | { kind: 'class-pick'; actorId: string }
  | { kind: 'class-receive'; actorId: string; targetId: string; actorCardUid: string }
  | {
      kind: 'news-pass'
      actorId: string
      participants: string[]
      cursor: number
      selections: Record<string, never>
    }
  | { kind: 'inspect-harmony'; actorId: string; cardIds?: CardId[] }
  | { kind: 'honor-alien-choice'; actorId: string; alienPlayerId: string }
  | { kind: 'honor-result'; actorId: string; signaledPlayerIds?: string[] }
  | { kind: 'move-suspicion'; actorId: string }
  | { kind: 'infected-retrieve'; actorId: string }
  | { kind: 'exchange-harmony'; actorId: string }

/**
 * The serializable game state exposed to a browser. Server-only fields are
 * intentionally absent instead of being optional so they cannot be populated
 * accidentally by object spreading a GameState.
 */
export interface GameViewState
  extends Pick<
    GameState,
    'status' | 'firstPlayerId' | 'currentPlayerId' | 'turn'
  > {
  players: GamePlayerView[]
  harmony: PlacedCardView[]
  played: PlacedCardView[]
  phase: GamePhaseView
  log: GameLogView[]
  result: GameResult | null
}

export interface RoomPlayerView {
  id: string
  name: string
  kind: PlayerKind
  ready: boolean
  connected: boolean
  isHost: boolean
}

export interface SessionCredentials {
  roomCode: string
  playerId: string
  resumeToken: string
}

export interface RoomSnapshot {
  roomCode: string
  revision: number
  status: 'lobby' | 'playing' | 'finished'
  viewerId: string
  hostPlayerId: string
  players: RoomPlayerView[]
  game: GameViewState | null
  decisionPlayerId: string | null
  canAct: boolean
}

export type Ack<T = null> =
  | { ok: true; data: T }
  | {
      ok: false
      code: string
      message: string
      snapshot?: RoomSnapshot
    }

export interface GameCommandEnvelope {
  commandId: string
  expectedRevision: number
  command: GameCommand
}

export interface CreateRoomRequest {
  playerName: string
}

export interface JoinRoomRequest {
  roomCode: string
  playerName: string
}

export type SessionStart = {
  credentials: SessionCredentials
  snapshot: RoomSnapshot
}

type AckCallback<T> = (response: Ack<T>) => void

export interface ClientToServerEvents {
  'room:create': (
    request: CreateRoomRequest,
    acknowledge: AckCallback<SessionStart>,
  ) => void
  'room:join': (
    request: JoinRoomRequest,
    acknowledge: AckCallback<SessionStart>,
  ) => void
  'room:resume': (
    credentials: SessionCredentials,
    acknowledge: AckCallback<RoomSnapshot>,
  ) => void
  'room:ready': (
    request: { ready: boolean },
    acknowledge: AckCallback<RoomSnapshot>,
  ) => void
  'room:start': (acknowledge: AckCallback<RoomSnapshot>) => void
  'room:leave': (acknowledge: AckCallback<null>) => void
  'game:command': (
    envelope: GameCommandEnvelope,
    acknowledge: AckCallback<RoomSnapshot>,
  ) => void
}

export interface ServerToClientEvents {
  'room:snapshot': (snapshot: RoomSnapshot) => void
  'room:error': (error: Extract<Ack<never>, { ok: false }>) => void
}
