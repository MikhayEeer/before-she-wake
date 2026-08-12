import { Image as ImageIcon } from 'lucide-react'
import { useState } from 'react'

interface CardArtProps {
  src: string
  alt: string
  variant?: 'card' | 'scene'
}

export function CardArt({ src, alt, variant = 'card' }: CardArtProps) {
  const [missing, setMissing] = useState(false)

  return (
    <div className={`art-slot art-slot--${variant}`}>
      {!missing ? (
        <img src={src} alt={alt} onError={() => setMissing(true)} />
      ) : (
        <div className="art-placeholder" aria-label={`${alt}图像占位`}>
          <ImageIcon aria-hidden="true" size={variant === 'scene' ? 24 : 18} />
          <span>{variant === 'scene' ? '中央场景图像' : '角色图像'}</span>
        </div>
      )}
    </div>
  )
}
