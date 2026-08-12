import {
  ArrowRight,
  Bot,
  BookOpen,
  ChevronRight,
  CircleAlert,
  Eye,
  GalleryHorizontalEnd,
  Handshake,
  LayoutGrid,
  LoaderCircle,
  LockKeyhole,
  Megaphone,
  Repeat2,
  RotateCcw,
  ScanSearch,
  ScrollText,
  Sparkles,
  UserRound,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CARDS, HARMONY_TARGET } from '../game/cards'
import type { GameCommand } from '../game/commands'
import { RuleError } from '../game/types'
import type {
  CardView,
  GameLogView,
  GamePlayerView,
  GameViewState,
  KnownCardView,
} from '../shared/protocol'
import { CardArt } from './CardArt'
import { GameCard } from './GameCard'
import { PrivacyGate } from './PrivacyGate'

interface GameScreenProps {
  game: GameViewState
  mode?: 'local' | 'online'
  viewerPlayerId?: string
  decisionPlayerId?: string | null
  canAct?: boolean
  commandPending?: boolean
  connectionState?: 'connected' | 'connecting' | 'disconnected'
  roomCode?: string
  onCommand: (command: GameCommand) => void | Promise<void>
  onNewGame: () => void
  onOpenRules: () => void
}

type MobileView = 'table' | 'hand' | 'action' | 'log'

export function GameScreen({
  game,
  mode = 'local',
  viewerPlayerId,
  decisionPlayerId: providedDecisionPlayerId,
  canAct: serverCanAct = false,
  commandPending = false,
  connectionState = 'connected',
  roomCode,
  onCommand,
  onNewGame,
  onOpenRules,
}: GameScreenProps) {
  const isOnline = mode === 'online'
  const decisionPlayerId = providedDecisionPlayerId === undefined
    ? deriveDecisionPlayerId(game)
    : providedDecisionPlayerId
  const decisionPlayer = game.players.find((player) => player.id === decisionPlayerId) ?? null
  const viewerPlayer = isOnline
    ? game.players.find((player) => player.id === viewerPlayerId) ?? null
    : decisionPlayer
  const [revealed, setRevealed] = useState(false)
  const [selectedCardUid, setSelectedCardUid] = useState('')
  const [message, setMessage] = useState('')
  const [mobileView, setMobileView] = useState<MobileView>('table')
  const [spotlight, setSpotlight] = useState<GameLogView | null>(null)
  const previousDecisionPlayer = useRef<string | null>(null)
  const previousPublicAction = useRef<string | null>(null)
  const spotlightReady = useRef(false)
  const phaseIdentity = `${game.turn}:${game.phase.kind}:${decisionPlayerId ?? 'none'}:${game.phase.kind === 'news-pass' ? game.phase.cursor : ''}`
  const publicAction = useMemo(
    () => game.log.find((entry) => entry.tone !== 'quiet') ?? game.log[0] ?? null,
    [game.log],
  )
  const recentActorId = useMemo(
    () => game.players.find((player) => publicAction?.text.startsWith(player.name))?.id ?? null,
    [game.players, publicAction?.text],
  )

  useEffect(() => {
    if (!isOnline && decisionPlayerId !== previousDecisionPlayer.current) {
      setRevealed(false)
      previousDecisionPlayer.current = decisionPlayerId
    }
    if (!isOnline && decisionPlayer?.kind === 'ai') setRevealed(false)
  }, [decisionPlayerId, decisionPlayer?.kind, isOnline])

  useEffect(() => {
    setSelectedCardUid('')
    setMessage('')
  }, [phaseIdentity])

  useEffect(() => {
    if (!publicAction || publicAction.id === previousPublicAction.current) return
    if (!spotlightReady.current) {
      spotlightReady.current = true
      previousPublicAction.current = publicAction.id
      return
    }
    previousPublicAction.current = publicAction.id
    setSpotlight(publicAction)
    const timer = window.setTimeout(() => setSpotlight(null), 2100)
    return () => window.clearTimeout(timer)
  }, [publicAction])

  useEffect(() => {
    if (game.status === 'finished') {
      setMobileView('table')
      return
    }
    if (!isOnline && decisionPlayer?.kind === 'ai') {
      setMobileView('table')
      return
    }
    if (isOnline && !serverCanAct) return
    if (!isOnline && !revealed) return
    setMobileView(game.phase.kind === 'turn' ? 'hand' : 'action')
  }, [decisionPlayer?.kind, game.phase.kind, game.status, isOnline, revealed, serverCanAct])

  const apply = (command: GameCommand) => {
    try {
      setMessage('')
      const pending = onCommand(command)
      if (pending instanceof Promise) {
        pending.catch((error) => {
          setMessage(error instanceof Error ? error.message : '行动未能完成。')
        })
      }
    } catch (error) {
      setMessage(error instanceof RuleError || error instanceof Error ? error.message : '行动未能完成。')
    }
  }

  const needsPrivacy =
    !isOnline && game.status === 'playing' && decisionPlayer?.kind === 'human' && !revealed
  const privateActionsEnabled = isOnline
    ? serverCanAct && connectionState === 'connected' && !commandPending
    : decisionPlayer?.kind === 'human' && revealed
  const handVisible = isOnline
    ? Boolean(viewerPlayer)
    : game.status === 'playing' && decisionPlayer?.kind === 'human' && revealed

  return (
    <main className="game-screen" data-mobile-view={mobileView}>
      <header className="game-header">
        <div className="game-brand">
          <span className="brand-mark">S.L.</span>
          <div>
            <p className="eyebrow">
              {isOnline
                ? `房间 ${roomCode ?? ''} · ${connectionState === 'connected' ? '已同步' : connectionState === 'connecting' ? '重连中' : '已离线'}`
                : '旧校舍 · 黎明前'}
            </p>
            <h1>冰冷的她醒来之前</h1>
          </div>
        </div>
        <div className="game-header__status">
          {roomCode && <span className="room-code-chip">房间 {roomCode}</span>}
          {isOnline && (
            <span className={`live-connection live-connection--${connectionState}`}>
              {connectionState === 'connected' ? <Wifi aria-hidden="true" /> : <WifiOff aria-hidden="true" />}
              {connectionState === 'connected' ? '已同步' : connectionState === 'connecting' ? '重连中' : '已离线'}
            </span>
          )}
          <span>回合 {game.turn}</span>
          <span>{game.harmony.length} 张调和牌</span>
          <span>{game.players.filter((player) => player.hand.length === 1).length}/{game.players.length} 身份锁定</span>
        </div>
        <div className="game-header__actions">
          <button type="button" className="icon-button" title="查看规则" onClick={onOpenRules}>
            <BookOpen aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-button"
            title={isOnline ? '离开当前房间' : '返回新对局'}
            onClick={() => {
              const prompt = isOnline
                ? '离开当前房间？你之后仍可使用本机凭证重新连接。'
                : '当前对局将保留在本地记录中，返回设置？'
              if (game.status === 'finished' || window.confirm(prompt)) {
                onNewGame()
              }
            }}
          >
            <RotateCcw aria-hidden="true" />
          </button>
        </div>
      </header>

      {publicAction && <PublicActionStrip key={publicAction.id} entry={publicAction} />}
      {spotlight && <ActionSpotlight key={spotlight.id} entry={spotlight} />}

      <div className="game-layout">
        <PlayerRail game={game} recentActorId={recentActorId} />

        <section className="board-column" aria-label="中央区域">
          {game.status === 'finished' && game.result && <ResultPanel game={game} />}
          <CentralScene game={game} />
          <HandArea
            game={game}
            handPlayer={viewerPlayer}
            visible={handVisible}
            interactive={Boolean(privateActionsEnabled)}
            selectedCardUid={selectedCardUid}
            onSelect={setSelectedCardUid}
            onOpenActions={() => setMobileView('action')}
          />
          <PublicLog game={game} />
        </section>

        <ActionColumn
          game={game}
          decisionPlayer={decisionPlayer}
          viewerPlayer={viewerPlayer}
          canAct={Boolean(privateActionsEnabled)}
          online={isOnline}
          commandPending={commandPending}
          selectedCardUid={selectedCardUid}
          message={message}
          apply={apply}
        />
      </div>

      <MobileGameNav
        view={mobileView}
        onChange={setMobileView}
        handCount={viewerPlayer?.kind === 'human' ? viewerPlayer.hand.length : 0}
        logCount={game.log.length}
        actionReady={Boolean(selectedCardUid) || game.phase.kind !== 'turn'}
        handEnabled={Boolean(handVisible)}
        actionEnabled={Boolean(privateActionsEnabled)}
      />

      {needsPrivacy && decisionPlayer && (
        <PrivacyGate
          playerName={decisionPlayer.name}
          prompt={privacyPrompt(game)}
          recentAction={publicAction?.text}
          onReveal={() => {
            setRevealed(true)
            setMobileView(game.phase.kind === 'turn' ? 'hand' : 'action')
          }}
        />
      )}
    </main>
  )
}

function PublicActionStrip({ entry }: { entry: GameLogView }) {
  return (
    <div className="public-action-strip" role="status" aria-live="polite" aria-atomic="true">
      <div className="public-action-strip__icon"><ActionGlyph text={entry.text} /></div>
      <div className="public-action-strip__body">
        <span>最新公开行动 · 回合 {entry.turn}</span>
        <strong>{entry.text}</strong>
      </div>
    </div>
  )
}

function ActionSpotlight({ entry }: { entry: GameLogView }) {
  return (
    <div className="action-spotlight" role="status" aria-live="polite" aria-atomic="true">
      <div className="action-spotlight__icon"><ActionGlyph text={entry.text} /></div>
      <div>
        <span>场上行动 · 回合 {entry.turn}</span>
        <strong>{entry.text}</strong>
      </div>
      <span className="action-spotlight__timer" aria-hidden="true" />
    </div>
  )
}

function ActionGlyph({ text }: { text: string }) {
  if (text.includes('调和')) return <Handshake aria-hidden="true" />
  if (text.includes('质疑')) return <ScanSearch aria-hidden="true" />
  if (text.includes('交换') || text.includes('传递') || text.includes('取回')) {
    return <Repeat2 aria-hidden="true" />
  }
  if (text.includes('发动') || text.includes('效果')) return <Sparkles aria-hidden="true" />
  return <Megaphone aria-hidden="true" />
}

function MobileGameNav({
  view,
  onChange,
  handCount,
  logCount,
  actionReady,
  handEnabled,
  actionEnabled,
}: {
  view: MobileView
  onChange: (view: MobileView) => void
  handCount: number
  logCount: number
  actionReady: boolean
  handEnabled: boolean
  actionEnabled: boolean
}) {
  const tabs: Array<{
    id: MobileView
    label: string
    icon: typeof LayoutGrid
    badge?: string
    disabled?: boolean
  }> = [
    { id: 'table', label: '桌面', icon: LayoutGrid },
    { id: 'hand', label: '手牌', icon: GalleryHorizontalEnd, badge: handCount ? String(handCount) : undefined, disabled: !handEnabled },
    { id: 'action', label: '行动', icon: Zap, badge: actionReady ? '!' : undefined, disabled: !actionEnabled },
    { id: 'log', label: '动态', icon: ScrollText, badge: logCount ? String(Math.min(logCount, 99)) : undefined },
  ]
  return (
    <nav className="mobile-game-nav" aria-label="游戏视图">
      {tabs.map((tab) => {
        const Icon = tab.icon
        return (
          <button
            type="button"
            key={tab.id}
            aria-current={view === tab.id ? 'page' : undefined}
            disabled={tab.disabled}
            onClick={() => onChange(tab.id)}
          >
            <span className="mobile-game-nav__icon">
              <Icon aria-hidden="true" />
              {tab.badge && <small>{tab.badge}</small>}
            </span>
            <span>{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

function PlayerRail({ game, recentActorId }: { game: GameViewState; recentActorId: string | null }) {
  const playerElements = useRef(new Map<string, HTMLElement>())

  useEffect(() => {
    if (window.innerWidth > 900) return
    const focusId = recentActorId ?? game.currentPlayerId
    playerElements.current.get(focusId)?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    })
  }, [game.currentPlayerId, recentActorId])

  return (
    <aside className="player-rail" aria-label="玩家状态">
      <div className="rail-heading">
        <p className="eyebrow">行动顺序</p>
        <strong>{game.players.length} 个班组</strong>
      </div>
      <div className="player-list">
        {game.players.map((player, index) => {
          const isCurrent = game.currentPlayerId === player.id && game.status === 'playing'
          const isRecent = recentActorId === player.id
          const locked = player.hand.length === 1
          const finalCard = game.status === 'finished' && isKnownCard(player.hand[0]) ? player.hand[0] : null
          return (
            <article
              className={`player-row ${isCurrent ? 'player-row--current' : ''} ${isRecent ? 'player-row--recent' : ''}`}
              key={player.id}
              ref={(element) => {
                if (element) playerElements.current.set(player.id, element)
                else playerElements.current.delete(player.id)
              }}
            >
              <div className="player-row__index">{String(index + 1).padStart(2, '0')}</div>
              <div className="player-row__body">
                <div className="player-row__name">
                  <strong>{player.name}</strong>
                  {player.kind === 'ai' ? <Bot size={14} aria-label="电脑" /> : <UserRound size={14} aria-label="真人" />}
                </div>
                <div className="player-row__meta">
                  <span>{locked ? <LockKeyhole size={12} /> : null}{player.hand.length} 张手牌</span>
                  <span>{player.suspicion.length} 次质疑</span>
                </div>
                {(isCurrent || isRecent) && (
                  <div className={`player-row__state ${isCurrent ? 'is-current' : 'is-recent'}`}>
                    {isCurrent ? '行动中' : '刚刚行动'}
                  </div>
                )}
                {finalCard && (
                  <div className="final-identity">
                    {CARDS[finalCard.cardId].name}
                    {game.result?.winners.includes(player.id) && <span>胜者</span>}
                  </div>
                )}
              </div>
              {(isCurrent || isRecent) && <span className={`turn-indicator ${isRecent ? 'turn-indicator--recent' : ''}`} title={isCurrent ? '当前行动' : '刚刚行动'} />}
            </article>
          )
        })}
      </div>
    </aside>
  )
}

function CentralScene({ game }: { game: GameViewState }) {
  return (
    <section className="central-scene">
      <div className="scene-subject">
        <CardArt src="/images/corpse.webp" alt="等待防腐处理的同伴" variant="scene" />
        <div className="scene-caption">
          <div>
            <p className="eyebrow">中央事件</p>
            <h2>她仍安静地躺在那里</h2>
          </div>
          <span className="target-label">目标 {HARMONY_TARGET[game.players.length]} MP</span>
        </div>
      </div>

      <div className="table-zones">
        <section className="table-zone" aria-labelledby="harmony-title">
          <div className="zone-heading">
            <div>
              <p className="eyebrow">面朝下</p>
              <h3 id="harmony-title">调和区</h3>
            </div>
            <strong>{game.harmony.length}</strong>
          </div>
          <div className="facedown-stack" aria-label={`${game.harmony.length} 张调和牌`}>
            {game.harmony.length === 0 ? (
              <p className="empty-state">尚无调和材料</p>
            ) : (
              game.harmony.slice(-5).map((entry, index) => (
                <div className="mini-card-back" key={entry.card.uid} style={{ '--offset': index } as React.CSSProperties}>
                  S.L.
                </div>
              ))
            )}
          </div>
        </section>

        <section className="table-zone" aria-labelledby="played-title">
          <div className="zone-heading">
            <div>
              <p className="eyebrow">公开信息</p>
              <h3 id="played-title">已发动</h3>
            </div>
            <strong>{game.played.length}</strong>
          </div>
          <div className="played-list">
            {game.played.length === 0 ? (
              <p className="empty-state">尚无公开角色</p>
            ) : (
              [...game.played].reverse().slice(0, 7).map((entry) => {
                if (!isKnownCard(entry.card)) return null
                return (
                  <div className="played-entry" key={entry.card.uid}>
                    <span className={`faction-dot faction-dot--${CARDS[entry.card.cardId].faction}`} />
                    <strong>{CARDS[entry.card.cardId].name}</strong>
                    <span>{game.players.find((player) => player.id === entry.byPlayerId)?.name}</span>
                  </div>
                )
              })
            )}
          </div>
        </section>
      </div>
    </section>
  )
}

function HandArea({
  game,
  handPlayer,
  visible,
  interactive,
  selectedCardUid,
  onSelect,
  onOpenActions,
}: {
  game: GameViewState
  handPlayer: GamePlayerView | null
  visible: boolean
  interactive: boolean
  selectedCardUid: string
  onSelect: (uid: string) => void
  onOpenActions: () => void
}) {
  const canShow = visible && handPlayer?.kind === 'human'
  const knownHand = handPlayer?.hand.filter(isKnownCard) ?? []
  const selectedCard = knownHand.find((card) => card.uid === selectedCardUid)
  return (
    <section className="hand-area" aria-labelledby="hand-title">
      <div className="section-heading section-heading--compact">
        <div>
          <p className="eyebrow">私人区域</p>
          <h2 id="hand-title">{canShow ? `${handPlayer.name} 的手牌` : '当前手牌'}</h2>
        </div>
        {canShow && <span>{handPlayer.hand.length} 张</span>}
      </div>
      {canShow ? (
        <div className="hand-scroller">
          {knownHand.map((card) => (
            <GameCard
              key={card.uid}
              card={card}
              selected={selectedCardUid === card.uid}
              disabled={!interactive || (game.phase.kind === 'turn' && card.cardId === 'criminal')}
              onClick={() => onSelect(card.uid)}
            />
          ))}
        </div>
      ) : (
        <div className="concealed-hand">
          {game.status === 'finished' ? (
            <><Eye size={18} /> 最终身份已经公开</>
          ) : handPlayer?.kind === 'ai' ? (
            <><LoaderCircle className="spin" size={18} /> {handPlayer.name} 正在决策</>
          ) : (
            <><LockKeyhole size={18} /> 私人手牌已遮蔽</>
          )}
        </div>
      )}
      {canShow && interactive && (
        <button
          type="button"
          className="mobile-hand-proceed"
          disabled={!selectedCard}
          onClick={onOpenActions}
        >
          <span>{selectedCard ? `处置「${CARDS[selectedCard.cardId].name}」` : '先选择一张手牌'}</span>
          <ArrowRight aria-hidden="true" />
        </button>
      )}
    </section>
  )
}

function ActionColumn({
  game,
  decisionPlayer,
  viewerPlayer,
  canAct,
  online,
  commandPending,
  selectedCardUid,
  message,
  apply,
}: {
  game: GameViewState
  decisionPlayer: GamePlayerView | null
  viewerPlayer: GamePlayerView | null
  canAct: boolean
  online: boolean
  commandPending: boolean
  selectedCardUid: string
  message: string
  apply: (command: GameCommand) => void
}) {
  const actionPlayer = canAct ? viewerPlayer : decisionPlayer
  return (
    <aside className="action-column" aria-label="行动面板">
      <div className="action-heading">
        <p className="eyebrow">当前指令</p>
        <h2>{phaseTitle(game)}</h2>
        <p>{phaseDescription(game, decisionPlayer)}</p>
      </div>
      {message && (
        <div className="inline-error" role="alert">
          <CircleAlert size={17} aria-hidden="true" />
          {message}
        </div>
      )}
      {canAct ? (
        <EffectControls
          game={game}
          decisionPlayer={viewerPlayer!}
          selectedCardUid={selectedCardUid}
          apply={apply}
        />
      ) : game.status === 'finished' ? (
        <div className="action-idle"><LockKeyhole size={20} /><span>本局行动结束</span></div>
      ) : decisionPlayer?.kind === 'ai' ? (
        <div className="action-idle"><LoaderCircle className="spin" size={20} /><span>电脑玩家处理中</span></div>
      ) : online ? (
        <div className="action-idle">
          {commandPending ? <LoaderCircle className="spin" size={20} /> : <UserRound size={20} />}
          <span>{commandPending ? '正在提交行动' : decisionPlayer ? `等待 ${decisionPlayer.name} 操作` : '等待一名玩家秘密回应'}</span>
        </div>
      ) : (
        <div className="action-idle"><Eye size={20} /><span>等待私人查看</span></div>
      )}

      <IntelArchive player={online ? viewerPlayer : canAct ? actionPlayer : null} />
    </aside>
  )
}

function EffectControls({
  game,
  decisionPlayer,
  selectedCardUid,
  apply,
}: {
  game: GameViewState
  decisionPlayer: GamePlayerView
  selectedCardUid: string
  apply: (command: GameCommand) => void
}) {
  const [targetId, setTargetId] = useState('')
  const [sourceId, setSourceId] = useState('')
  const [destinationId, setDestinationId] = useState('')
  const [slotIndex, setSlotIndex] = useState(0)
  const [targetCardIndex, setTargetCardIndex] = useState(0)
  const selectedCard = decisionPlayer.hand.find(
    (card): card is KnownCardView => isKnownCard(card) && card.uid === selectedCardUid,
  )

  useEffect(() => {
    setTargetId('')
    setSourceId('')
    setDestinationId('')
    setSlotIndex(0)
    setTargetCardIndex(0)
  }, [game.phase.kind, decisionPlayer.id])

  if (game.phase.kind === 'turn') {
    const targets = game.players.filter((player) => player.id !== decisionPlayer.id)
    return (
      <div className="effect-controls">
        <SelectedSummary selectedCard={selectedCard} />
        <label>
          <span>质疑对象</span>
          <select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
            <option value="">选择玩家</option>
            {targets.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
          </select>
        </label>
        <div className="action-choice-grid">
          <button
            type="button"
            disabled={!selectedCard}
            onClick={() => apply({ type: 'play-turn-action', cardUid: selectedCardUid, use: 'harmony' })}
          >
            <Handshake size={19} aria-hidden="true" />
            <strong>调和</strong>
            <span>面朝下投入中央</span>
          </button>
          <button
            type="button"
            disabled={!selectedCard || !targetId}
            onClick={() => apply({ type: 'play-turn-action', cardUid: selectedCardUid, use: 'suspicion', targetPlayerId: targetId })}
          >
            <ScanSearch size={19} aria-hidden="true" />
            <strong>质疑</strong>
            <span>面朝下指向玩家</span>
          </button>
          <button
            type="button"
            disabled={!selectedCard}
            onClick={() => apply({ type: 'play-turn-action', cardUid: selectedCardUid, use: 'ability' })}
          >
            <Sparkles size={19} aria-hidden="true" />
            <strong>发动</strong>
            <span>公开并执行能力</span>
          </button>
        </div>
      </div>
    )
  }

  if (game.phase.kind === 'take-played') {
    const actorId = game.phase.actorId
    return (
      <ChoiceList>
        {game.played.filter(
          (entry) =>
            isKnownCard(entry.card) &&
            entry.byPlayerId !== actorId &&
            entry.card.cardId !== 'health-committee',
        ).map((entry) => isKnownCard(entry.card) && (
          <button type="button" key={entry.card.uid} onClick={() => apply({ type: 'take-played-card', cardUid: entry.card.uid })}>
            <span>{CARDS[entry.card.cardId].name}</span><ChevronRight size={16} />
          </button>
        ))}
      </ChoiceList>
    )
  }

  if (game.phase.kind === 'inspect-player') {
    const targets = game.players.filter((player) => player.id !== decisionPlayer.id)
    return <PlayerChoices players={targets} onChoose={(id) => apply({ type: 'inspect-player', targetPlayerId: id })} />
  }

  if (game.phase.kind === 'inspect-result' || game.phase.kind === 'inspect-harmony') {
    const confirmCommand: GameCommand = game.phase.kind === 'inspect-result'
      ? { type: 'confirm-inspect-result' }
      : { type: 'confirm-inspect-harmony' }
    return (
      <div className="secret-result">
        <div className="secret-card-list">
          {(game.phase.cardIds ?? []).map((cardId, index) => (
            <div key={`${cardId}-${index}`}><strong>{CARDS[cardId].name}</strong><span>{CARDS[cardId].point} MP</span></div>
          ))}
        </div>
        <button type="button" className="primary-button" onClick={() => apply(confirmCommand)}>
          收起线索
        </button>
      </div>
    )
  }

  if (game.phase.kind === 'young-lady') {
    const targets = game.players.filter((player) => player.id !== decisionPlayer.id && player.hand.length > 1)
    return (
      <div className="effect-controls">
        <PlayerSelect players={targets} value={targetId} onChange={setTargetId} label="随机抽牌对象" />
        <button type="button" className="primary-button" disabled={!targetId} onClick={() => apply({ type: 'draw-young-lady-card', targetPlayerId: targetId })}>
          随机抽取一张
        </button>
      </div>
    )
  }

  if (game.phase.kind === 'young-lady-return') {
    const returnTargetId = game.phase.targetId
    const target = game.players.find((player) => player.id === returnTargetId)
    return (
      <div className="effect-controls">
        <SelectedSummary selectedCard={selectedCard} label={`交还给 ${target?.name ?? '对方'}`} />
        <button type="button" className="primary-button" disabled={!selectedCard} onClick={() => apply({ type: 'return-young-lady-card', cardUid: selectedCardUid })}>
          背面交还
        </button>
      </div>
    )
  }

  if (game.phase.kind === 'class-pick') {
    const targets = game.players.filter((player) => player.id !== decisionPlayer.id && player.hand.length > 1)
    return (
      <div className="effect-controls">
        <SelectedSummary selectedCard={selectedCard} label="交出的手牌" />
        <PlayerSelect players={targets} value={targetId} onChange={setTargetId} label="交换对象" />
        <button type="button" className="primary-button" disabled={!selectedCard || !targetId} onClick={() => apply({ type: 'choose-class-exchange', targetPlayerId: targetId, cardUid: selectedCardUid })}>
          等待对方选择
        </button>
      </div>
    )
  }

  if (game.phase.kind === 'class-receive') {
    return (
      <div className="effect-controls">
        <SelectedSummary selectedCard={selectedCard} label="交给班级委员的手牌" />
        <button type="button" className="primary-button" disabled={!selectedCard} onClick={() => apply({ type: 'finish-class-exchange', cardUid: selectedCardUid })}>
          确认交换
        </button>
      </div>
    )
  }

  if (game.phase.kind === 'news-pass') {
    const nextParticipantId = game.phase.participants[(game.phase.cursor + 1) % game.phase.participants.length]
    const nextPlayer = game.players.find((player) => player.id === nextParticipantId)
    return (
      <div className="effect-controls">
        <SelectedSummary selectedCard={selectedCard} label={`传给 ${nextPlayer?.name ?? '下一位'}`} />
        <button type="button" className="primary-button" disabled={!selectedCard} onClick={() => apply({ type: 'select-news-card', cardUid: selectedCardUid })}>
          封存并传递
        </button>
      </div>
    )
  }

  if (game.phase.kind === 'honor-alien-choice') {
    return (
      <div className="honor-choice">
        <button type="button" onClick={() => apply({ type: 'respond-honor-student', impersonate: false })}>保持沉默</button>
        <button type="button" className="primary-button" onClick={() => apply({ type: 'respond-honor-student', impersonate: true })}>冒充犯人示意</button>
      </div>
    )
  }

  if (game.phase.kind === 'honor-result') {
    const names = (game.phase.signaledPlayerIds ?? []).map(
      (id) => game.players.find((player) => player.id === id)?.name,
    ).filter(Boolean)
    return (
      <div className="secret-result">
        <div className="honor-result"><span>做出示意的玩家</span><strong>{names.join('、') || '无人'}</strong></div>
        <button type="button" className="primary-button" onClick={() => apply({ type: 'confirm-honor-result' })}>收起线索</button>
      </div>
    )
  }

  if (game.phase.kind === 'move-suspicion') {
    const actorId = game.phase.actorId
    const sources = game.players.filter((player) => player.suspicion.length > 0)
    const source = sources.find((player) => player.id === sourceId)
    const destinations = game.players.filter(
      (player) => player.id !== sourceId && player.id !== actorId,
    )
    return (
      <div className="effect-controls">
        <PlayerSelect players={sources} value={sourceId} onChange={(value) => { setSourceId(value); setSlotIndex(0) }} label="质疑牌来源" />
        {source && <UnknownSlotPicker count={source.suspicion.length} value={slotIndex} onChange={setSlotIndex} noun="质疑牌" />}
        <PlayerSelect players={destinations} value={destinationId} onChange={setDestinationId} label="新的接收者" />
        <button type="button" className="primary-button" disabled={!sourceId || !destinationId} onClick={() => apply({ type: 'move-suspicion-card', sourcePlayerId: sourceId, cardIndex: slotIndex, destinationPlayerId: destinationId })}>
          移动质疑牌
        </button>
      </div>
    )
  }

  if (game.phase.kind === 'infected-retrieve') {
    return (
      <div className="effect-controls">
        <UnknownSlotPicker count={game.harmony.length} value={slotIndex} onChange={setSlotIndex} noun="调和牌" />
        <button type="button" className="primary-button" onClick={() => apply({ type: 'retrieve-infected-card', harmonyIndex: slotIndex })}>
          秘密取回
        </button>
      </div>
    )
  }

  if (game.phase.kind === 'exchange-harmony') {
    return (
      <div className="effect-controls">
        <SelectedSummary selectedCard={selectedCard} label="放入调和区" />
        <UnknownSlotPicker count={game.harmony.length} value={slotIndex} onChange={setSlotIndex} noun="取回位置" />
        <button type="button" className="primary-button" disabled={!selectedCard} onClick={() => apply({ type: 'exchange-harmony-card', cardUid: selectedCardUid, harmonyIndex: slotIndex })}>
          完成调换
        </button>
      </div>
    )
  }

  return null
}

function SelectedSummary({ selectedCard, label = '已选手牌' }: { selectedCard?: KnownCardView; label?: string }) {
  return (
    <div className={`selected-summary ${selectedCard ? 'selected-summary--ready' : ''}`}>
      <span>{label}</span>
      <strong>{selectedCard ? CARDS[selectedCard.cardId].name : '尚未选择'}</strong>
      {selectedCard && <small>{CARDS[selectedCard.cardId].point} MP</small>}
    </div>
  )
}

function PlayerChoices({ players, onChoose }: { players: GamePlayerView[]; onChoose: (id: string) => void }) {
  return (
    <ChoiceList>
      {players.map((player) => (
        <button type="button" key={player.id} onClick={() => onChoose(player.id)}>
          <span>{player.name}<small>{player.hand.length} 张手牌</small></span><ChevronRight size={16} />
        </button>
      ))}
    </ChoiceList>
  )
}

function ChoiceList({ children }: { children: React.ReactNode }) {
  return <div className="choice-list">{children}</div>
}

function PlayerSelect({ players, value, onChange, label }: { players: GamePlayerView[]; value: string; onChange: (id: string) => void; label: string }) {
  return (
    <label>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">选择玩家</option>
        {players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
      </select>
    </label>
  )
}

function UnknownSlotPicker({ count, value, onChange, noun = '未知手牌' }: { count: number; value: number; onChange: (index: number) => void; noun?: string }) {
  return (
    <fieldset className="slot-picker">
      <legend>{noun}</legend>
      <div>
        {Array.from({ length: count }, (_, index) => (
          <button type="button" key={index} aria-pressed={value === index} onClick={() => onChange(index)}>
            {String(index + 1).padStart(2, '0')}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function IntelArchive({ player }: { player: GamePlayerView | null }) {
  if (!player || player.intel.length === 0) return null
  return (
    <section className="intel-archive">
      <p className="eyebrow">私人线索</p>
      {player.intel.slice(0, 5).map((record) => (
        <details key={record.id}>
          <summary>{record.title}<span>回合 {record.turn}</span></summary>
          <p>{record.cardIds.map((cardId) => CARDS[cardId].name).join(' · ')}</p>
        </details>
      ))}
    </section>
  )
}

function PublicLog({ game }: { game: GameViewState }) {
  return (
    <section className="public-log" aria-labelledby="log-title">
      <div className="section-heading section-heading--compact">
        <div><p className="eyebrow">公开记录</p><h2 id="log-title">事件簿</h2></div>
      </div>
      <div className="log-list">
        {game.log.slice(0, 10).map((entry) => (
          <div className={`log-entry log-entry--${entry.tone ?? 'normal'}`} key={entry.id}>
            <span>{String(entry.turn).padStart(2, '0')}</span><p>{entry.text}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function ResultPanel({ game }: { game: GameViewState }) {
  const result = game.result!
  const winners = game.players.filter((player) => result.winners.includes(player.id))
  return (
    <section className="result-panel" aria-labelledby="result-title">
      <div className="result-panel__headline">
        <p className="eyebrow">最终结算</p>
        <h2 id="result-title">{winners.length > 0 ? winners.map((player) => player.name).join('、') : '无人幸存'}</h2>
        <p>{result.reason}</p>
      </div>
      <div className="result-metrics">
        <div><span>调和值</span><strong>{result.harmonyPoints} / {result.harmonyTarget}</strong><small>{result.harmonySucceeded ? '成功' : '失败'}</small></div>
        <div><span>监禁名单</span><strong>{result.imprisoned.length}</strong><small>{result.imprisoned.length ? game.players.filter((player) => result.imprisoned.includes(player.id)).map((player) => player.name).join('、') : '无人'}</small></div>
      </div>
      <div className="result-identities">
        {game.players.map((player) => (
          <div key={player.id} className={result.winners.includes(player.id) ? 'is-winner' : ''}>
            <span>{player.name}</span>
            <strong>{isKnownCard(player.hand[0]) ? CARDS[player.hand[0].cardId].name : '未知'}</strong>
            <small>{result.suspicionPoints[player.id]} 质疑值</small>
          </div>
        ))}
      </div>
    </section>
  )
}

function phaseTitle(game: GameViewState): string {
  const titles: Record<GameViewState['phase']['kind'], string> = {
    'private-wait': '秘密回应',
    turn: '选择处置方式',
    'take-played': '保健委员',
    'inspect-player': '风纪委员',
    'inspect-result': '秘密查验',
    'young-lady': '大小姐',
    'young-lady-return': '大小姐归还',
    'class-pick': '班级委员',
    'class-receive': '回应班级委员',
    'news-pass': '新闻部传递',
    'inspect-harmony': '调和区查验',
    'honor-alien-choice': '优等生查验',
    'honor-result': '优等生示意',
    'move-suspicion': '共犯',
    'infected-retrieve': '感染者苏醒',
    'exchange-harmony': '归宅部',
  }
  return titles[game.phase.kind]
}

function phaseDescription(game: GameViewState, player: GamePlayerView | null): string {
  if (game.status === 'finished') return '最终身份与全部暗牌已经公开。'
  if (!player) return '等待下一项行动。'
  const descriptions: Record<GameViewState['phase']['kind'], string> = {
    'private-wait': '等待一名玩家完成秘密回应。',
    turn: `${player.name} 从手牌中下达一项指令。`,
    'take-played': '从旧的公开角色中取回一张。',
    'inspect-player': '指定一名玩家，秘密查看其手牌。',
    'inspect-result': '仅当前行动玩家可见。',
    'young-lady': '从另一名行动玩家手中随机抽取一张牌。',
    'young-lady-return': '从当前手牌中选择一张背面交还。',
    'class-pick': '选定对象，并先秘密交出一张牌。',
    'class-receive': `${player.name} 选择一张牌回应交换。`,
    'news-pass': `${player.name} 封存一张牌传给下一位。`,
    'inspect-harmony': '调和区的真实构成仅当前玩家可见。',
    'honor-alien-choice': '你持有外星人，可以选择是否冒充犯人。',
    'honor-result': '示意者中必有犯人，也可能混入外星人。',
    'move-suspicion': '移动一张仍然面朝下的质疑牌。',
    'infected-retrieve': '先从调和区取回一张，再继续正常行动。',
    'exchange-harmony': '将一张手牌与调和区的未知牌调换。',
  }
  return descriptions[game.phase.kind]
}

function privacyPrompt(game: GameViewState): string {
  if (game.phase.kind === 'class-receive') return '班级委员正在等待你的交换牌。'
  if (game.phase.kind === 'news-pass') return '新闻部要求你秘密封存一张手牌。'
  if (game.phase.kind === 'infected-retrieve') return '感染者效果将在正常行动前结算。'
  if (game.phase.kind === 'honor-alien-choice') return '优等生正在查验犯人；你可以选择是否冒充。'
  if (game.phase.kind === 'honor-result') return '优等生的秘密查验结果即将显示。'
  return '你的手牌与私人线索即将显示。'
}

function deriveDecisionPlayerId(game: GameViewState): string | null {
  if (game.status === 'finished') return null
  if (game.phase.kind === 'private-wait') return null
  if (game.phase.kind === 'news-pass') {
    return game.phase.participants[game.phase.cursor] ?? null
  }
  if (game.phase.kind === 'class-receive') return game.phase.targetId
  if (game.phase.kind === 'honor-alien-choice') return game.phase.alienPlayerId
  return game.phase.actorId
}

function isKnownCard(card: CardView | undefined): card is KnownCardView {
  return Boolean(card && card.hidden === false)
}
