import {
  ArrowLeft,
  ArrowRight,
  DoorOpen,
  History,
  LoaderCircle,
  LogIn,
  Trash2,
  UserRound,
} from 'lucide-react'
import { useId, useState } from 'react'
import type { FormEvent } from 'react'

interface OnlineEntryScreenProps {
  busy: boolean
  error: string
  lastRoomCode?: string
  onCreate: (name: string) => void
  onJoin: (name: string, roomCode: string) => void
  onResume?: () => void
  onForgetResume?: () => void
  onBack: () => void
}

type SubmitIntent = 'create' | 'join' | null

const ROOM_CODE_PATTERN = /^[A-Z0-9]{6}$/

function normalizeRoomCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
}

function invitedRoomCode(): string {
  const value = normalizeRoomCode(new URLSearchParams(window.location.search).get('room') ?? '')
  return ROOM_CODE_PATTERN.test(value) ? value : ''
}

export function OnlineEntryScreen({
  busy,
  error,
  lastRoomCode,
  onCreate,
  onJoin,
  onResume,
  onForgetResume,
  onBack,
}: OnlineEntryScreenProps) {
  const nameId = useId()
  const roomCodeId = useId()
  const [name, setName] = useState('')
  const [roomCode, setRoomCode] = useState(invitedRoomCode)
  const [submitIntent, setSubmitIntent] = useState<SubmitIntent>(null)
  const trimmedName = name.trim()
  const nameError = trimmedName.length < 1 || trimmedName.length > 16
  const roomCodeError = !ROOM_CODE_PATTERN.test(roomCode)
  const showNameError = submitIntent !== null && nameError
  const showRoomCodeError = submitIntent === 'join' && roomCodeError

  const createRoom = () => {
    setSubmitIntent('create')
    if (nameError || busy) return
    onCreate(trimmedName)
  }

  const joinRoom = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitIntent('join')
    if (nameError || roomCodeError || busy) return
    onJoin(trimmedName, roomCode)
  }

  return (
    <main className="online-entry-screen">
      <header className="online-entry-header">
        <button type="button" className="icon-button" title="返回模式选择" onClick={onBack} disabled={busy}>
          <ArrowLeft aria-hidden="true" />
        </button>
        <div>
          <p className="eyebrow">在线联机</p>
          <h1>进入房间</h1>
        </div>
      </header>

      <div className="online-entry-layout">
        {lastRoomCode && onResume && (
          <section className="online-resume-band" aria-labelledby="online-resume-title">
            <History aria-hidden="true" />
            <div>
              <span>上次在线房间</span>
              <strong id="online-resume-title">{normalizeRoomCode(lastRoomCode)}</strong>
            </div>
            <button type="button" className="primary-button" disabled={busy} onClick={onResume}>
              {busy ? <LoaderCircle className="spin" aria-hidden="true" /> : <LogIn aria-hidden="true" />}
              重新连接
            </button>
            {onForgetResume && (
              <button
                type="button"
                className="icon-button online-forget-button"
                title="忘记这个房间"
                disabled={busy}
                onClick={onForgetResume}
              >
                <Trash2 aria-hidden="true" />
              </button>
            )}
          </section>
        )}

        <form className="online-entry-form" noValidate onSubmit={joinRoom}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">玩家身份</p>
              <h2>先留下你的名字</h2>
            </div>
            <UserRound size={20} aria-hidden="true" />
          </div>

          <label className="online-field" htmlFor={nameId}>
            <span>昵称</span>
            <input
              id={nameId}
              autoComplete="nickname"
              maxLength={16}
              placeholder="1 至 16 个字符"
              value={name}
              disabled={busy}
              aria-invalid={showNameError || undefined}
              aria-describedby={showNameError ? `${nameId}-error` : undefined}
              onChange={(event) => {
                setName(event.target.value)
                if (submitIntent) setSubmitIntent(null)
              }}
            />
          </label>
          {showNameError && (
            <p className="field-error" id={`${nameId}-error`} role="alert">
              请输入 1 至 16 个字符的昵称。
            </p>
          )}

          <button type="button" className="online-create-button" disabled={busy} onClick={createRoom}>
            <span><DoorOpen aria-hidden="true" /></span>
            <span>
              <strong>创建新房间</strong>
              <small>成为房主并邀请其他玩家</small>
            </span>
            {busy && submitIntent === 'create'
              ? <LoaderCircle className="spin" aria-hidden="true" />
              : <ArrowRight aria-hidden="true" />}
          </button>

          <div className="online-entry-divider"><span>或加入现有房间</span></div>

          <label className="online-field" htmlFor={roomCodeId}>
            <span>六位房间码</span>
            <input
              id={roomCodeId}
              className="room-code-input"
              autoCapitalize="characters"
              autoComplete="off"
              inputMode="text"
              maxLength={6}
              placeholder="例如 A7K2Q9"
              value={roomCode}
              disabled={busy}
              aria-invalid={showRoomCodeError || undefined}
              aria-describedby={showRoomCodeError ? `${roomCodeId}-error` : undefined}
              onChange={(event) => {
                setRoomCode(normalizeRoomCode(event.target.value))
                if (submitIntent) setSubmitIntent(null)
              }}
            />
          </label>
          {showRoomCodeError && (
            <p className="field-error" id={`${roomCodeId}-error`} role="alert">
              房间码应为六位字母或数字。
            </p>
          )}

          {error && <div className="inline-error online-entry-error" role="alert">{error}</div>}

          <button type="submit" className="primary-button online-join-button" disabled={busy}>
            {busy && submitIntent === 'join'
              ? <LoaderCircle className="spin" aria-hidden="true" />
              : <LogIn aria-hidden="true" />}
            加入房间
          </button>
        </form>
      </div>
    </main>
  )
}
