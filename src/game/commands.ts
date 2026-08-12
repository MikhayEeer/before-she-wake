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
import type { CardUse, GameState } from './types'
import { RuleError } from './types'

export type GameCommand =
  | {
      type: 'play-turn-action'
      cardUid: string
      use: CardUse
      targetPlayerId?: string
    }
  | { type: 'take-played-card'; cardUid: string }
  | { type: 'inspect-player'; targetPlayerId: string }
  | { type: 'confirm-inspect-result' }
  | { type: 'draw-young-lady-card'; targetPlayerId: string }
  | { type: 'return-young-lady-card'; cardUid: string }
  | { type: 'choose-class-exchange'; targetPlayerId: string; cardUid: string }
  | { type: 'finish-class-exchange'; cardUid: string }
  | { type: 'select-news-card'; cardUid: string }
  | { type: 'confirm-inspect-harmony' }
  | { type: 'respond-honor-student'; impersonate: boolean }
  | { type: 'confirm-honor-result' }
  | {
      type: 'move-suspicion-card'
      sourcePlayerId: string
      cardIndex: number
      destinationPlayerId: string
    }
  | { type: 'retrieve-infected-card'; harmonyIndex: number }
  | { type: 'exchange-harmony-card'; cardUid: string; harmonyIndex: number }

function requirePhase(
  state: GameState,
  expected: GameState['phase']['kind'],
): void {
  if (state.phase.kind !== expected) {
    throw new RuleError('该命令与当前游戏阶段不匹配。')
  }
}

export function applyGameCommand(
  state: GameState,
  authenticatedPlayerId: string,
  command: GameCommand,
): GameState {
  if (authenticatedPlayerId !== getDecisionPlayerId(state)) {
    throw new RuleError('你不是当前需要行动的玩家。')
  }

  switch (command.type) {
    case 'play-turn-action':
      return playTurnAction(state, {
        cardUid: command.cardUid,
        use: command.use,
        targetPlayerId: command.targetPlayerId,
      })
    case 'take-played-card':
      return takePlayedCard(state, command.cardUid)
    case 'inspect-player':
      return inspectPlayer(state, command.targetPlayerId)
    case 'confirm-inspect-result':
      requirePhase(state, 'inspect-result')
      return confirmPrivateResult(state)
    case 'draw-young-lady-card':
      return drawYoungLadyCard(state, command.targetPlayerId)
    case 'return-young-lady-card':
      return returnYoungLadyCard(state, command.cardUid)
    case 'choose-class-exchange':
      return chooseClassExchange(state, command.targetPlayerId, command.cardUid)
    case 'finish-class-exchange':
      return finishClassExchange(state, command.cardUid)
    case 'select-news-card':
      return selectNewsCard(state, authenticatedPlayerId, command.cardUid)
    case 'confirm-inspect-harmony':
      requirePhase(state, 'inspect-harmony')
      return confirmPrivateResult(state)
    case 'respond-honor-student':
      return respondHonorStudent(state, command.impersonate)
    case 'confirm-honor-result':
      requirePhase(state, 'honor-result')
      return confirmPrivateResult(state)
    case 'move-suspicion-card':
      return moveSuspicionCard(
        state,
        command.sourcePlayerId,
        command.cardIndex,
        command.destinationPlayerId,
      )
    case 'retrieve-infected-card':
      return retrieveInfectedCard(state, command.harmonyIndex)
    case 'exchange-harmony-card':
      return exchangeHarmonyCard(state, command.cardUid, command.harmonyIndex)
    default:
      throw new RuleError('无法识别该游戏命令。')
  }
}
