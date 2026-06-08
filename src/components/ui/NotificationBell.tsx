'use client'
import { useState } from 'react'
import { Bell, X, CheckCheck, ChevronRight } from 'lucide-react'
import { useNotifications } from '@/hooks/useNotifications'
import { usePushNotifications } from '@/hooks/usePush'
import { ResultPill } from '@/components/ui'
import Link from 'next/link'

export function NotificationBell() {
  const [open, setOpen]           = useState(false)
  const { notifs, unreadCount, markAllRead, markRead, clearAll } = useNotifications()
  const { status, requestPermission } = usePushNotifications()

  return (
    <>
      {/* Bell icon */}
      <button
        onClick={() => { setOpen(true); markAllRead() }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', position: 'relative', padding: 4 }}
        aria-label="Notifications"
      >
        <Bell size={22} color="var(--white)" />
        {unreadCount > 0 && (
          <div style={{
            position: 'absolute', top: 0, right: 0,
            width: 16, height: 16, borderRadius: '50%',
            background: 'var(--gold)', border: '2px solid var(--bg2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, fontWeight: 800, color: '#1a0a00',
          }}>{unreadCount > 9 ? '9+' : unreadCount}</div>
        )}
      </button>

      {/* Drawer overlay */}
      {open && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.6)',
        }} onClick={() => setOpen(false)}>
          {/* Drawer panel */}
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute', top: 0, right: 0, bottom: 0,
              width: '100%', maxWidth: 400,
              background: 'var(--bg)',
              display: 'flex', flexDirection: 'column',
            }}
          >
            {/* Header */}
            <div style={{ background: 'var(--bg2)', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--line)' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--white)' }}>Notifications</div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {notifs.length > 0 && (
                  <button onClick={clearAll} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Clear all</button>
                )}
                <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                  <X size={20} color="var(--muted)" />
                </button>
              </div>
            </div>

            {/* Push permission prompt */}
            {status === 'prompt' && (
              <div style={{ background: 'var(--gold-lt)', border: '1px solid rgba(245,166,35,0.3)', margin: 12, borderRadius: 14, padding: '12px 14px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)', marginBottom: 6 }}>
                  Get instant tip alerts
                </div>
                <div style={{ fontSize: 12, color: 'var(--off)', fontWeight: 500, lineHeight: 1.5, marginBottom: 10 }}>
                  Allow notifications so new tips appear on your phone screen the moment they are posted — even when you are not on the site.
                </div>
                <button
                  onClick={requestPermission}
                  style={{ background: 'var(--gold)', color: '#1a0a00', border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 800, cursor: 'pointer', width: '100%' }}
                >
                  Allow notifications
                </button>
              </div>
            )}

            {status === 'granted' && notifs.length === 0 && (
              <div style={{ background: 'var(--green-lt)', border: '1px solid rgba(46,204,122,0.25)', margin: 12, borderRadius: 14, padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'center' }}>
                <CheckCheck size={16} color="var(--green)" />
                <div style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>Push notifications are on</div>
              </div>
            )}

            {/* Feed */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px 24px' }}>
              {notifs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--muted)' }}>
                  <Bell size={36} color="var(--muted)" style={{ margin: '0 auto 12px', display: 'block' }} />
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No notifications yet</div>
                  <div style={{ fontSize: 12, lineHeight: 1.6 }}>When a tipster you follow posts a new tip, it will appear here.</div>
                </div>
              ) : (
                notifs.map(n => (
                  <Link
                    key={n.id}
                    href={`/channel/${n.tipster_id}`}
                    style={{ textDecoration: 'none', display: 'block' }}
                    onClick={() => markRead(n.id)}
                  >
                    <div style={{
                      background: n.read ? 'var(--card)' : 'var(--bg3)',
                      borderRadius: 14, border: `1px solid ${n.read ? 'var(--line)' : 'rgba(245,166,35,0.3)'}`,
                      padding: '12px 14px', marginBottom: 8,
                      display: 'flex', gap: 10, alignItems: 'flex-start',
                    }}>
                      {!n.read && (
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--gold)', flexShrink: 0, marginTop: 5 }} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 700, marginBottom: 4 }}>
                          {n.tipsterName}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--white)', marginBottom: 3 }}>
                          {n.tip.match}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500, marginBottom: 7 }}>
                          {n.tip.pick} · <span style={{ color: 'var(--gold)', fontWeight: 700 }}>odds {n.tip.odds}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <ResultPill result={n.tip.result} />
                          <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                            {new Date(n.received_at).toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                      <ChevronRight size={14} color="var(--muted)" style={{ flexShrink: 0, marginTop: 4 }} />
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
