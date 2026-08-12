export type CardId =
  | 'student-president'
  | 'health-committee'
  | 'library-committee'
  | 'discipline-committee'
  | 'young-lady'
  | 'news-club'
  | 'class-representative'
  | 'honor-student'
  | 'criminal'
  | 'accomplice'
  | 'alien'
  | 'infected'
  | 'go-home-club'

export type Faction = 'good' | 'criminal' | 'neutral'
export type PlayerKind = 'human' | 'ai'

export interface CardDefinition {
  id: CardId
  name: string
  shortName: string
  point: number
  faction: Faction
  priority: number
  ability: string
  victory: string
  image: string
}

export interface CardInstance {
  uid: string
  cardId: CardId
}

export interface PlacedCard {
  card: CardInstance
  byPlayerId: string
}

export interface IntelRecord {
  id: string
  turn: number
  title: string
  cardIds: CardId[]
}

export interface Player {
  id: string
  name: string
  kind: PlayerKind
  hand: CardInstance[]
  suspicion: PlacedCard[]
  intel: IntelRecord[]
}

export interface PlayerConfig {
  id: string
  name: string
  kind: PlayerKind
}

export type EffectState =
  | { kind: 'turn'; actorId: string }
  | { kind: 'take-played'; actorId: string; playedCardUid: string }
  | { kind: 'inspect-player'; actorId: string }
  | { kind: 'inspect-result'; actorId: string; targetId: string; cardIds: CardId[] }
  | { kind: 'young-lady'; actorId: string }
  | { kind: 'young-lady-return'; actorId: string; targetId: string; drawnCardUid: string }
  | { kind: 'class-pick'; actorId: string }
  | { kind: 'class-receive'; actorId: string; targetId: string; actorCardUid: string }
  | {
      kind: 'news-pass'
      actorId: string
      participants: string[]
      cursor: number
      selections: Record<string, string>
    }
  | { kind: 'inspect-harmony'; actorId: string; cardIds: CardId[] }
  | { kind: 'honor-alien-choice'; actorId: string; alienPlayerId: string; signaledPlayerIds: string[] }
  | { kind: 'honor-result'; actorId: string; signaledPlayerIds: string[] }
  | { kind: 'move-suspicion'; actorId: string }
  | { kind: 'infected-retrieve'; actorId: string }
  | { kind: 'exchange-harmony'; actorId: string }

export interface GameResult {
  winners: string[]
  reason: string
  harmonyPoints: number
  harmonyTarget: number
  harmonySucceeded: boolean
  suspicionPoints: Record<string, number>
  imprisoned: string[]
}

export interface LogEntry {
  id: string
  turn: number
  text: string
  tone?: 'normal' | 'alert' | 'quiet'
}

export interface GameState {
  version: 1
  status: 'playing' | 'finished'
  players: Player[]
  harmony: PlacedCard[]
  played: PlacedCard[]
  unused: CardInstance[]
  phase: EffectState
  firstPlayerId: string
  currentPlayerId: string
  pendingInfected: string[]
  turn: number
  rngSeed: number
  log: LogEntry[]
  result: GameResult | null
}

export type CardUse = 'harmony' | 'suspicion' | 'ability'

export interface TurnAction {
  cardUid: string
  use: CardUse
  targetPlayerId?: string
}

export class RuleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RuleError'
  }
}
