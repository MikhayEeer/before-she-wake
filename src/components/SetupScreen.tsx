import { ArrowLeft, Bot, Play, RotateCcw, UserRound, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { GameState, PlayerConfig, PlayerKind } from '../game/types'
import { CardArt } from './CardArt'

interface SetupScreenProps {
  savedGame: GameState | null
  onStart: (configs: PlayerConfig[]) => void
  onResume: () => void
  onDiscardSave: () => void
  onBack?: () => void
}

const DEFAULT_NAMES = ['白石', '千夏', '弥生', '纱夜', '凛', '美羽']

function defaultConfigs(count: number): PlayerConfig[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `player-${index + 1}`,
    name: index === 0 ? '你' : DEFAULT_NAMES[index],
    kind: index === 0 ? 'human' : 'ai',
  }))
}

export function SetupScreen({
  savedGame,
  onStart,
  onResume,
  onDiscardSave,
  onBack,
}: SetupScreenProps) {
  const [playerCount, setPlayerCount] = useState(3)
  const [configs, setConfigs] = useState<PlayerConfig[]>(() => defaultConfigs(3))
  const humanCount = useMemo(
    () => configs.filter((player) => player.kind === 'human').length,
    [configs],
  )

  const changeCount = (count: number) => {
    setPlayerCount(count)
    setConfigs((current) => {
      const next = defaultConfigs(count)
      current.slice(0, count).forEach((player, index) => {
        next[index] = player
      })
      return next
    })
  }

  const updatePlayer = (index: number, patch: Partial<PlayerConfig>) => {
    setConfigs((current) =>
      current.map((player, playerIndex) =>
        playerIndex === index ? { ...player, ...patch } : player,
      ),
    )
  }

  return (
    <main className="setup-screen">
      <header className="setup-header">
        <div>
          {onBack && (
            <button type="button" className="text-button setup-back-button" onClick={onBack}>
              <ArrowLeft size={17} aria-hidden="true" />
              返回模式选择
            </button>
          )}
          <p className="eyebrow">圣莉莉女子学院 · 旧校舍</p>
          <h1>冰冷的她醒来之前</h1>
          <p className="setup-story">
            救援迟迟未至。天亮时，一名同伴已经没有呼吸。有限的材料、彼此的猜疑，以及藏在队伍里的真相，都必须在她醒来之前处理完毕。
          </p>
        </div>
        <CardArt src="/images/corpse.webp" alt="旧校舍中央场景" variant="scene" />
      </header>

      {savedGame && (
        <section className="resume-band" aria-label="未完成对局">
          <div>
            <span className="status-dot" />
            <strong>{savedGame.status === 'finished' ? '上局结算仍保留' : `第 ${savedGame.turn} 回合尚未结束`}</strong>
            <span>{savedGame.players.length} 名玩家</span>
          </div>
          <div className="button-row">
            <button type="button" className="text-button" onClick={onDiscardSave}>
              <RotateCcw size={17} aria-hidden="true" />
              放弃记录
            </button>
            <button type="button" className="primary-button" onClick={onResume}>
              <Play size={17} aria-hidden="true" />
              继续对局
            </button>
          </div>
        </section>
      )}

      <section className="setup-workspace" aria-labelledby="setup-title">
        <div className="setup-controls">
          <div className="section-heading">
            <div>
              <p className="eyebrow">建立队伍</p>
              <h2 id="setup-title">玩家席位</h2>
            </div>
            <span className="human-count">
              <Users size={16} aria-hidden="true" />
              {humanCount} 名真人
            </span>
          </div>

          <div className="segmented-control" aria-label="玩家人数">
            {[3, 4, 5, 6].map((count) => (
              <button
                type="button"
                key={count}
                aria-pressed={playerCount === count}
                onClick={() => changeCount(count)}
              >
                {count} 人
              </button>
            ))}
          </div>

          <div className="player-config-list">
            {configs.map((player, index) => (
              <div className="player-config-row" key={player.id}>
                <span className="seat-number">{String(index + 1).padStart(2, '0')}</span>
                <input
                  aria-label={`玩家 ${index + 1} 名称`}
                  maxLength={10}
                  value={player.name}
                  onChange={(event) => updatePlayer(index, { name: event.target.value })}
                />
                <KindToggle
                  kind={player.kind}
                  onChange={(kind) => updatePlayer(index, { kind })}
                />
              </div>
            ))}
          </div>

          <button
            type="button"
            className="start-button"
            disabled={configs.some((player) => !player.name.trim())}
            onClick={() => onStart(configs)}
          >
            <Play size={19} fill="currentColor" aria-hidden="true" />
            开始发牌
          </button>
        </div>

        <aside className="setup-brief" aria-label="本局参数">
          <p className="eyebrow">本局参数</p>
          <dl>
            <div>
              <dt>调和目标</dt>
              <dd>{12 - playerCount} MP</dd>
            </div>
            <div>
              <dt>预计用时</dt>
              <dd>10–20 分钟</dd>
            </div>
            <div>
              <dt>身份锁定</dt>
              <dd>最后 1 张</dd>
            </div>
          </dl>
          <div className="brief-rule">
            <span>每回合</span>
            <strong>调和 · 质疑 · 发动</strong>
          </div>
          <p>
            所有席位均可设为真人或电脑。多名真人使用同一设备时，系统会在秘密决策前遮住手牌。
          </p>
        </aside>
      </section>
    </main>
  )
}

function KindToggle({ kind, onChange }: { kind: PlayerKind; onChange: (kind: PlayerKind) => void }) {
  return (
    <div className="kind-toggle" role="group" aria-label="席位类型">
      <button
        type="button"
        aria-pressed={kind === 'human'}
        title="真人玩家"
        onClick={() => onChange('human')}
      >
        <UserRound size={16} aria-hidden="true" />
        真人
      </button>
      <button
        type="button"
        aria-pressed={kind === 'ai'}
        title="本地基础策略电脑"
        onClick={() => onChange('ai')}
      >
        <Bot size={16} aria-hidden="true" />
        基础电脑
      </button>
    </div>
  )
}
