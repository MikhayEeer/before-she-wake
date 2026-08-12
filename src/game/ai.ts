import { CARDS, HARMONY_TARGET } from './cards'
import {
  chooseClassExchange,
  confirmPrivateResult,
  drawYoungLadyCard,
  exchangeHarmonyCard,
  finishClassExchange,
  getDecisionPlayerId,
  inspectPlayer,
  moveSuspicionCard,
  playTurnAction,
  respondHonorStudent,
  returnYoungLadyCard,
  retrieveInfectedCard,
  selectNewsCard,
  takePlayedCard,
} from './engine'
import type { CardInstance, GameState, Player } from './types'

function stableNumber(state: GameState, salt = 0): number {
  return (Math.imul(state.rngSeed ^ (state.turn + salt), 2654435761) >>> 0) / 0x1_0000_0000
}

function choose<T>(state: GameState, items: T[], salt = 0): T {
  return items[Math.min(items.length - 1, Math.floor(stableNumber(state, salt) * items.length))]
}

function keepScore(card: CardInstance): number {
  const base: Record<CardInstance['cardId'], number> = {
    criminal: 100,
    alien: 82,
    infected: 72,
    accomplice: 66,
    'go-home-club': 58,
    'student-president': 50,
    'class-representative': 46,
    'honor-student': 44,
    'health-committee': 38,
    'discipline-committee': 36,
    'young-lady': 34,
    'news-club': 32,
    'library-committee': 30,
  }
  return base[card.cardId] + CARDS[card.cardId].point
}

function expendableCard(player: Player): CardInstance {
  const legal = player.hand.filter((card) => card.cardId !== 'criminal')
  const pool = legal.length > 0 ? legal : player.hand
  return [...pool].sort((left, right) => keepScore(left) - keepScore(right))[0]
}

function mostSuspiciousTarget(state: GameState, actorId: string): Player {
  const candidates = state.players.filter((player) => player.id !== actorId)
  return [...candidates].sort((left, right) => {
    const countDifference = right.suspicion.length - left.suspicion.length
    if (countDifference !== 0) return countDifference
    return right.hand.length - left.hand.length
  })[0]
}

function runTurn(state: GameState, actor: Player): GameState {
  const card = expendableCard(actor)
  if (!card) return state
  const definition = CARDS[card.cardId]
  const harmonyPointsVisible = state.harmony.length
  const target = mostSuspiciousTarget(state, actor.id)
  const roll = stableNumber(state, actor.hand.length)
  const needsHarmony = harmonyPointsVisible < HARMONY_TARGET[state.players.length]

  if (definition.point > 0 && needsHarmony && roll < 0.48) {
    return playTurnAction(state, { cardUid: card.uid, use: 'harmony' })
  }
  if (roll < 0.78) {
    return playTurnAction(state, { cardUid: card.uid, use: 'ability' })
  }
  return playTurnAction(state, {
    cardUid: card.uid,
    use: 'suspicion',
    targetPlayerId: target.id,
  })
}

export function runAiStep(state: GameState): GameState {
  const decisionPlayerId = getDecisionPlayerId(state)
  const decisionPlayer = state.players.find((player) => player.id === decisionPlayerId)
  if (!decisionPlayer || decisionPlayer.kind !== 'ai' || state.status === 'finished') return state

  switch (state.phase.kind) {
    case 'turn':
      return runTurn(state, decisionPlayer)
    case 'take-played': {
      const options = state.played.filter(
        (entry) =>
          entry.byPlayerId !== state.phase.actorId &&
          entry.card.cardId !== 'health-committee',
      )
      const selected = [...options].sort(
        (left, right) => keepScore(right.card) - keepScore(left.card),
      )[0]
      return takePlayedCard(state, selected.card.uid)
    }
    case 'inspect-player': {
      const targets = state.players.filter((player) => player.id !== decisionPlayer.id)
      return inspectPlayer(state, choose(state, targets, 2).id)
    }
    case 'inspect-result':
    case 'inspect-harmony':
    case 'honor-result':
      return confirmPrivateResult(state)
    case 'young-lady': {
      const targets = state.players.filter(
        (player) => player.id !== decisionPlayer.id && player.hand.length > 1,
      )
      const target = choose(state, targets, 3)
      return drawYoungLadyCard(state, target.id)
    }
    case 'young-lady-return':
      return returnYoungLadyCard(state, expendableCard(decisionPlayer).uid)
    case 'class-pick': {
      const targets = state.players.filter(
        (player) => player.id !== decisionPlayer.id && player.hand.length > 1,
      )
      const target = choose(state, targets, 5)
      return chooseClassExchange(state, target.id, expendableCard(decisionPlayer).uid)
    }
    case 'class-receive':
      return finishClassExchange(state, expendableCard(decisionPlayer).uid)
    case 'news-pass':
      return selectNewsCard(state, decisionPlayer.id, expendableCard(decisionPlayer).uid)
    case 'honor-alien-choice':
      return respondHonorStudent(state, stableNumber(state, 10) < 0.62)
    case 'move-suspicion': {
      const sources = state.players.filter((player) => player.suspicion.length > 0)
      const source = [...sources].sort((left, right) => right.suspicion.length - left.suspicion.length)[0]
      const destinations = state.players.filter(
        (player) => player.id !== source.id && player.id !== state.phase.actorId,
      )
      const destination = choose(state, destinations, 6)
      const cardIndex = Math.floor(stableNumber(state, 7) * source.suspicion.length)
      return moveSuspicionCard(state, source.id, cardIndex, destination.id)
    }
    case 'infected-retrieve': {
      const index = Math.floor(stableNumber(state, 8) * state.harmony.length)
      return retrieveInfectedCard(state, index)
    }
    case 'exchange-harmony': {
      const index = Math.floor(stableNumber(state, 9) * state.harmony.length)
      return exchangeHarmonyCard(state, expendableCard(decisionPlayer).uid, index)
    }
    default:
      return state
  }
}
