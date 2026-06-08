import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Betfluencer — Football Tips Uganda',
  description: 'Subscribe to top football tipsters in Uganda. Pay with Mobile Money. No account needed.',
  manifest: '/manifest.json',
  icons: { icon: '/icon.png', apple: '/apple-icon.png' },
  openGraph: {
    title: 'Betfluencer',
    description: 'Top football tips. Pay with MTN or Airtel Money.',
    siteName: 'Betfluencer',
  },
}

export const viewport: Viewport = {
  themeColor: '#0C2B1A',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen" style={{ background: 'var(--bg)' }}>
        <div className="max-w-[480px] mx-auto min-h-screen relative">
          {children}
        </div>
      </body>
    </html>
  )
}
