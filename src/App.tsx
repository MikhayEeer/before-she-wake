import { useEffect, useMemo, useState } from 'react'

import { GameScreen } from './components/GameScreen'
import { ModeScreen } from './components/ModeScreen'
import { OnlineEntryScreen } from './components/OnlineEntryScreen'
import { RoomLobby } from './components/RoomLobby'
import { RulesPanel } from './components/RulesPanel'
import { SetupScreen } from './components/SetupScreen'
import { runAiStep } from './game/ai'
import { applyGameCommand } from './game/commands'
import { createGame, getDecisionPlayerId } from './game/engine'
import { createLocalGameView } from './game/local-view'
import { clearSavedGame, loadGame, saveGame } from './game/storage'
import type { GameState, PlayerConfig } from './game/types'
import { useOnlineRoom } from './network/useOnlineRoom'

type EntryScreen = 'mode' | 'local' | 'online'

export default function App() {
  const [savedGame, setSavedGame] = useState<GameState | null>(() => loadGame())
  const [localGame, setLocalGame] = useState<GameState | null>(null)
  const [entryScreen, setEntryScreen] = useState<EntryScreen>('mode')
  const [rulesOpen, setRulesOpen] = useState(false)
  const online = useOnlineRoom()
  const localGameView = useMemo(
    () => localGame ? createLocalGameView(localGame) : null,
    [localGame],
  )

  useEffect(() => {
    if (!localGame) return
    saveGame(localGame)
    setSavedGame(localGame)
  }, [localGame])

  useEffect(() => {
    if (!localGame || localGame.status === 'finished') return
    const decisionId = getDecisionPlayerId(localGame)
    const player = localGame.players.find((candidate) => candidate.id === decisionId)
    if (player?.kind !== 'ai') return

    const delay = localGame.phase.kind === 'turn' ? 1250 : 900
    const timer = window.setTimeout(() => {
      setLocalGame((current) => {
        if (!current || getDecisionPlayerId(current) !== decisionId) return current
        return runAiStep(current)
      })
    }, delay)
    return () => window.clearTimeout(timer)
  }, [localGame])

  const startLocalGame = (configs: PlayerConfig[]) => {
    const next = createGame(configs)
    clearSavedGame()
    setSavedGame(next)
    setLocalGame(next)
  }

  const shareRoom = async () => {
    const roomCode = online.snapshot?.roomCode
    if (!roomCode) return
    const inviteUrl = new URL(window.location.href)
    inviteUrl.search = ''
    inviteUrl.searchParams.set('room', roomCode)
    const shareData = {
      title: '冰冷的她醒来之前',
      text: `加入房间 ${roomCode}`,
      url: inviteUrl.toString(),
    }
    if (navigator.share) {
      await navigator.share(shareData).catch(() => undefined)
      return
    }
    await navigator.clipboard.writeText(`${shareData.text}\n${shareData.url}`)
  }

  let content
  if (localGame && localGameView) {
    content = (
      <GameScreen
        game={localGameView}
        onCommand={(command) => {
          setLocalGame((current) => {
            if (!current) return current
            const actorId = getDecisionPlayerId(current)
            if (!actorId) return current
            return applyGameCommand(current, actorId, command)
          })
        }}
        onNewGame={() => {
          setLocalGame(null)
          setEntryScreen('local')
        }}
        onOpenRules={() => setRulesOpen(true)}
      />
    )
  } else if (online.snapshot?.status === 'lobby') {
    const viewer = online.snapshot.players.find((player) => player.id === online.snapshot?.viewerId)
    content = (
      <RoomLobby
        snapshot={online.snapshot}
        busy={online.busy}
        error={online.error}
        onToggleReady={() => void online.setReady(!viewer?.ready)}
        onStart={() => void online.startGame()}
        onLeave={() => {
          void online.leaveRoom().finally(() => setEntryScreen('online'))
        }}
        onShare={() => void shareRoom()}
      />
    )
  } else if (online.snapshot?.game) {
    content = (
      <GameScreen
        game={online.snapshot.game}
        mode="online"
        viewerPlayerId={online.snapshot.viewerId}
        decisionPlayerId={online.snapshot.decisionPlayerId}
        canAct={online.snapshot.canAct}
        commandPending={online.busy}
        connectionState={online.connectionState}
        roomCode={online.snapshot.roomCode}
        onCommand={online.sendCommand}
        onNewGame={() => {
          void online.leaveRoom().finally(() => setEntryScreen('online'))
        }}
        onOpenRules={() => setRulesOpen(true)}
      />
    )
  } else if (entryScreen === 'local') {
    content = (
      <SetupScreen
        savedGame={savedGame}
        onStart={startLocalGame}
        onResume={() => savedGame && setLocalGame(savedGame)}
        onDiscardSave={() => {
          clearSavedGame()
          setSavedGame(null)
        }}
        onBack={() => setEntryScreen('mode')}
      />
    )
  } else if (entryScreen === 'online') {
    content = (
      <OnlineEntryScreen
        busy={online.busy}
        error={online.error}
        lastRoomCode={online.credentials?.roomCode}
        onCreate={(name) => void online.createRoom(name)}
        onJoin={(name, roomCode) => void online.joinRoom(name, roomCode)}
        onResume={online.credentials ? () => void online.resumeRoom() : undefined}
        onForgetResume={online.credentials ? online.forgetSession : undefined}
        onBack={() => {
          online.clearError()
          setEntryScreen('mode')
        }}
      />
    )
  } else {
    content = (
      <ModeScreen
        hasLocalSave={Boolean(savedGame)}
        onOnline={() => setEntryScreen('online')}
        onLocal={() => setEntryScreen('local')}
        onResumeLocal={() => savedGame && setLocalGame(savedGame)}
        onOpenRules={() => setRulesOpen(true)}
      />
    )
  }

  return (
    <>
      {content}
      <RulesPanel open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </>
  )
}
