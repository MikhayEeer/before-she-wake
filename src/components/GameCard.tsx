import { CARDS } from '../game/cards'
import type { CardInstance } from '../game/types'
import { CardArt } from './CardArt'

interface GameCardProps {
  card?: CardInstance
  facedown?: boolean
  selected?: boolean
  disabled?: boolean
  compact?: boolean
  label?: string
  onClick?: () => void
}

export function GameCard({
  card,
  facedown = false,
  selected = false,
  disabled = false,
  compact = false,
  label,
  onClick,
}: GameCardProps) {
  const className = [
    'game-card',
    facedown ? 'game-card--facedown' : '',
    selected ? 'game-card--selected' : '',
    compact ? 'game-card--compact' : '',
    disabled ? 'game-card--disabled' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const content = facedown || !card ? (
    <>
      <div className="card-back-mark">S.L.</div>
      <div className="card-back-title">未知身份</div>
      {label && <div className="card-back-label">{label}</div>}
    </>
  ) : (
    <CardFace card={card} compact={compact} />
  )

  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        aria-pressed={selected}
        aria-label={label ?? (card ? CARDS[card.cardId].name : '未知身份')}
        disabled={disabled}
        onClick={onClick}
      >
        {content}
      </button>
    )
  }

  return <article className={className}>{content}</article>
}

function CardFace({ card, compact }: { card: CardInstance; compact: boolean }) {
  const definition = CARDS[card.cardId]
  return (
    <>
      <div className="card-topline">
        <span className={`faction-dot faction-dot--${definition.faction}`} />
        <span>优先 {definition.priority}</span>
      </div>
      {!compact && <CardArt src={definition.image} alt={definition.name} />}
      <div className="card-heading">
        <strong>{definition.name}</strong>
        <span className={`point-badge ${definition.point < 0 ? 'point-badge--negative' : ''}`}>
          {definition.point > 0 ? '+' : ''}
          {definition.point} MP
        </span>
      </div>
      {!compact && <p className="card-ability">{definition.ability}</p>}
      {!compact && <p className="card-victory">{definition.victory}</p>}
    </>
  )
}
