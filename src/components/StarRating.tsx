import { useState } from 'react'

interface StarRatingProps {
  rating: number | null
  onChange: (rating: number | null) => void
  size?: 'sm' | 'md'
  disabled?: boolean
}

export default function StarRating({ rating, onChange, size = 'sm', disabled = false }: StarRatingProps) {
  const [hover, setHover] = useState<number | null>(null)

  const starSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-5 h-5'
  const gap = size === 'sm' ? 'gap-0.5' : 'gap-1'
  const displayRating = hover ?? rating

  return (
    <div className={`flex items-center ${gap}`} title={rating ? `${rating} 星` : '未评分'}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={disabled}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.altKey) return
            e.stopPropagation()
            e.preventDefault()
            onChange(rating === star ? null : star)
          }}
          onMouseEnter={() => !disabled && setHover(star)}
          onMouseLeave={() => setHover(null)}
          className={`${starSize} transition-colors ${
            disabled
              ? 'cursor-default'
              : 'cursor-pointer hover:scale-110'
          } ${
            displayRating && star <= displayRating
              ? 'text-yellow-400'
              : 'text-gray-300 dark:text-gray-600'
          }`}
        >
          <svg
            className="w-full h-full"
            fill={displayRating && star <= displayRating ? 'currentColor' : 'none'}
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
            />
          </svg>
        </button>
      ))}
    </div>
  )
}
