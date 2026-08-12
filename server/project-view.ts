import { createHmac } from 'node:crypto'

import { getDecisionPlayerId } from '../src/game/engine'
import type {
  CardInstance,
  EffectState,
  GameState,
  PlacedCard,
} from '../src/game/types'
import type {
  CardView,
  GamePhaseView,
  GamePlayerView,
  GameViewState,
  IntelRecordView,
  PlacedCardView,
} from '../src/shared/protocol'

export interface ProjectedGame {
  game: GameViewState
  decisionPlayerId: string | null
  canAct: boolean
}

function opaqueHandle(
  roomSecret: string,
  viewerId: string,
  scope: string,
  value: string,
): string {
  if (!roomSecret) throw new Error('A room secret is required to project game state.')
  const digest = createHmac('sha256', roomSecret)
    .update(`${viewerId}\u0000${scope}\u0000${value}`)
    .digest('base64url')
  return `h_${digest.slice(0, 32)}`
}

/** Used by the command boundary to compare an opaque browser handle to a card. */
export function cardHandle(
  roomSecret: string,
  viewerId: string,
  cardUid: string,
): string {
  return opaqueHandle(roomSecret, viewerId, 'card', cardUid)
}

function knownCard(
  card: CardInstance,
  roomSecret: string,
  viewerId: string,
): CardView {
  return {
    uid: cardHandle(roomSecret, viewerId, card.uid),
    cardId: card.cardId,
    hidden: false,
  }
}

function hiddenSlot(
  roomSecret: string,
  viewerId: string,
  slot: string,
): CardView {
  return {
    uid: opaqueHandle(roomSecret, viewerId, 'slot', slot),
    hidden: true,
  }
}

function knownPlacedCard(
  entry: PlacedCard,
  roomSecret: string,
  viewerId: string,
): PlacedCardView {
  return {
    card: knownCard(entry.card, roomSecret, viewerId),
    byPlayerId: entry.byPlayerId,
  }
}

function hiddenPlacedCard(
  entry: PlacedCard,
  roomSecret: string,
  viewerId: string,
  slot: string,
): PlacedCardView {
  return {
    card: hiddenSlot(roomSecret, viewerId, slot),
    byPlayerId: entry.byPlayerId,
  }
}

function projectIntel(
  state: GameState,
  viewerId: string,
  roomSecret: string,
): IntelRecordView[] {
  const viewer = state.players.find((player) => player.id === viewerId)
  if (!viewer) return []
  return viewer.intel.map((record) => ({
    id: opaqueHandle(roomSecret, viewerId, 'intel', record.id),
    turn: record.turn,
    title: record.title,
    cardIds: [...record.cardIds],
  }))
}

function projectPlayers(
  state: GameState,
  viewerId: string,
  roomSecret: string,
  revision: number,
): GamePlayerView[] {
  const finished = state.status === 'finished'
  const viewerIntel = projectIntel(state, viewerId, roomSecret)

  return state.players.map((player) => ({
    id: player.id,
    name: player.name,
    kind: player.kind,
    hand: player.hand.map((card, index) =>
      player.id === viewerId || finished
        ? knownCard(card, roomSecret, viewerId)
        : hiddenSlot(
            roomSecret,
            viewerId,
            `hand:${revision}:${player.id}:${index}`,
          ),
    ),
    suspicion: player.suspicion.map((entry, index) =>
      finished
        ? knownPlacedCard(entry, roomSecret, viewerId)
        : hiddenPlacedCard(
            entry,
            roomSecret,
            viewerId,
            `suspicion:${revision}:${player.id}:${index}`,
          ),
    ),
    intel: player.id === viewerId ? viewerIntel : [],
  }))
}

function projectPhase(
  phase: EffectState,
  viewerId: string,
  roomSecret: string,
): GamePhaseView {
  switch (phase.kind) {
    case 'turn':
    case 'inspect-player':
    case 'young-lady':
    case 'class-pick':
    case 'move-suspicion':
    case 'infected-retrieve':
    case 'exchange-harmony':
      return { kind: phase.kind, actorId: phase.actorId }
    case 'take-played':
      return {
        kind: phase.kind,
        actorId: phase.actorId,
        playedCardUid: cardHandle(roomSecret, viewerId, phase.playedCardUid),
      }
    case 'inspect-result':
      return {
        kind: phase.kind,
        actorId: phase.actorId,
        targetId: phase.targetId,
        ...(viewerId === phase.actorId ? { cardIds: [...phase.cardIds] } : {}),
      }
    case 'young-lady-return':
      return {
        kind: phase.kind,
        actorId: phase.actorId,
        targetId: phase.targetId,
        drawnCardUid: cardHandle(roomSecret, viewerId, phase.drawnCardUid),
      }
    case 'class-receive':
      return {
        kind: phase.kind,
        actorId: phase.actorId,
        targetId: phase.targetId,
        actorCardUid: cardHandle(roomSecret, viewerId, phase.actorCardUid),
      }
    case 'news-pass':
      return {
        kind: phase.kind,
        actorId: phase.actorId,
        participants: [...phase.participants],
        cursor: phase.cursor,
        selections: {},
      }
    case 'inspect-harmony':
      return {
        kind: phase.kind,
        actorId: phase.actorId,
        ...(viewerId === phase.actorId ? { cardIds: [...phase.cardIds] } : {}),
      }
    case 'honor-alien-choice':
      if (viewerId !== phase.alienPlayerId) return { kind: 'private-wait' }
      return {
        kind: phase.kind,
        actorId: phase.actorId,
        alienPlayerId: phase.alienPlayerId,
      }
    case 'honor-result':
      return {
        kind: phase.kind,
        actorId: phase.actorId,
        ...(viewerId === phase.actorId
          ? { signaledPlayerIds: [...phase.signaledPlayerIds] }
          : {}),
      }
  }
}

function cloneResult(state: GameState): GameViewState['result'] {
  if (state.status !== 'finished' || !state.result) return null
  return {
    ...state.result,
    winners: [...state.result.winners],
    suspicionPoints: { ...state.result.suspicionPoints },
    imprisoned: [...state.result.imprisoned],
  }
}

export function projectGame(
  state: GameState,
  viewerId: string,
  roomSecret: string,
  revision: number,
): ProjectedGame {
  const actualDecisionPlayerId = getDecisionPlayerId(state)
  const honorDecisionHidden =
    state.phase.kind === 'honor-alien-choice' &&
    viewerId !== state.phase.alienPlayerId
  const decisionPlayerId = honorDecisionHidden ? null : actualDecisionPlayerId
  const viewer = state.players.find((player) => player.id === viewerId)

  const game: GameViewState = {
    status: state.status,
    players: projectPlayers(state, viewerId, roomSecret, revision),
    harmony: state.harmony.map((entry, index) =>
      state.status === 'finished'
        ? knownPlacedCard(entry, roomSecret, viewerId)
        : hiddenPlacedCard(
            entry,
            roomSecret,
            viewerId,
            `harmony:${revision}:${index}`,
          ),
    ),
    played: state.played.map((entry) =>
      knownPlacedCard(entry, roomSecret, viewerId),
    ),
    phase: projectPhase(state.phase, viewerId, roomSecret),
    firstPlayerId: state.firstPlayerId,
    currentPlayerId: state.currentPlayerId,
    turn: state.turn,
    log: state.log.map((entry) => ({
      id: opaqueHandle(roomSecret, viewerId, 'log', entry.id),
      turn: entry.turn,
      text: entry.text,
      tone: entry.tone,
    })),
    result: cloneResult(state),
  }

  return {
    game,
    decisionPlayerId,
    canAct:
      state.status === 'playing' &&
      decisionPlayerId === viewerId &&
      viewer?.kind === 'human',
  }
}
