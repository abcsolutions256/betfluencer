'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutGrid, Trophy, Ticket, Bookmark, TrendingUp } from 'lucide-react'
import { NotificationBell } from '@/components/ui/NotificationBell'

export function TopBar({ showBack = false, onBack }: { showBack?: boolean; onBack?: () => void }) {
  return (
    <div style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--line)' }}
         className="sticky top-0 z-50 px-4 py-3 flex items-center justify-between">
      {showBack ? (
        <button onClick={onBack} style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
          ← Back
        </button>
      ) : (
        <Link href="/" style={{ fontSize: 21, fontWeight: 800, color: 'var(--gold)', textDecoration: 'none' }}>
          bet<span style={{ color: 'var(--offwhite)', fontWeight: 300 }}>fluencer</span>
        </Link>
      )}
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <Link href="/about" style={{ textDecoration: 'none' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', padding: '4px 10px' }}>About</div>
        </Link>
        <Link href="/advertise" style={{ textDecoration: 'none' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gold)', background: 'var(--gold-lt)', border: '1px solid rgba(245,166,35,0.3)', padding: '4px 10px', borderRadius: 20 }}>Advertise</div>
        </Link>
        <NotificationBell />
      </div>
    </div>
  )
}

const navItems = [
  { href: '/channels', label: 'Channels', Icon: LayoutGrid  },
  { href: '/rankings', label: 'Rankings', Icon: Trophy      },
  { href: '/',         label: 'Slips',    Icon: Ticket      },
  { href: '/mine',     label: 'Mine',     Icon: Bookmark    },
  { href: '/tipster',  label: 'Tipster',  Icon: TrendingUp  },
]

export function BottomNav() {
  const path = usePathname()
  return (
    <nav className="sticky bottom-0 z-50 flex"
         style={{ background: 'var(--bg2)', borderTop: '1px solid var(--line)', paddingBottom: 10 }}>
      {navItems.map(({ href, label, Icon }) => {
        const active = href === '/' ? path === '/' : path === href || path.startsWith(href)
        return (
          <Link key={href} href={href} className="flex-1 flex flex-col items-center gap-1 pt-2 pb-1 no-underline">
            <Icon size={22} color={active ? 'var(--gold)' : 'rgba(255,255,255,0.25)'} />
            <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, color: active ? 'var(--gold)' : 'rgba(255,255,255,0.25)' }}>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
