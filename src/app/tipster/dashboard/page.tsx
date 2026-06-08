'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Send, Wallet, BarChart2, User, Home, Trash2 } from 'lucide-react'
import { TopBar } from '@/components/layout/Navigation'
import { ResultPill } from '@/components/ui'
import { LeaguePicker } from '@/components/ui/LeaguePicker'
import { ImageUpload } from '@/components/ui/ImageUpload'
import { ResultProofUpload } from '@/components/ui/ResultProofUpload'
import { MarketPicker } from '@/components/ui/MarketPicker'
import type { Tipster, Tip } from '@/types'
import type { SlipLeg } from '@/types/betslip'

type DTab = 'home'|'post'|'earn'|'stats'|'profile'|'myslips'  // all tabs | 'post' | 'earn' | 'stats' | 'profile'

export default function TipsterDashboard() {
  const router = useRouter()
  const [tab, setTab]         = useState<DTab>('home')
  const [tipster, setTipster] = useState<Tipster | null>(null)
  const [tips, setTips]       = useState<Tip[]>([])
  const [posting, setPosting] = useState(false)
  const [postMode, setPostMode] = useState<'manual'|'screenshot'>('manual')

  // Screenshot mode — AI parses the image
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
    potential_win: string
  }
  const emptyScreenshotSlip = (): ScreenshotSlip => ({
    slip_price: 1000, note: '', slipPreview: '', slipFile: null,
    parsing: false, parseError: '', parsedLegs: [],
    total_odds: '', betting_site: '', potential_win: '',
  })
  const [screenshotSlips, setScreenshotSlips] = useState<ScreenshotSlip[]>([emptyScreenshotSlip()])
  function addScreenshotSlip() { setScreenshotSlips(s => [...s, emptyScreenshotSlip()]) }
  function removeScreenshotSlip(i: number) { setScreenshotSlips(s => s.filter((_,j)=>j!==i)) }
  function updateScreenshotSlip(i: number, k: string, v: any) { setScreenshotSlips(s => s.map((sl,j)=>j===i?{...sl,[k]:v}:sl)) }

  // Upload screenshot and parse with Claude Vision
  async function parseScreenshot(i: number, file: File, preview: string) {
    updateScreenshotSlip(i, 'slipFile', file)
    updateScreenshotSlip(i, 'slipPreview', preview)
    updateScreenshotSlip(i, 'parsing', true)
    updateScreenshotSlip(i, 'parseError', '')
    updateScreenshotSlip(i, 'parsedLegs', [])

    try {
      const fd = new FormData()
      fd.append('image', file)
      const res  = await fetch('/api/parse-slip', { method: 'POST', body: fd })
      const data = await res.json()

      if (!res.ok || !data.success) {
        updateScreenshotSlip(i, 'parseError', data.error ?? 'Could not read screenshot')
        updateScreenshotSlip(i, 'parsing', false)
        return
      }

      const slip = data.slip
      setScreenshotSlips(s => s.map((sl, j) => j !== i ? sl : {
        ...sl,
        parsing:      false,
        parsedLegs:   (slip.legs ?? []).map((l: any, idx: number) => ({
          id:         String(idx + 1),
          match:      l.match      ?? '',
          league:     l.league     ?? '',
          pick:       l.pick       ?? '',
          odds:       parseFloat(l.odds) || 1,
          match_time: l.match_time ?? '',
          result:     'pending' as const,
          market:     l.market     ?? 'match_result',
        })),
        total_odds:   String(slip.total_odds   ?? ''),
        betting_site: slip.betting_site ?? '',
        potential_win: String(slip.potential_win ?? ''),
      }))
    } catch (err: any) {
      updateScreenshotSlip(i, 'parseError', err.message ?? 'Parse failed')
      updateScreenshotSlip(i, 'parsing', false)
    }
  }

  // Betslip state — multiple slips, each with multiple legs
  const [slips, setSlips] = useState<{ slip_price: number; legs: SlipLeg[] }[]>([{ slip_price: 1000, legs: [{ id: '1', match: '', league: '', pick: '', odds: 0, match_time: '', result: 'pending' as const, market: 'match_result' }] }])

  function addSlip() { setSlips(s => [...s, { slip_price: 1000, legs: [{ id: Date.now().toString(), match: '', league: '', pick: '', odds: 0, match_time: '', result: 'pending' as const, market: 'match_result' }] }]) }
  function removeSlip(si: number) { setSlips(s => s.filter((_,i) => i !== si)) }
  function addLeg(si: number) { setSlips(s => s.map((slip,i) => i===si ? { ...slip, legs: [...slip.legs, { id: Date.now().toString(), match:'', league:'', pick:'', odds:0, match_time:'', result:'pending' as const, market:'match_result' }] } : slip)) }
  function removeLeg(si: number, li: number) { setSlips(s => s.map((slip,i) => i===si ? { ...slip, legs: slip.legs.filter((_,j) => j!==li) } : slip)) }
  function updateLeg(si: number, li: number, field: string, val: string) {
    setSlips(s => s.map((slip,i) => i===si ? { ...slip, legs: slip.legs.map((leg,j) => j===li ? { ...leg, [field]: field==='odds' ? parseFloat(val)||0 : val } : leg) } : slip))
  }
  function updateSlipPrice(si: number, val: string) { setSlips(s => s.map((slip,i) => i===si ? { ...slip, slip_price: parseInt(val)||0 } : slip)) }
  function calcTotalOdds(legs: SlipLeg[]) { return legs.reduce((acc, l) => acc * (l.odds || 1), 1) }

  // Load from session
  useEffect(() => {
    const id = localStorage.getItem('bf_tipster_id')
    if (!id) { router.push('/tipster/login'); return }
    fetch(`/api/tipster/${id}`).then(r => r.json()).then(d => {
      setTipster(d.tipster)
      setTips(d.tips ?? [])
    })
  }, [router])

  async function postTip() {
    if (!slips.every(s => s.legs.every(l => l.match && l.pick && l.odds))) return
    setPosting(true)
    const res = await fetch('/api/tips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slips, tipster_id: tipster?.id }),
    })
    const data = await res.json()
    if (data.tip) setTips([data.tip, ...tips])
    setSlips([{ slip_price: 1000, legs: [{ id: '1', match: '', league: '', pick: '', odds: 0, match_time: '', result: 'pending' as const }] }])
    setPosting(false)
    setTab('home')
  }

  if (!tipster) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 size={32} color="var(--gold)" className="spin" />
    </div>
  )

  const dtabs: { key: DTab; label: string; Icon: any }[] = [
    { key: 'home',    label: 'Home',    Icon: Home     },
    { key: 'post',    label: 'Post tip',Icon: Plus      },
    { key: 'myslips', label: 'My Slips',Icon: BarChart2 },
    { key: 'earn',    label: 'Earnings',Icon: Wallet    },
    { key: 'stats',   label: 'Stats',   Icon: BarChart2 },
    { key: 'profile', label: 'Profile', Icon: User      },
  ]

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div style={{ background: 'var(--bg2)', padding: '14px 16px 16px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>Tipster dashboard</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--white)' }}>{tipster.name}</div>
      </div>

      {/* Dashboard tabs */}
      <div className="flex overflow-x-auto" style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--line)' }}>
        {dtabs.map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setTab(key)} style={{ flex: '1 0 60px', padding: '10px 4px 8px', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, borderBottom: `2px solid ${tab === key ? 'var(--gold)' : 'transparent'}` }}>
            <Icon size={18} color={tab === key ? 'var(--gold)' : 'rgba(255,255,255,0.3)'} />
            <span style={{ fontSize: 9, color: tab === key ? 'var(--gold)' : 'rgba(255,255,255,0.3)', fontWeight: 700, whiteSpace: 'nowrap' }}>{label}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-8">

        {/* ── HOME ── */}
        {tab === 'home' && (
          <>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                { val: '2,840', label: 'Subscribers',  color: 'var(--white)' },
                { val: '7/10',  label: 'Wins this week', color: 'var(--green)' },
                { val: '#1',    label: 'Platform rank', color: 'var(--white)' },
                { val: '90%',   label: 'Your cut',      color: 'var(--gold)' },
              ].map(m => (
                <div key={m.label} className="card" style={{ marginBottom: 0 }}>
                  <div style={{ fontSize: m.val.length > 6 ? 16 : 24, fontWeight: 800, color: m.color }}>{m.val}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{m.label}</div>
                </div>
              ))}
            </div>
            <button className="btn-gold mb-3" onClick={() => setTab('post')}><Plus size={16} /> Post a new tip</button>
            <button className="btn-ghost" onClick={() => setTab('earn')}><Wallet size={16} style={{ display: 'inline', marginRight: 6 }} />View earnings history</button>
            <div className="section-label mt-4">Recent tips</div>
            {tips.slice(0, 4).map(t => (
              <div key={t.id} className="card" style={{ padding: '12px 14px' }}>
                <div className="flex justify-between items-center">
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--white)' }}>{t.match}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{t.pick} · odds <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{t.odds}</span></div>
                  </div>
                  <ResultPill result={t.result} />
                </div>
              </div>
            ))}
          </>
        )}

        {/* ── POST TIP ── */}
        {tab === 'post' && (
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--white)', marginBottom: 4 }}>Post betslips</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5 }}>Post multiple slips so subscribers can choose their risk level.</div>

            {/* Mode selector */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
              {([
                { key: 'manual',     icon: '📝', title: 'Manual',     desc: 'Type in matches and picks' },
                { key: 'screenshot', icon: '📸', title: 'Screenshot', desc: 'Upload from your gallery' },
              ] as const).map(m => (
                <div key={m.key} onClick={() => setPostMode(m.key)} style={{ padding: '12px 10px', borderRadius: 14, border: postMode === m.key ? `2px solid ${m.key === 'manual' ? '#4A9EFF' : 'var(--gold)'}` : '1px solid var(--line)', background: postMode === m.key ? (m.key === 'manual' ? 'rgba(74,158,255,0.1)' : 'var(--gold-lt)') : 'var(--bg3)', cursor: 'pointer', textAlign: 'center' }}>
                  <div style={{ fontSize: 22, marginBottom: 5 }}>{m.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--white)', marginBottom: 2 }}>{m.title}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.4 }}>{m.desc}</div>
                </div>
              ))}
            </div>

            {postMode === 'screenshot' && (
              <div style={{ background: 'var(--gold-lt)', border: '1px solid rgba(245,166,35,0.25)', borderRadius: 12, padding: '10px 12px', marginBottom: 14, fontSize: 12, color: 'var(--offwhite)', lineHeight: 1.5 }}>
                🤖 <strong>AI-powered</strong> — upload your betslip screenshot and Claude Vision will automatically read all the matches, picks, and odds. Results are verified automatically when matches end.
              </div>
            )}

            {/* Screenshot mode form — AI powered */}
            {postMode === 'screenshot' && (
              <>
                {screenshotSlips.map((ss, si) => (
                  <div key={si} className="card" style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--white)' }}>Slip {si + 1}</div>
                      {screenshotSlips.length > 1 && (
                        <button onClick={() => removeScreenshotSlip(si)} style={{ background: 'var(--red-lt)', border: 'none', borderRadius: 8, padding: '5px 9px', cursor: 'pointer', color: 'var(--red)', fontSize: 11, fontWeight: 700 }}>Remove</button>
                      )}
                    </div>

                    {/* Image upload — triggers AI parse */}
                    <ImageUpload
                      label="Upload betslip screenshot"
                      sublabel="AI will read all matches and odds automatically"
                      accent="gold"
                      preview={ss.slipPreview}
                      onFile={(file, preview) => parseScreenshot(si, file, preview)}
                      onClear={() => setScreenshotSlips(s => s.map((sl, j) => j !== si ? sl : { ...emptyScreenshotSlip(), slip_price: sl.slip_price }))}
                    />

                    {/* Parsing indicator */}
                    {ss.parsing && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--gold-lt)', border: '1px solid rgba(245,166,35,0.3)', borderRadius: 10, padding: '10px 12px', marginBottom: 10 }}>
                        <Loader2 size={16} color="var(--gold)" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                        <div style={{ fontSize: 12, color: 'var(--gold)', fontWeight: 600 }}>Claude is reading your betslip...</div>
                      </div>
                    )}

                    {/* Parse error */}
                    {ss.parseError && (
                      <div style={{ background: 'var(--red-lt)', border: '1px solid rgba(255,107,107,0.3)', borderRadius: 10, padding: '10px 12px', marginBottom: 10, fontSize: 12, color: 'var(--red)' }}>
                        ⚠️ {ss.parseError} — try a clearer screenshot or better lighting
                      </div>
                    )}

                    {/* Parsed legs preview */}
                    {ss.parsedLegs.length > 0 && (
                      <div style={{ background: 'var(--green-lt)', border: '1px solid rgba(46,204,122,0.3)', borderRadius: 10, padding: '10px 12px', marginBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                          <span style={{ fontSize: 13 }}>✓</span>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)' }}>
                            {ss.parsedLegs.length} legs extracted · Odds {ss.total_odds} · {ss.betting_site}
                          </div>
                        </div>
                        {ss.parsedLegs.map((leg, li) => (
                          <div key={li} style={{ padding: '6px 0', borderTop: li > 0 ? '1px solid rgba(46,204,122,0.2)' : 'none', display: 'flex', gap: 10 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--white)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{leg.match}</div>
                              <div style={{ fontSize: 10, color: 'var(--muted)' }}>{leg.pick} · {leg.league}</div>
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--gold)', flexShrink: 0 }}>{leg.odds.toFixed(2)}</div>
                          </div>
                        ))}
                        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 8 }}>
                          Results will be verified automatically via football API when matches end.
                        </div>
                      </div>
                    )}

                    {/* Price */}
                    <div style={{ background: 'var(--gold-lt)', border: '1px solid rgba(245,166,35,0.3)', borderRadius: 10, padding: '10px 12px', marginBottom: 8 }}>
                      <label className="lbl" style={{ color: 'var(--gold)' }}>One-time purchase price (UGX)</label>
                      <input className="inp" type="number" placeholder="e.g. 2000" value={ss.slip_price || ''} onChange={e => updateScreenshotSlip(si, 'slip_price', parseInt(e.target.value)||0)} />
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>Subscribers see free. Others pay this to unlock.</div>
                    </div>

                    <label className="lbl">Note (optional)</label>
                    <input className="inp" placeholder="Short note for subscribers..." value={ss.note} onChange={e => updateScreenshotSlip(si, 'note', e.target.value)} />
                  </div>
                ))}

                <button onClick={addScreenshotSlip} style={{ width: '100%', padding: '11px', background: 'rgba(245,166,35,0.1)', color: 'var(--gold)', border: '1px dashed rgba(245,166,35,0.4)', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 12 }}>
                  + Add another slip
                </button>
                <button className="btn-gold" onClick={postTip}
                  style={{ opacity: screenshotSlips.every(ss => ss.parsedLegs.length > 0 || ss.slipFile) ? 1 : 0.4 }}>
                  {posting ? <Loader2 size={16} className="spin" /> : '🤖'} Post {screenshotSlips.length} slip{screenshotSlips.length > 1 ? 's' : ''} now
                </button>
              </>
            )}

            {/* Manual mode form — booking code */}
            {postMode === 'manual' && (
            <>
            {slips.map((slip, si) => (
              <div key={si} className="card" style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--white)' }}>Slip {si + 1}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {slips.length > 1 && (
                      <button onClick={() => removeSlip(si)} style={{ background: 'var(--red-lt)', border: 'none', borderRadius: 8, padding: '5px 8px', cursor: 'pointer', display: 'flex' }}>
                        <Trash2 size={13} color="var(--red)" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Price */}
                <div style={{ background: 'var(--gold-lt)', border: '1px solid rgba(245,166,35,0.3)', borderRadius: 10, padding: '10px 12px', marginBottom: 10 }}>
                  <label className="lbl" style={{ color: 'var(--gold)' }}>One-time purchase price (UGX)</label>
                  <input className="inp" type="number" placeholder="e.g. 1500" value={slip.slip_price || ''} onChange={e => updateSlipPrice(si, e.target.value)} style={{ fontSize: 15, fontWeight: 800 }} />
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>Subscribers see it free. Non-subscribers pay this to unlock this slip only.</div>
                </div>

                {/* Betting site */}
                <label className="lbl">Betting site</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
                  {['BetPawa', 'Betway', 'SportPesa', 'Mozzart', '1xBet', 'Other'].map(site => {
                    const selected = (slip as any).betting_site === site
                    return (
                      <button key={site} type="button"
                        style={{ padding: '8px 4px', borderRadius: 10, border: selected ? '2px solid var(--gold)' : '1px solid var(--line)', background: selected ? 'var(--gold-lt)' : 'var(--bg3)', color: selected ? 'var(--gold)' : 'var(--offwhite)', fontSize: 11, fontWeight: selected ? 700 : 500, cursor: 'pointer' }}
                        onClick={() => setSlips(s => s.map((sl, i) => i === si ? { ...sl, betting_site: site } as any : sl))}
                      >
                        {site}
                      </button>
                    )
                  })}
                </div>
                {(slip as any).betting_site === 'Other' && (
                  <>
                    <label className="lbl">Betting site name</label>
                    <input className="inp" style={{ marginBottom: 10 }} placeholder="Enter betting site name..." onChange={e => setSlips(s => s.map((sl, i) => i === si ? { ...sl, betting_site_custom: e.target.value } as any : sl))} />
                  </>
                )}

                {/* Booking code */}
                <label className="lbl">Booking code</label>
                <input
                  className="inp"
                  style={{ fontSize: 18, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}
                  placeholder="e.g. ABC123"
                  value={(slip as any).booking_code ?? ''}
                  onChange={e => setSlips(s => s.map((sl, i) => i === si ? { ...sl, booking_code: e.target.value.toUpperCase() } as any : sl))}
                />
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.5 }}>
                  Subscribers will use this code to load the slip on {(slip as any).betting_site ?? 'the betting site'}.
                </div>

                {/* Total odds + legs */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label className="lbl">Total odds</label>
                    <input className="inp" type="number" step="0.01" placeholder="e.g. 12.40"
                      value={(slip as any).total_odds ?? ''}
                      onChange={e => setSlips(s => s.map((sl, i) => i === si ? { ...sl, total_odds: e.target.value } as any : sl))}
                    />
                  </div>
                  <div>
                    <label className="lbl">No. of legs</label>
                    <input className="inp" type="number" placeholder="e.g. 4"
                      value={(slip as any).leg_count ?? ''}
                      onChange={e => setSlips(s => s.map((sl, i) => i === si ? { ...sl, leg_count: e.target.value } as any : sl))}
                    />
                  </div>
                </div>

                <label className="lbl" style={{ marginTop: 8 }}>Note (optional)</label>
                <input className="inp" placeholder="Short note for subscribers..."
                  value={(slip as any).note ?? ''}
                  onChange={e => setSlips(s => s.map((sl, i) => i === si ? { ...sl, note: e.target.value } as any : sl))}
                />
              </div>
            ))}

            <button onClick={addSlip} style={{ width: '100%', padding: '11px', background: 'rgba(245,166,35,0.1)', color: 'var(--gold)', border: '1px dashed rgba(245,166,35,0.4)', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 12 }}>
              <Plus size={16} /> Add another slip (different odds)
            </button>

            <button className="btn-gold" onClick={postTip}>
              {posting ? <Loader2 size={16} className="spin" /> : <Send size={16} />} Post {slips.length} slip{slips.length > 1 ? 's' : ''} now
            </button>
            </>
            )}
          </div>
        )}

        {/* ── MY SLIPS ── */}
        {tab === 'myslips' && (
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--white)', marginBottom: 4 }}>My slips</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>Results are verified automatically. No action needed from you.</div>

            <div style={{ background: 'var(--green-lt)', border: '1px solid rgba(46,204,122,0.25)', borderRadius: 12, padding: '10px 14px', marginBottom: 14, display: 'flex', gap: 8 }}>
              <span style={{ fontSize: 15, flexShrink: 0 }}>⚡</span>
              <div style={{ fontSize: 12, color: 'var(--offwhite)', lineHeight: 1.5 }}>
                Betfluencer automatically verifies all slip results via football API. Screenshot slips are read by AI Vision and each leg is checked when the match ends.
              </div>
            </div>

            {/* Completed slip */}
            <div className="card" style={{ borderLeft: '3px solid var(--green)', marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--white)', marginBottom: 2 }}>Betslip · 3 legs · ×8.75</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>Yesterday · Screenshot mode</div>
                </div>
                <span className="pill-green">Proof uploaded</span>
              </div>
            </div>
          </div>
        )}

        {tab === 'earn' && (
          <>
            {/* Instant payout notice */}
            <div style={{ background: 'var(--green-lt)', border: '1px solid rgba(46,204,122,0.25)', borderRadius: 16, padding: '14px 16px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 22, flexShrink: 0 }}>⚡</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--white)', marginBottom: 4 }}>Instant payouts</div>
                <div style={{ fontSize: 12, color: 'var(--offwhite)', lineHeight: 1.6, fontWeight: 500 }}>Every time someone buys your slip, 90% goes straight to your Mobile Money instantly. Nothing is held here.</div>
              </div>
            </div>

            <div className="section-label">This month</div>
            <div className="card" style={{ padding: '6px 16px', marginBottom: 14 }}>
              {[
                { label: 'Gross collected',   val: 'UGX 180,000', color: 'var(--offwhite)' },
                { label: 'Platform fee (10%)',val: '− UGX 18,000', color: 'var(--muted)'   },
                { label: 'Sent to your MoMo', val: 'UGX 162,000', color: 'var(--green)'    },
              ].map((r, i) => (
                <div key={r.label} className="flex justify-between py-3" style={{ borderBottom: i < 2 ? '1px solid var(--line)' : 'none' }}>
                  <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 500 }}>{r.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: r.color }}>{r.val}</span>
                </div>
              ))}
            </div>

            <div className="section-label">Recent payouts</div>
            <div className="card" style={{ padding: '4px 16px' }}>
              {[
                { desc: 'Slip purchase × 3',  time: 'Today · 09:14',      amount: '+UGX 10,800' },
                { desc: 'Slip purchase × 1',  time: 'Yesterday · 14:22',  amount: '+UGX 4,500'  },
                { desc: 'Slip purchase × 2',  time: 'Mon 19 May · 11:05', amount: '+UGX 7,200'  },
              ].map((p, i) => (
                <div key={i} className="flex justify-between items-center py-3" style={{ borderBottom: i < 2 ? '1px solid var(--line)' : 'none' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--offwhite)' }}>{p.desc}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{p.time}</div>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--green)' }}>{p.amount}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── STATS ── */}
        {tab === 'stats' && (
          <>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                { val: '7/10',  label: 'Win rate',     color: 'var(--green)' },
                { val: '2.4x',  label: 'Avg odds',     color: 'var(--gold)'  },
                { val: '177',   label: 'Weekly score', color: 'var(--white)' },
                { val: '#1',    label: 'Platform rank',color: 'var(--white)' },
              ].map(m => (
                <div key={m.label} className="card" style={{ marginBottom: 0, textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: m.color }}>{m.val}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{m.label}</div>
                </div>
              ))}
            </div>
            <div className="section-label">Subscriber growth</div>
            <div className="card">
              {[['Week 1','1,800',60],['Week 2','2,100',70],['Week 3','2,480',83],['Week 4','2,840',95]].map(([w,v,pct]) => (
                <div key={w} className="flex items-center gap-3 mb-3">
                  <div style={{ fontSize: 11, color: 'var(--muted)', width: 50, fontWeight: 600 }}>{w}</div>
                  <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.12)', borderRadius: 4 }}>
                    <div style={{ height: 8, borderRadius: 4, background: 'var(--green)', width: `${pct}%` }} />
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--white)', width: 44, textAlign: 'right' }}>{v}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── PROFILE ── */}
        {tab === 'profile' && (
          <div className="card">
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--white)', marginBottom: 16 }}>Your public profile</div>
            {[
              { lbl: 'Display name',          type: 'text',   val: tipster.name     },
              { lbl: 'Username',              type: 'text',   val: tipster.username },
              { lbl: 'Mobile Money number',   type: 'tel',    val: tipster.phone    },
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
            <button className="btn-ghost mt-3" onClick={() => { localStorage.removeItem('bf_tipster_id'); router.push('/tipster/login') }}>Sign out</button>
          </div>
        )}
      </div>
    </div>
  )
}
