import { Eye, Shield } from 'lucide-react'
import { useEffect, useRef } from 'react'

interface PrivacyGateProps {
  playerName: string
  prompt: string
  recentAction?: string
  onReveal: () => void
}

export function PrivacyGate({ playerName, prompt, recentAction, onReveal }: PrivacyGateProps) {
  const revealButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    revealButton.current?.focus()
    const keepFocusInside = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      event.preventDefault()
      revealButton.current?.focus()
    }
    window.addEventListener('keydown', keepFocusInside)
    return () => window.removeEventListener('keydown', keepFocusInside)
  }, [])

  return (
    <div className="privacy-gate" role="dialog" aria-modal="true" aria-labelledby="privacy-title">
      <div className="privacy-gate__content">
        <Shield size={28} aria-hidden="true" />
        <p className="eyebrow">秘密行动</p>
        <h2 id="privacy-title">交给 {playerName}</h2>
        <p>{prompt}</p>
        <p className="privacy-note">其余玩家暂时移开视线</p>
        {recentAction && (
          <div className="privacy-recent-action" role="status">
            <span>上一项公开行动</span>
            <strong>{recentAction}</strong>
          </div>
        )}
        <button ref={revealButton} type="button" className="primary-button" onClick={onReveal}>
          <Eye size={18} aria-hidden="true" />
          查看我的信息
        </button>
      </div>
    </div>
  )
}
