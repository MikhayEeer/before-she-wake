import {
  Bot,
  Check,
  CircleOff,
  Copy,
  Crown,
  LoaderCircle,
  LogOut,
  Play,
  Radio,
  UserRound,
  Users,
} from 'lucide-react'
import type { RoomSnapshot } from '../shared/protocol'

interface RoomLobbyProps {
  snapshot: RoomSnapshot
  busy: boolean
  error: string
  onToggleReady: () => void
  onStart: () => void
  onLeave: () => void
  onShare: () => void
}

const MAX_PLAYERS = 6
const MIN_PLAYERS = 3

export function RoomLobby({
  snapshot,
  busy,
  error,
  onToggleReady,
  onStart,
  onLeave,
  onShare,
}: RoomLobbyProps) {
  const viewer = snapshot.players.find((player) => player.id === snapshot.viewerId)
  const humanPlayers = snapshot.players.filter((player) => player.kind === 'human')
  const isHost = snapshot.hostPlayerId === snapshot.viewerId || Boolean(viewer?.isHost)
  const validPlayerCount =
    snapshot.players.length >= MIN_PLAYERS && snapshot.players.length <= MAX_PLAYERS
  const allHumansReady = humanPlayers.every((player) => player.ready && player.connected)
  const canStart =
    snapshot.status === 'lobby' && isHost && validPlayerCount && allHumansReady && !busy
  const connectedCount = snapshot.players.filter((player) => player.connected).length
  const seats = Array.from({ length: MAX_PLAYERS }, (_, index) => snapshot.players[index] ?? null)

  const startHint = getStartHint(snapshot, isHost, validPlayerCount, allHumansReady)

  return (
    <main className="room-lobby-screen">
      <header className="room-lobby-header">
        <div>
          <p className="eyebrow">在线房间</p>
          <h1>等待队伍集合</h1>
        </div>
        <button type="button" className="text-button" disabled={busy} onClick={onLeave}>
          <LogOut size={17} aria-hidden="true" />
          退出房间
        </button>
      </header>

      <section className="room-summary" aria-label="房间信息">
        <div className="room-code-block">
          <span>房间码</span>
          <strong aria-label={`房间码 ${snapshot.roomCode}`}>{snapshot.roomCode}</strong>
          <button type="button" className="icon-button" title="复制邀请链接" onClick={onShare}>
            <Copy aria-hidden="true" />
          </button>
        </div>
        <div className={`room-connection ${viewer?.connected ? 'is-connected' : 'is-disconnected'}`} role="status">
          {viewer?.connected ? <Radio aria-hidden="true" /> : <CircleOff aria-hidden="true" />}
          <span>{viewer?.connected ? '已连接服务器' : '连接已中断'}</span>
          <small>{connectedCount}/{snapshot.players.length} 人在线</small>
        </div>
      </section>

      <section className="room-lobby-workspace" aria-labelledby="room-seats-title">
        <div className="room-seats-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">玩家席位</p>
              <h2 id="room-seats-title">{snapshot.players.length}/{MAX_PLAYERS} 人已加入</h2>
            </div>
            <span className="human-count">
              <Users size={16} aria-hidden="true" />
              {humanPlayers.length} 名真人
            </span>
          </div>

          <div className="room-seat-list">
            {seats.map((player, index) => (
              <article
                className={`room-seat ${player ? 'room-seat--occupied' : 'room-seat--empty'} ${player?.id === snapshot.viewerId ? 'room-seat--self' : ''}`}
                key={player?.id ?? `empty-${index}`}
              >
                <span className="seat-number">{String(index + 1).padStart(2, '0')}</span>
                <span className="room-seat__avatar">
                  {player?.kind === 'ai'
                    ? <Bot aria-label="电脑玩家" />
                    : <UserRound aria-label={player ? '真人玩家' : '空席位'} />}
                </span>
                {player ? (
                  <>
                    <div className="room-seat__identity">
                      <strong>{player.name}</strong>
                      <span>{player.kind === 'ai' ? '基础电脑' : player.connected ? '在线' : '暂时离线'}</span>
                    </div>
                    <div className="room-seat__badges" aria-label="玩家状态">
                      {player.isHost && <span className="room-badge room-badge--host"><Crown aria-hidden="true" />房主</span>}
                      {player.id === snapshot.viewerId && <span className="room-badge room-badge--self">你</span>}
                      {player.kind === 'human' && player.ready && (
                        <span className="room-badge room-badge--ready"><Check aria-hidden="true" />已准备</span>
                      )}
                      {player.kind === 'human' && player.connected && !player.ready && (
                        <span className="room-badge room-badge--waiting">未准备</span>
                      )}
                      {player.kind === 'human' && !player.connected && (
                        <span className="room-badge room-badge--offline"><CircleOff aria-hidden="true" />离线</span>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="room-seat__identity">
                    <strong>等待玩家</strong>
                    <span>分享房间码即可加入</span>
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>

        <aside className="room-lobby-actions" aria-label="房间操作">
          <p className="eyebrow">开局状态</p>
          <h2>{snapshot.status === 'lobby' ? '黎明尚未来临' : '房间状态已变更'}</h2>
          <p>{startHint}</p>

          {error && <div className="inline-error room-lobby-error" role="alert">{error}</div>}

          {viewer?.kind === 'human' && snapshot.status === 'lobby' && (
            <button
              type="button"
              className={viewer.ready ? 'text-button room-ready-button' : 'primary-button room-ready-button'}
              disabled={busy || !viewer.connected}
              aria-pressed={viewer.ready}
              onClick={onToggleReady}
            >
              {busy ? <LoaderCircle className="spin" aria-hidden="true" /> : <Check aria-hidden="true" />}
              {viewer.ready ? '取消准备' : '我已准备'}
            </button>
          )}

          {isHost && (
            <button
              type="button"
              className="primary-button room-start-button"
              disabled={!canStart}
              onClick={onStart}
            >
              {busy ? <LoaderCircle className="spin" aria-hidden="true" /> : <Play fill="currentColor" aria-hidden="true" />}
              开始游戏
            </button>
          )}

          {!isHost && snapshot.status === 'lobby' && (
            <div className="room-host-wait" role="status">
              <LoaderCircle className={busy ? 'spin' : undefined} aria-hidden="true" />
              <span>准备完成后等待房主开始</span>
            </div>
          )}
        </aside>
      </section>
    </main>
  )
}

function getStartHint(
  snapshot: RoomSnapshot,
  isHost: boolean,
  validPlayerCount: boolean,
  allHumansReady: boolean,
): string {
  if (snapshot.status !== 'lobby') {
    return snapshot.status === 'playing' ? '对局已经开始。' : '本局已经完成。'
  }
  if (snapshot.players.length > MAX_PLAYERS) return `房间最多容纳 ${MAX_PLAYERS} 名玩家。`
  if (!validPlayerCount) return `还需要至少 ${MIN_PLAYERS - snapshot.players.length} 名玩家加入。`
  if (!allHumansReady) return '等待所有真人玩家上线并准备完成。'
  if (!isHost) return '全员已准备，等待房主开始游戏。'
  return '全员已准备，可以开始发牌。'
}
