'use client'
import { useState, useRef } from 'react'
import { Upload, X, Camera, CheckCircle } from 'lucide-react'
import { fileToBase64 } from '@/lib/imageUpload'

interface Props {
  label:       string
  sublabel?:   string
  accent?:     'gold' | 'green' | 'blue'
  onFile:      (file: File, preview: string) => void
  preview?:    string
  onClear?:    () => void
}

export function ImageUpload({ label, sublabel, accent = 'gold', onFile, preview, onClear }: Props) {
  const [dragging, setDragging] = useState(false)
  const inputRef  = useRef<HTMLInputElement>(null)

  const colors = {
    gold:  { border: 'rgba(245,166,35,0.45)',   bg: 'rgba(245,166,35,0.06)',   icon: 'var(--gold)',  text: 'var(--gold)'  },
    green: { border: 'rgba(46,204,122,0.45)',    bg: 'rgba(46,204,122,0.06)',   icon: 'var(--green)', text: 'var(--green)' },
    blue:  { border: 'rgba(74,158,255,0.45)',    bg: 'rgba(74,158,255,0.06)',   icon: '#4A9EFF',      text: '#4A9EFF'      },
  }[accent]

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) return
    const preview = await fileToBase64(file)
    onFile(file, preview)
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  if (preview) return (
    <div style={{ position: 'relative', marginBottom: 10 }}>
      <div style={{ borderRadius: 12, overflow: 'hidden', border: `1.5px solid ${colors.border}`, position: 'relative' }}>
        <img src={preview} alt="Uploaded" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', display: 'block' }} />
        <div style={{ position: 'absolute', bottom: 8, left: 8, background: 'rgba(0,0,0,0.7)', borderRadius: 8, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4 }}>
          <CheckCircle size={11} color={colors.icon} />
          <span style={{ fontSize: 10, fontWeight: 700, color: colors.text }}>Uploaded</span>
        </div>
      </div>
      {onClear && (
        <button onClick={onClear} style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.7)', border: 'none', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <X size={13} color="white" />
        </button>
      )}
    </div>
  )

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      style={{ border: `2px dashed ${dragging ? colors.icon : colors.border}`, borderRadius: 12, padding: '18px 12px', textAlign: 'center', cursor: 'pointer', background: dragging ? colors.bg : 'transparent', transition: 'all 0.15s', marginBottom: 10 }}
    >
      <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={onInputChange} style={{ display: 'none' }} />
      <Camera size={26} color={colors.icon} style={{ margin: '0 auto 8px', display: 'block' }} />
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--offwhite)', marginBottom: 3 }}>{label}</div>
      {sublabel && <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{sublabel}</div>}
      <div style={{ fontSize: 10, color: 'var(--muted)' }}>Tap to upload from gallery · JPG · PNG · WEBP</div>
    </div>
  )
}
