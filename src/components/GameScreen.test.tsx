import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { makePlacedCard } from '../game/engine'
import { createLocalGameView } from '../game/local-view'
import type { CardId, GameState, Player } from '../game/types'
import { GameScreen } from './GameScreen'

function player(id: string, name: string, cardIds: CardId[], kind: Player['kind']): Player {
  return {
    id,
    name,
    kind,
    hand: cardIds.map((cardId, index) => ({ cardId, uid: `${id}-${cardId}-${index}` })),
    suspicion: [],
    intel: [],
  }
}

function gameState(): GameState {
  return {
    version: 1,
    status: 'playing',
    players: [
      player('p1', '小林', ['student-president', 'criminal'], 'human'),
      player('p2', '电脑甲', ['alien', 'infected'], 'ai'),
      player('p3', '电脑乙', ['go-home-club', 'library-committee'], 'ai'),
    ],
    harmony: [makePlacedCard('honor-student', 'harmony-hidden', 'p2')],
    played: [],
    unused: [],
    phase: { kind: 'turn', actorId: 'p1' },
    firstPlayerId: 'p1',
    currentPlayerId: 'p1',
    pendingInfected: [],
    turn: 4,
    rngSeed: 42,
    log: [
      { id: 'quiet-4', turn: 4, text: '这是一条私人记录。', tone: 'quiet' },
      { id: 'public-3', turn: 3, text: '电脑甲 向 小林 放置了一张面朝下的质疑牌。', tone: 'alert' },
      { id: 'public-2', turn: 2, text: '电脑乙 将一张牌面朝下放入调和区。' },
    ],
    result: null,
  }
}

describe('GameScreen mobile navigation and public action', () => {
  it('renders mobile views and keeps the latest non-private action prominent', () => {
    const { container } = render(
      <GameScreen
        game={createLocalGameView(gameState())}
        onCommand={vi.fn()}
        onNewGame={vi.fn()}
        onOpenRules={vi.fn()}
      />,
    )

    const navigation = screen.getByRole('navigation', { name: '游戏视图' })
    const tableButton = within(navigation).getByRole('button', { name: /桌面/ })
    const handButton = within(navigation).getByRole('button', { name: /手牌/ })
    const actionButton = within(navigation).getByRole('button', { name: /行动/ })
    const logButton = within(navigation).getByRole('button', { name: /动态/ })

    expect(tableButton).toHaveAttribute('aria-current', 'page')
    expect(handButton).toBeDisabled()
    expect(actionButton).toBeDisabled()

    const publicStrip = container.querySelector<HTMLElement>('.public-action-strip')
    expect(publicStrip).not.toBeNull()
    expect(within(publicStrip!).getByText('最新公开行动 · 回合 3')).toBeInTheDocument()
    expect(within(publicStrip!).getByText(/电脑甲 向 小林/)).toBeInTheDocument()
    expect(within(publicStrip!).queryByText('这是一条私人记录。')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /查看我的信息/ }))
    expect(handButton).not.toBeDisabled()
    expect(actionButton).not.toBeDisabled()
    expect(handButton).toHaveAttribute('aria-current', 'page')

    fireEvent.click(logButton)
    expect(logButton).toHaveAttribute('aria-current', 'page')
    expect(container.querySelector('main')).toHaveAttribute('data-mobile-view', 'log')
  })
})
