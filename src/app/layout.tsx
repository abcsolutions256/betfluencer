import type { Metadata, Viewport } from 'next'
import './globals.css'
import { CountryProvider } from '@/components/CountryProvider'

export const metadata: Metadata = {
  title: 'Betfluencer — Football Tipster Marketplace',
  description: 'Subscribe to top football tipsters across Africa. Pay with mobile money. No account needed.',
  manifest: '/manifest.json',
  icons: { icon: '/icon.png', apple: '/apple-icon.png' },
  openGraph: {
    title: 'Betfluencer',
    description: 'Top football tips from Africa’s best tipsters. Pay with mobile money.',
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
          <CountryProvider>{children}</CountryProvider>
        </div>
      </body>
    </html>
  )
}
