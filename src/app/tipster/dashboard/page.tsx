'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Send, Wallet, BarChart2, User, Home, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { ResultPill } from '@/components/ui'
import { ImageUpload } from '@/components/ui/ImageUpload'
import type { Tipster } from '@/types'
import type { SlipLeg } from '@/types/betslip'
import { useCountry } from '@/components/CountryProvider'

type DTab = 'home'|'post'|'myslips'|'earn'|'stats'|'profile'

// Verification-status badge styling (booking-code slips).
const VERIF: Record<string, { label: string; color: string; bg: string }> = {
  verified: { label: '✓ Verified',   color: 'var(--green)', bg: 'var(--green-lt)' },
  pending:  { label: '⏳ Verifying…', color: 'var(--gold)',  bg: 'var(--gold-lt)' },
  failed:   { label: '✗ Unverified',  color: 'var(--red)',   bg: 'rgba(229,72,77,0.12)' },
  rejected: { label: '✗ Rejected',    color: 'var(--red)',   bg: 'rgba(229,72,77,0.12)' },
}

type Stats = {
  subscriber_count: number
  wins_last_10: number
  avg_odds: number
  rank: number
  total_earned: number
  slips_posted: number
}

type Betslip = {
  id: string
  result: string
  total_odds: number
  leg_count: number
  slip_price: number
  note: string
  posted_at: string
  booking_code: string
  betting_site: string
  locked?: boolean
}

type Earning = {
  id: string
  amount: number
  gross: number
  user_phone: string
  created_at: string
}

export default function TipsterDashboard() {
  const router = useRouter()
  // Active market: currency label + betting-site order (all sites stay listed).
  const { country, fmtMoney, sites } = useCountry()
  const [tab, setTab] = useState<DTab>('home')
  const [openSlipId, setOpenSlipId] = useState<string | null>(null)   // My Slips: expanded card
  const [tipster, setTipster] = useState<Tipster | null>(null)
  const [stats, setStats] = useState<Stats>({ subscriber_count:0, wins_last_10:0, avg_odds:0, rank:0, total_earned:0, slips_posted:0 })
  const [betslips, setBetslips] = useState<Betslip[]>([])
  const [earnings, setEarnings] = useState<Earning[]>([])
  const [posting, setPosting] = useState(false)
  const [postMode, setPostMode] = useState<'manual'|'screenshot'>('manual')
  const [postError, setPostError] = useState('')

  type ScreenshotSlip = {
    slip_price: number
    note: string
    slipPreview: string
    slipFile: File | null
    parsing: boolean
    parseError: string
    parsedLegs: SlipLeg[]
    total_odds: string
    betting_site: string
  }
  const emptyScreenshotSlip = (): ScreenshotSlip => ({
    slip_price: 1000, note: '', slipPreview: '', slipFile: null,
    parsing: false, parseError: '', parsedLegs: [], total_odds: '', betting_site: ''
  })
  const [screenshotSlips, setScreenshotSlips] = useState<ScreenshotSlip[]>([emptyScreenshotSlip()])
  function updateScreenshotSlip(i: number, k: string, v: any) {
    setScreenshotSlips(s => s.map((sl, j) => j === i ? { ...sl, [k]: v } : sl))
  }

  async function parseScreenshot(i: number, file: File, preview: string) {
    updateScreenshotSlip(i, 'slipFile', file)
    updateScreenshotSlip(i, 'slipPreview', preview)
    updateScreenshotSlip(i, 'parsing', true)
    updateScreenshotSlip(i, 'parseError', '')
    try {
      const fd = new FormData()
      fd.append('image', file)
      const res = await fetch('/api/parse-slip', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok || !data.success) {
        updateScreenshotSlip(i, 'parseError', data.error ?? 'Could not read screenshot')
        updateScreenshotSlip(i, 'parsing', false)
        return
      }
      const slip = data.slip
      setScreenshotSlips(s => s.map((sl, j) => j !== i ? sl : {
        ...sl,
        parsing: false,
        parsedLegs: (slip.legs ?? []).map((l: any, idx: number) => ({
          id: String(idx + 1),
          match: l.match ?? '',
          league: l.league ?? '',
          pick: l.pick ?? '',
          odds: parseFloat(l.odds) || 1,
          match_time: l.match_time ?? '',
          result: 'pending' as const,
          market: l.market ?? 'match_result',
          market_subject: l.market_subject ?? 'match',
          side: l.side ?? null,
          line: l.line != null ? Number(l.line) : null,
        })),
        total_odds: String(slip.total_odds ?? ''),
        betting_site: slip.betting_site ?? '',
      }))
    } catch (err: any) {
      updateScreenshotSlip(i, 'parseError', err.message ?? 'Parse failed')
      updateScreenshotSlip(i, 'parsing', false)
    }
  }

  async function uploadSlipImage(file: File, _tipsterId: string): Promise<string | null> {
    try {
      // Server-side upload (service role) so it doesn't depend on a Supabase
      // Auth session — auth is now phone-identity cookies.
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/tipster/upload', { method: 'POST', body: fd })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { console.error('Image upload error:', d?.error); return null }
      return d.url ?? null
    } catch (e) {
      console.error('uploadSlipImage error:', e)
      return null
    }
  }

  const [slips, setSlips] = useState<any[]>([{
    slip_price: 1000, booking_code: '', betting_site: '', total_odds: '', leg_count: '', note: ''
  }])
  function addSlip() {
    setSlips(s => [...s, { slip_price: 1000, booking_code: '', betting_site: '', total_odds: '', leg_count: '', note: '' }])
  }
  function removeSlip(si: number) { setSlips(s => s.filter((_, i) => i !== si)) }

  useEffect(() => {
    // Resolve the logged-in tipster from the session cookie.
    fetch('/api/tipster/me').then(r => r.ok ? r.json() : null).then(d => {
      if (!d?.tipster) { router.push('/tipster/login'); return }
      const id = d.tipster.id
      setTipster(d.tipster)
      fetch(`/api/tipster/${id}/stats`).then(r => r.json()).then(d => { if (d.stats) setStats(d.stats) })
      fetch(`/api/tipster/${id}/slips`).then(r => r.json()).then(d => { if (d.slips) setBetslips(d.slips) })
      fetch(`/api/tipster/${id}/earnings`).then(r => r.json()).then(d => { if (d.earnings) setEarnings(d.earnings) })
    })
  }, [router])

  async function postTip() {
    if (!tipster) return
    setPosting(true)
    setPostError('')

    let slipsToPost: any[] = []

    if (postMode === 'screenshot') {
      for (const ss of screenshotSlips) {
        // A screenshot slip MUST carry its image — that's the product the buyer
        // unlocks. Require the file and fail loudly if the upload doesn't return
        // a URL, rather than silently posting an imageless slip.
        if (!ss.slipFile) {
          setPostError('Please attach a screenshot for each slip before posting.')
          setPosting(false)
          return
        }
        const slip_image_url = await uploadSlipImage(ss.slipFile, tipster.id)
        if (!slip_image_url) {
          setPostError('Screenshot upload failed. Please check your connection and try again.')
          setPosting(false)
          return
        }
        slipsToPost.push({
          posting_mode:  'screenshot',
          slip_price:    ss.slip_price,
          note:          ss.note,
          total_odds:    ss.total_odds ? parseFloat(ss.total_odds) : null,
          leg_count:     ss.parsedLegs.length || null,
          betting_site:  ss.betting_site || null,
          legs:          ss.parsedLegs,
          slip_image_url,
        })
      }
    } else {
      slipsToPost = slips
    }

    const res = await fetch('/api/tips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slips: slipsToPost, tipster_id: tipster.id }),
    })
    const data = await res.json()

    if (data.error) {
      setPostError(data.error)
      setPosting(false)
      return
    }

    if (data.slips) setBetslips(prev => [...data.slips, ...prev])

    if (postMode === 'screenshot') {
      setScreenshotSlips([emptyScreenshotSlip()])
    } else {
      setSlips([{ slip_price: 1000, booking_code: '', betting_site: '', total_odds: '', leg_count: '', note: '' }])
    }
    setPosting(false)
    setTab('myslips')
  }

  if (!tipster) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 size={32} color="var(--gold)" className="spin" />
    </div>
  )

  const dtabs: { key: DTab; label: string; Icon: any }[] = [
    { key: 'home',    label: 'Home',     Icon: Home      },
    { key: 'post',    label: 'Post tip', Icon: Plus      },
    { key: 'myslips', label: 'My Slips', Icon: BarChart2 },
    { key: 'earn',    label: 'Earnings', Icon: Wallet    },
    { key: 'stats',   label: 'Stats',    Icon: BarChart2 },
    { key: 'profile', label: 'Profile',  Icon: User      },
  ]

  const thisMonthEarnings = earnings.filter(e => new Date(e.created_at) >= new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const thisMonthGross = thisMonthEarnings.reduce((a, e) => a + (e.gross || 0), 0)
  const thisMonthNet   = thisMonthEarnings.reduce((a, e) => a + (e.amount || 0), 0)
  const totalEarned    = earnings.reduce((a, e) => a + (e.amount || 0), 0)

  return (
    <div className="flex flex-col min-h-screen">
      <div style={{ background: 'var(--bg2)', padding: '14px 16px 16px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>Tipster dashboard</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--white)' }}>{tipster.name}</div>
      </div>

      <div className="flex overflow-x-auto" style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--line)' }}>
        {dtabs.map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setTab(key)} style={{ flex: '1 0 60px', padding: '10px 4px 8px', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, borderBottom: `2px solid ${tab === key ? 'var(--gold)' : 'transparent'}` }}>
            <Icon size={18} color={tab === key ? 'var(--gold)' : 'rgba(255,255,255,0.3)'} />
            <span style={{ fontSize: 9, color: tab === key ? 'var(--gold)' : 'rgba(255,255,255,0.3)', fontWeight: 700, whiteSpace: 'nowrap' }}>{label}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-8">

        {/* HOME */}
        {tab === 'home' && (
          <>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                { val: stats.subscriber_count.toLocaleString(),       label: 'Buyers',         color: 'var(--white)' },
                { val: `${stats.wins_last_10}/10`,                    label: 'Wins (28 days)', color: 'var(--green)' },
                { val: stats.rank > 0 ? `#${stats.rank}` : '--',     label: 'Platform rank',  color: 'var(--white)' },
                { val: '90%',                                         label: 'Your cut',       color: 'var(--gold)'  },
              ].map(m => (
                <div key={m.label} className="card" style={{ marginBottom: 0 }}>
                  <div style={{ fontSize: m.val.length > 6 ? 16 : 24, fontWeight: 800, color: m.color }}>{m.val}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{m.label}</div>
                </div>
              ))}
            </div>
            <button className="btn-gold mb-3" onClick={() => setTab('post')}><Plus size={16} /> Post a new tip</button>
            <button className="btn-ghost" onClick={() => setTab('earn')}><Wallet size={16} style={{ display: 'inline', marginRight: 6 }} />View earnings history</button>
            <div className="section-label mt-4">Recent slips</div>
            {betslips.length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '24px 0' }}>No slips posted yet</div>}
            {betslips.slice(0, 4).map(b => (
              <div key={b.id} className="card" style={{ padding: '12px 14px' }}>
                <div className="flex justify-between items-center">
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--white)' }}>
                      {b.betting_site || (b.locked ? 'Slip' : 'Betslip')} · {b.leg_count || 0} legs · ×{(b.total_odds || 0).toFixed(2)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      {b.booking_code
                        ? <>Code: <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{b.booking_code}</span> · </>
                        : b.locked
                          ? <>Code: <span style={{ color: 'var(--gold)', fontWeight: 700 }}>🔒 hidden until sold</span> · </>
                          : ''}
                      {fmtMoney(b.slip_price || 0)}
                    </div>
                  </div>
                  <ResultPill result={b.result as any} />
                </div>
              </div>
            ))}
          </>
        )}

        {/* POST */}
        {tab === 'post' && (
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--white)', marginBottom: 4 }}>Post betslips</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
              {([
                { key: 'manual',     icon: '📝', title: 'Booking Code', desc: 'Enter code from betting site' },
                { key: 'screenshot', icon: '📸', title: 'Screenshot',   desc: 'Upload from your gallery'    },
              ] as const).map(m => (
                <div key={m.key} onClick={() => setPostMode(m.key)} style={{ padding: '12px 10px', borderRadius: 14, border: postMode === m.key ? `2px solid ${m.key === 'manual' ? '#4A9EFF' : 'var(--gold)'}` : '1px solid var(--line)', background: postMode === m.key ? (m.key === 'manual' ? 'rgba(74,158,255,0.1)' : 'var(--gold-lt)') : 'var(--bg3)', cursor: 'pointer', textAlign: 'center' }}>
                  <div style={{ fontSize: 22, marginBottom: 5 }}>{m.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--white)', marginBottom: 2 }}>{m.title}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.4 }}>{m.desc}</div>
                </div>
              ))}
            </div>

            {postError && (
              <div style={{ background: 'var(--red-lt)', border: '1px solid rgba(255,107,107,0.3)', borderRadius: 10, padding: '10px 12px', marginBottom: 12, fontSize: 12, color: 'var(--red)', fontWeight: 600 }}>
                ⚠️ {postError}
              </div>
            )}

            {postMode === 'screenshot' && (
              <>
                {screenshotSlips.map((ss, si) => (
                  <div key={si} className="card" style={{ marginBottom: 12 }}>
                    <ImageUpload
                      label="Upload betslip screenshot"
                      sublabel="AI will read matches and odds"
                      accent="gold"
                      preview={ss.slipPreview}
                      onFile={(file, preview) => parseScreenshot(si, file, preview)}
                      onClear={() => setScreenshotSlips(s => s.map((sl, j) => j !== si ? sl : emptyScreenshotSlip()))}
                    />
                    {ss.parsing && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--gold-lt)', borderRadius: 10, marginBottom: 10 }}>
                        <Loader2 size={16} color="var(--gold)" style={{ animation: 'spin 1s linear infinite' }} />
                        <span style={{ fontSize: 12, color: 'var(--gold)' }}>Reading your betslip...</span>
                      </div>
                    )}
                    {ss.parseError && (
                      <div style={{ background: 'var(--red-lt)', borderRadius: 10, padding: '10px 12px', marginBottom: 10, fontSize: 12, color: 'var(--red)' }}>
                        ⚠️ {ss.parseError}
                      </div>
                    )}
                    {ss.parsedLegs.length > 0 && (
                      <div style={{ background: 'var(--green-lt)', borderRadius: 10, padding: '10px 12px', marginBottom: 10 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', marginBottom: 6 }}>
                          ✓ {ss.parsedLegs.length} legs · Odds {ss.total_odds} · {ss.betting_site}
                        </div>
                        {ss.parsedLegs.map((leg, li) => (
                          <div key={li} style={{ fontSize: 11, color: 'var(--offwhite)', padding: '4px 0', borderTop: li > 0 ? '1px solid rgba(46,204,122,0.2)' : 'none' }}>
                            {leg.match} · {leg.pick} · <span style={{ color: 'var(--gold)' }}>{leg.odds.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <label className="lbl" style={{ color: 'var(--gold)' }}>Price ({country.currency_code})</label>
                    <input className="inp" type="number" value={ss.slip_price || ''} onChange={e => updateScreenshotSlip(si, 'slip_price', parseInt(e.target.value) || 0)} />
                    <label className="lbl">Note (optional)</label>
                    <input className="inp" value={ss.note} onChange={e => updateScreenshotSlip(si, 'note', e.target.value)} />
                  </div>
                ))}
                <button
                  className="btn-gold"
                  onClick={postTip}
                  style={{ opacity: screenshotSlips.every(ss => ss.parsedLegs.length > 0 || ss.slipFile) ? 1 : 0.4 }}
                >
                  {posting ? <Loader2 size={16} className="spin" /> : '🤖'} Post {screenshotSlips.length} slip{screenshotSlips.length > 1 ? 's' : ''}
                </button>
              </>
            )}

            {postMode === 'manual' && (
              <>
                {slips.map((slip, si) => (
                  <div key={si} className="card" style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--white)' }}>Slip {si + 1}</div>
                      {slips.length > 1 && (
                        <button onClick={() => removeSlip(si)} style={{ background: 'var(--red-lt)', border: 'none', borderRadius: 8, padding: '5px 8px', cursor: 'pointer' }}>
                          <Trash2 size={13} color="var(--red)" />
                        </button>
                      )}
                    </div>
                    <div style={{ background: 'var(--gold-lt)', border: '1px solid rgba(245,166,35,0.3)', borderRadius: 10, padding: '10px 12px', marginBottom: 10 }}>
                      <label className="lbl" style={{ color: 'var(--gold)' }}>Price ({country.currency_code})</label>
                      <input className="inp" type="number" placeholder="e.g. 1500" value={slip.slip_price || ''} onChange={e => setSlips(s => s.map((sl, i) => i === si ? { ...sl, slip_price: parseInt(e.target.value) || 0 } : sl))} />
                    </div>
                    <label className="lbl">Betting site</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
                      {sites.map(site => (
                        <button key={site} type="button" onClick={() => setSlips(s => s.map((sl, i) => i === si ? { ...sl, betting_site: site } : sl))} style={{ padding: '8px 4px', borderRadius: 10, border: slip.betting_site === site ? '2px solid var(--gold)' : '1px solid var(--line)', background: slip.betting_site === site ? 'var(--gold-lt)' : 'var(--bg3)', color: slip.betting_site === site ? 'var(--gold)' : 'var(--offwhite)', fontSize: 11, fontWeight: slip.betting_site === site ? 700 : 500, cursor: 'pointer' }}>{site}</button>
                      ))}
                    </div>
                    <label className="lbl">Booking code</label>
                    <input className="inp" style={{ fontSize: 18, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }} placeholder="e.g. ABC123" value={slip.booking_code || ''} onChange={e => setSlips(s => s.map((sl, i) => i === si ? { ...sl, booking_code: e.target.value.toUpperCase() } : sl))} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>
                        <label className="lbl">Total odds <span style={{ color: 'var(--muted)', fontWeight: 500 }}>(auto)</span></label>
                        <input className="inp" type="number" step="0.01" placeholder="Auto from code" value={slip.total_odds || ''} onChange={e => setSlips(s => s.map((sl, i) => i === si ? { ...sl, total_odds: e.target.value } : sl))} />
                      </div>
                      <div>
                        <label className="lbl">No. of legs <span style={{ color: 'var(--muted)', fontWeight: 500 }}>(auto)</span></label>
                        <input className="inp" type="number" placeholder="Auto from code" value={slip.leg_count || ''} onChange={e => setSlips(s => s.map((sl, i) => i === si ? { ...sl, leg_count: e.target.value } : sl))} />
                      </div>
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 6, lineHeight: 1.5 }}>
                      Odds &amp; legs are read from the booking code automatically — leave blank.
                    </div>
                    <label className="lbl" style={{ marginTop: 8 }}>Note (optional)</label>
                    <input className="inp" value={slip.note || ''} onChange={e => setSlips(s => s.map((sl, i) => i === si ? { ...sl, note: e.target.value } : sl))} />
                  </div>
                ))}
                <button onClick={addSlip} style={{ width: '100%', padding: '11px', background: 'rgba(245,166,35,0.1)', color: 'var(--gold)', border: '1px dashed rgba(245,166,35,0.4)', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 12 }}>
                  <Plus size={16} /> Add another slip
                </button>
                <button className="btn-gold" onClick={postTip}>
                  {posting ? <Loader2 size={16} className="spin" /> : <Send size={16} />} Post {slips.length} slip{slips.length > 1 ? 's' : ''}
                </button>
              </>
            )}
          </div>
        )}

        {/* MY SLIPS */}
        {tab === 'myslips' && (
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--white)', marginBottom: 14 }}>My slips</div>
            {betslips.length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '40px 0' }}>No slips posted yet</div>}
            {betslips.map((b: any) => {
              // Picks: prefer the bookie-verified selections; fall back to the
              // slip's own stored legs (screenshot/manual posts) so every slip
              // can show its picks, not just verified coded ones.
              const norm: any[] = Array.isArray(b.normalized) && b.normalized.length
                ? b.normalized
                : (Array.isArray(b.legs) ? b.legs.map((l: any) => ({ teams: l.match, marketLabel: l.market ?? null, pickSymbol: l.pick, odds: l.odds, kickoff: l.kickoff ?? null })) : [])
              const v = VERIF[b.verification_status as string] || VERIF.pending
              const fmtKO = (iso?: string) => iso ? new Date(iso).toLocaleString('en-UG', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : ''
              const open = openSlipId === b.id
              const hasDetails = !!(b.booking_code || norm.length || b.slip_image_url)
              return (
              <div key={b.id} className="card" style={{ marginBottom:8, borderLeft:`3px solid ${b.result==='win'?'var(--green)':b.result==='loss'?'var(--red)':'var(--line)'}` }}>
                <div className="flex justify-between items-center">
                  <div>
                    <div style={{ fontSize:13, fontWeight:800, color:'var(--white)' }}>{b.betting_site || 'Slip'} · {b.leg_count ?? b.game_count ?? norm.length} legs · ×{b.total_odds ?? '—'}</div>
                    <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{fmtMoney(b.slip_price||0)}{b.posted_at ? ` · ${new Date(b.posted_at).toLocaleDateString()}` : ''}</div>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:5 }}>
                    {b.posting_mode === 'booking_code' && <span style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:20, color:v.color, background:v.bg, whiteSpace:'nowrap' }}>{v.label}</span>}
                    {b.hidden && <span style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:20, color:'var(--red)', background:'rgba(229,72,77,0.12)', whiteSpace:'nowrap' }}>Hidden by admin</span>}
                    <ResultPill result={b.result as any} />
                  </div>
                </div>
                {/* Dropdown: the slip's own content (code / picks / screenshot). */}
                {hasDetails && (
                  <button onClick={() => setOpenSlipId(open ? null : b.id)}
                    style={{ width:'100%', marginTop:10, padding:'8px', display:'flex', alignItems:'center', justifyContent:'center', gap:5, background:'var(--bg3)', color: open ? 'var(--gold)' : 'var(--offwhite)', border:'1px solid var(--line)', borderRadius:10, fontSize:11, fontWeight:700, cursor:'pointer' }}>
                    {open ? <>Hide slip <ChevronUp size={13} /></> : <>View slip <ChevronDown size={13} /></>}
                  </button>
                )}
                {open && (
                  <div style={{ borderTop:'1px solid var(--line)', marginTop:10, paddingTop:10 }}>
                    {b.booking_code && (
                      <div style={{ background:'var(--gold-lt)', border:'1px solid rgba(245,166,35,0.3)', borderRadius:10, padding:'8px 12px', marginBottom:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <span style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.8 }}>Booking code</span>
                        <span style={{ fontSize:15, fontWeight:800, color:'var(--gold)', letterSpacing:2 }}>{b.booking_code}</span>
                      </div>
                    )}
                    {norm.length > 0 && (
                      <div style={{ display:'flex', flexDirection:'column', gap:7, marginBottom: b.slip_image_url ? 10 : 0 }}>
                        {norm.map((leg: any, i: number) => (
                          <div key={i} style={{ fontSize:11.5, lineHeight:1.45 }}>
                            <div style={{ color:'var(--white)', fontWeight:700 }}>{leg.teams || `${leg.homeTeam ?? '?'} vs ${leg.awayTeam ?? '?'}`}</div>
                            <div style={{ color:'var(--muted)' }}>
                              <span style={{ color:'var(--gold)', fontWeight:700 }}>{leg.marketLabel || leg.market || '—'}</span>
                              {' · pick '}<span style={{ color:'var(--green)', fontWeight:800 }}>{leg.pickSymbol ?? '—'}</span>
                              {leg.pickTeam ? ` (${leg.pickTeam})` : ''}
                              {leg.odds ? ` · @${leg.odds}` : ''}
                              {leg.kickoff ? ` · ${fmtKO(leg.kickoff)}` : ''}
                            </div>
                          </div>
                        ))}
                        {b.slip_summary && <div style={{ fontSize:10.5, color:'var(--muted)', fontStyle:'italic', marginTop:1 }}>{b.slip_summary}</div>}
                      </div>
                    )}
                    {b.slip_image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={b.slip_image_url} alt="Betslip screenshot" style={{ width:'100%', borderRadius:10, border:'1px solid var(--line)', display:'block' }} />
                    )}
                  </div>
                )}
              </div>
            )})}
          </div>
        )}

        {/* EARNINGS */}
        {tab === 'earn' && (
          <>
            <div style={{ background: 'var(--green-lt)', border: '1px solid rgba(46,204,122,0.25)', borderRadius: 16, padding: '14px 16px', marginBottom: 16, display: 'flex', gap: 12 }}>
              <span style={{ fontSize: 22, flexShrink: 0 }}>⚡</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--white)', marginBottom: 4 }}>Instant payouts</div>
                <div style={{ fontSize: 12, color: 'var(--offwhite)', lineHeight: 1.6 }}>90% of every purchase goes straight to your Mobile Money instantly.</div>
              </div>
            </div>
            <div className="section-label">This month</div>
            <div className="card" style={{ padding: '6px 16px', marginBottom: 14 }}>
              {[
                { label: 'Gross collected',    val: fmtMoney(thisMonthGross),                          color: 'var(--offwhite)' },
                { label: 'Platform fee (10%)', val: `− ${fmtMoney(Math.round(thisMonthGross * 0.1))}`, color: 'var(--muted)'    },
                { label: 'Sent to your MoMo',  val: fmtMoney(thisMonthNet),                            color: 'var(--green)'    },
              ].map((r, i) => (
                <div key={r.label} className="flex justify-between py-3" style={{ borderBottom: i < 2 ? '1px solid var(--line)' : 'none' }}>
                  <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 500 }}>{r.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: r.color }}>{r.val}</span>
                </div>
              ))}
            </div>
            <div className="section-label">Recent payouts</div>
            <div className="card" style={{ padding: '4px 16px' }}>
              {earnings.length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)', padding: '16px 0', textAlign: 'center' }}>No earnings yet</div>}
              {earnings.slice(0, 10).map((e, i) => (
                <div key={e.id} className="flex justify-between items-center py-3" style={{ borderBottom: i < Math.min(earnings.length, 10) - 1 ? '1px solid var(--line)' : 'none' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--offwhite)' }}>Slip purchase</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{new Date(e.created_at).toLocaleString()}</div>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--green)' }}>+{fmtMoney(e.amount || 0)}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* STATS */}
        {tab === 'stats' && (
          <>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                { val: `${stats.wins_last_10}/10`,              label: 'Win rate (28d)', color: 'var(--green)' },
                { val: `${(stats.avg_odds || 0).toFixed(1)}x`,  label: 'Avg odds',       color: 'var(--gold)'  },
                { val: stats.slips_posted.toString(),            label: 'Slips posted',   color: 'var(--white)' },
                { val: stats.rank > 0 ? `#${stats.rank}` : '--', label: 'Platform rank', color: 'var(--white)' },
              ].map(m => (
                <div key={m.label} className="card" style={{ marginBottom: 0, textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: m.color }}>{m.val}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{m.label}</div>
                </div>
              ))}
            </div>
            <div className="section-label">All-time earnings</div>
            <div className="card" style={{ textAlign: 'center', padding: '20px 16px' }}>
              <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--green)' }}>{fmtMoney(totalEarned)}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Total sent to your Mobile Money</div>
            </div>
          </>
        )}

        {/* PROFILE */}
        {tab === 'profile' && (
          <div className="card">
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--white)', marginBottom: 16 }}>Your public profile</div>
            {[
              { lbl: 'Display name',        type: 'text', val: tipster.name     },
              { lbl: 'Username',            type: 'text', val: tipster.username },
              { lbl: 'Mobile Money number', type: 'tel',  val: tipster.phone    },
            ].map(f => (
              <div key={f.lbl} style={{ marginBottom: 12 }}>
                <label className="lbl">{f.lbl}</label>
                <input className="inp" type={f.type} defaultValue={f.val} />
              </div>
            ))}
            <div style={{ marginBottom: 16 }}>
              <label className="lbl">Channel description</label>
              <textarea className="inp" style={{ minHeight: 80, resize: 'none' }} defaultValue={tipster.description} />
            </div>
            <button className="btn-green">Save changes</button>
            <button
              className="btn-ghost mt-3"
              onClick={async () => {
                await fetch('/api/auth/logout', { method: 'POST' })
                router.push('/tipster/login')
              }}
            >
              Sign out
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
