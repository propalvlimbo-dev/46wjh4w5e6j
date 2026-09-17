import '../styles/globals.css'
import type { Metadata, Viewport } from 'next'
import { Inter, Unbounded } from 'next/font/google'
import SmoothScroll from '@/components/SmoothScroll'
import Maintenance from '@/components/Maintenance'

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap'
})

const unbounded = Unbounded({
  subsets: ['latin', 'cyrillic'],
  weight: ['600', '700', '800'],
  variable: '--font-unbounded',
  display: 'swap'
})

export const metadata: Metadata = {
  title: 'Elytrix — Донат магазин',
  description: 'Магазин привилегий Minecraft сервера'
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${inter.variable} ${unbounded.variable}`}>
      <body className="font-sans">
        <Maintenance>
          <SmoothScroll>{children}</SmoothScroll>
        </Maintenance>
      </body>
    </html>
  )
}