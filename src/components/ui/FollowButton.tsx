'use client'
import { useState, useEffect } from 'react'
import { UserPlus, UserCheck } from 'lucide-react'
import { isFollowing, toggleFollow } from '@/lib/follows'

interface Props {
  tipsterId: string
  size?:     'sm' | 'md'
}

export function FollowButton({ tipsterId, size = 'md' }: Props) {
  const [following, setFollowing] = useState(false)
  const [pulse,     setPulse]     = useState(false)

  useEffect(() => { setFollowing(isFollowing(tipsterId)) }, [tipsterId])

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation()
    const now = toggleFollow(tipsterId)
    setFollowing(now)
    if (now) { setPulse(true); setTimeout(() => setPulse(false), 600) }
    // Dispatch event so Mine page updates live
    window.dispatchEvent(new CustomEvent('bf-follow-change', { detail: { tipsterId, following: now } }))
  }

  if (size === 'sm') return (
    <button
      onClick={handleClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '5px 10px', borderRadius: 20, border: 'none', cursor: 'pointer',
        background: following ? 'var(--green-lt)' : 'var(--bg3)',
        color: following ? 'var(--green)' : 'var(--muted)',
        outline: following ? '1px solid rgba(46,204,122,0.3)' : '1px solid rgba(255,255,255,0.12)',
        fontSize: 11, fontWeight: 700,
        transform: pulse ? 'scale(1.08)' : 'scale(1)',
        transition: 'transform 0.15s, background 0.15s',
      }}
    >
      {following ? <UserCheck size={12} /> : <UserPlus size={12} />}
      {following ? 'Following' : 'Follow'}
    </button>
  )

  return (
    <button
      onClick={handleClick}
      style={{
        width: '100%', padding: '11px', borderRadius: 12, border: 'none', cursor: 'pointer',
        background: following ? 'var(--green-lt)' : 'var(--bg3)',
        color: following ? 'var(--green)' : 'var(--offwhite)',
        outline: following ? '1px solid rgba(46,204,122,0.3)' : '1px solid rgba(255,255,255,0.12)',
        fontSize: 14, fontWeight: 800,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        transform: pulse ? 'scale(1.02)' : 'scale(1)',
        transition: 'transform 0.15s, background 0.15s',
      }}
    >
      {following ? <UserCheck size={16} /> : <UserPlus size={16} />}
      {following ? 'Following' : 'Follow'}
    </button>
  )
}
