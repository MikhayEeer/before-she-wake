import type { EffectState, GameState } from './types'
import type {
  GamePhaseView,
  GameViewState,
  KnownCardView,
  PlacedCardView,
} from '../shared/protocol'

function knownCard(card: GameState['players'][number]['hand'][number]): KnownCardView {
  return { ...card, hidden: false }
}

function placedCard(
  entry: GameState['harmony'][number],
  reveal: boolean,
): PlacedCardView {
  return {
    card: reveal
      ? knownCard(entry.card)
      : { uid: entry.card.uid, hidden: true },
    byPlayerId: entry.byPlayerId,
  }
}

function localPhase(phase: EffectState): GamePhaseView {
  if (phase.kind === 'news-pass') {
    return {
      kind: phase.kind,
      actorId: phase.actorId,
      participants: [...phase.participants],
      cursor: phase.cursor,
      selections: {},
    }
  }
  if (phase.kind === 'honor-alien-choice') {
    return {
      kind: phase.kind,
      actorId: phase.actorId,
      alienPlayerId: phase.alienPlayerId,
    }
  }
  if (phase.kind === 'inspect-result' || phase.kind === 'inspect-harmony') {
    return { ...phase, cardIds: [...phase.cardIds] }
  }
  if (phase.kind === 'honor-result') {
    return { ...phase, signaledPlayerIds: [...phase.signaledPlayerIds] }
  }
  return { ...phase }
}

export function createLocalGameView(state: GameState): GameViewState {
  const revealPlacedCards = state.status === 'finished'
  return {
    status: state.status,
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      kind: player.kind,
      hand: player.hand.map(knownCard),
      suspicion: player.suspicion.map((entry) => placedCard(entry, revealPlacedCards)),
      intel: player.intel.map((record) => ({
        ...record,
        cardIds: [...record.cardIds],
      })),
    })),
    harmony: state.harmony.map((entry) => placedCard(entry, revealPlacedCards)),
    played: state.played.map((entry) => placedCard(entry, true)),
    phase: localPhase(state.phase),
    firstPlayerId: state.firstPlayerId,
    currentPlayerId: state.currentPlayerId,
    turn: state.turn,
    log: state.log.map((entry) => ({ ...entry })),
    result: state.result ? structuredClone(state.result) : null,
  }
}
