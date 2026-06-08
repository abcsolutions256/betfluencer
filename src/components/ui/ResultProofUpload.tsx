'use client'
import { useState } from 'react'
import { CheckCircle, Loader2 } from 'lucide-react'
import { ImageUpload } from './ImageUpload'

interface Props {
  slipId:    string
  totalOdds: number
  legCount:  number
  postedAt:  string
  onDone?:   () => void
}

export function ResultProofUpload({ slipId, totalOdds, legCount, postedAt, onDone }: Props) {
  const [resultPreview, setResultPreview] = useState('')
  const [resultFile,    setResultFile]    = useState<File | null>(null)
  const [outcome,       setOutcome]       = useState<'win'|'loss'|null>(null)
  const [uploading,     setUploading]     = useState(false)
  const [done,          setDone]          = useState(false)

  async function submit() {
    if (!resultFile || !outcome) return
    setUploading(true)
    await new Promise(r => setTimeout(r, 1500))
    localStorage.setItem(`bf_result_${slipId}`, resultPreview)
    localStorage.setItem(`bf_result_outcome_${slipId}`, outcome)
    setUploading(false)
    setDone(true)
    onDone?.()
  }

  if (done) return (
    <div className="card" style={{ borderLeft: '3px solid var(--green)', marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <CheckCircle size={20} color="var(--green)" />
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--white)' }}>Result proof uploaded</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>Subscribers can now see the result screenshot</div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="card" style={{ borderLeft: '3px solid var(--red)', marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--white)', marginBottom: 2 }}>Betslip · {legCount} legs · ×{totalOdds.toFixed(2)}</div>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>{postedAt} · Screenshot mode</div>
        </div>
        <span style={{ background: 'var(--red-lt)', color: 'var(--red)', fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 20, border: '1px solid rgba(255,107,107,0.3)' }}>Proof needed</span>
      </div>

      <div style={{ background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.2)', borderRadius: 10, padding: '8px 10px', marginBottom: 10, display: 'flex', gap: 7 }}>
        <span style={{ fontSize: 14, flexShrink: 0 }}>⚠️</span>
        <div style={{ fontSize: 11, color: 'var(--offwhite)', lineHeight: 1.5 }}>Upload the result screenshot from your betting app to complete this slip's record.</div>
      </div>

      <ImageUpload
        label="Upload result screenshot"
        sublabel="Win/loss/cashout screen from your betting app"
        accent="green"
        preview={resultPreview}
        onFile={(file, preview) => { setResultFile(file); setResultPreview(preview) }}
        onClear={() => { setResultFile(null); setResultPreview('') }}
      />

      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--offwhite)', marginBottom: 8 }}>What was the result?</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <button onClick={() => setOutcome('win')} style={{ padding: '10px', background: outcome === 'win' ? 'var(--green)' : 'var(--green-lt)', color: outcome === 'win' ? '#061a0e' : 'var(--green)', border: `1px solid ${outcome === 'win' ? 'var(--green)' : 'rgba(46,204,122,0.3)'}`, borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
          Won
        </button>
        <button onClick={() => setOutcome('loss')} style={{ padding: '10px', background: outcome === 'loss' ? 'var(--red)' : 'var(--red-lt)', color: outcome === 'loss' ? '#1a0000' : 'var(--red)', border: `1px solid ${outcome === 'loss' ? 'var(--red)' : 'rgba(255,107,107,0.3)'}`, borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
          Lost
        </button>
      </div>

      <button
        className="btn-green"
        style={{ opacity: (!resultFile || !outcome) ? 0.4 : 1 }}
        onClick={submit}
      >
        {uploading ? <Loader2 size={15} className="spin" /> : <CheckCircle size={15} />}
        Submit result proof
      </button>
    </div>
  )
}
