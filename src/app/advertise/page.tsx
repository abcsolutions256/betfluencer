import { TopBar, BottomNav } from '@/components/layout/Navigation'

const CONTACT = {
  whatsapp: '',
  phone:    '',
  email:    'betfluencer11@gmail.com',
}

const WHY = [
  { icon: '🎯', title: 'High-intent audience',  desc: 'Bettors are active spenders. Your ad reaches people ready to act, not just browse.' },
  { icon: '📱', title: 'Mobile first',           desc: 'Every ad is seen on a phone screen — full attention, no distractions.' },
  { icon: '⚽', title: 'Football obsessed',      desc: 'Our users follow every match, every league. They are engaged every single day.' },
  { icon: '🌍', title: 'East Africa focused',    desc: 'Built for Uganda with expansion across Kenya and Tanzania — a fast growing market.' },
]

const FORMATS = [
  { icon: '🖼️', name: 'Image',       desc: 'Clean static banner. JPG or PNG.' },
  { icon: '🎞️', name: 'GIF',         desc: 'Animated, looping. Eye-catching.' },
  { icon: '🎬', name: 'Short video', desc: 'Up to 15 seconds. Maximum impact.' },
  { icon: '✍️', name: 'Text ad',     desc: 'Headline + description + button.'  },
]

export default function AdvertisePage() {
  return (
    <div className="flex flex-col min-h-screen">
      <TopBar />
      <main className="flex-1 overflow-y-auto pb-8">

        {/* Hero */}
        <div style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--line)', padding: '28px 20px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10 }}>
            Advertising
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--white)', lineHeight: 1.2, marginBottom: 12 }}>
            Reach Uganda's most engaged football audience
          </div>
          <div style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 500, lineHeight: 1.7, maxWidth: 300, margin: '0 auto 20px' }}>
            Your brand, seen by passionate football fans and bettors every single day — directly inside their tips feed.
          </div>
          <div style={{ display: 'inline-block', background: 'var(--gold-lt)', border: '1px solid rgba(245,166,35,0.3)', borderRadius: 12, padding: '10px 16px', fontSize: 12, color: 'var(--gold)', fontWeight: 600 }}>
            Get in touch for our media kit and available slots
          </div>
        </div>

        <div style={{ padding: '20px 16px 0' }}>

          {/* Why advertise */}
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Why advertise on Betfluencer</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
            {WHY.map(w => (
              <div key={w.title} className="card" style={{ marginBottom: 0 }}>
                <div style={{ fontSize: 22, marginBottom: 8 }}>{w.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--white)', marginBottom: 4 }}>{w.title}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>{w.desc}</div>
              </div>
            ))}
          </div>

          {/* Ad formats */}
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Ad formats available</div>
          <div className="card" style={{ padding: '6px 14px', marginBottom: 20 }}>
            {FORMATS.map((f, i) => (
              <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: i < FORMATS.length - 1 ? '1px solid var(--line)' : 'none' }}>
                <span style={{ fontSize: 24, flexShrink: 0 }}>{f.icon}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--white)', marginBottom: 2 }}>{f.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Placements */}
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Where your ad appears</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
            <div className="card" style={{ marginBottom: 0, textAlign: 'center' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>📋</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--white)', marginBottom: 4 }}>Between tips</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>Full-width card between every 3rd tip. High visibility.</div>
            </div>
            <div className="card" style={{ marginBottom: 0, textAlign: 'center' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>📌</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--white)', marginBottom: 4 }}>Inside tips</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>Slim strip inside each tip card. Seen with every pick.</div>
            </div>
          </div>

          {/* Contact */}
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Get in touch</div>

          {/* WhatsApp */}
          <a href={`https://wa.me/${CONTACT.whatsapp.replace(/\+|\s/g, '')}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'block', marginBottom: 10 }}>
            <div className="card" style={{ border: '1px solid rgba(46,204,122,0.3)', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--green-lt)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className="ti ti-brand-whatsapp" style={{ fontSize: 22, color: 'var(--green)' }} aria-hidden="true" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--white)', marginBottom: 2 }}>WhatsApp us</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{CONTACT.whatsapp}</div>
                </div>
                <i className="ti ti-arrow-right" style={{ fontSize: 16, color: 'var(--muted)' }} aria-hidden="true" />
              </div>
            </div>
          </a>

          {/* Phone */}
          <a href={`tel:${CONTACT.phone}`} style={{ textDecoration: 'none', display: 'block', marginBottom: 10 }}>
            <div className="card" style={{ border: '1px solid rgba(245,166,35,0.25)', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--gold-lt)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className="ti ti-phone" style={{ fontSize: 22, color: 'var(--gold)' }} aria-hidden="true" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--white)', marginBottom: 2 }}>Call us</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{CONTACT.phone}</div>
                </div>
                <i className="ti ti-arrow-right" style={{ fontSize: 16, color: 'var(--muted)' }} aria-hidden="true" />
              </div>
            </div>
          </a>

          {/* Email */}
          <a href={`mailto:${CONTACT.email}`} style={{ textDecoration: 'none', display: 'block', marginBottom: 20 }}>
            <div className="card" style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className="ti ti-mail" style={{ fontSize: 22, color: 'var(--offwhite)' }} aria-hidden="true" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--white)', marginBottom: 2 }}>Email us</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{CONTACT.email}</div>
                </div>
                <i className="ti ti-arrow-right" style={{ fontSize: 16, color: 'var(--muted)' }} aria-hidden="true" />
              </div>
            </div>
          </a>

          <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
            We typically respond within 24 hours.<br />All ad placements are managed by our team.
          </div>
        </div>
      </main>
      <BottomNav />
    </div>
  )
}
