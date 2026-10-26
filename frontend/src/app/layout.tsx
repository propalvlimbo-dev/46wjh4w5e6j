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

const siteUrl = 'https://elytrix.pw'
const siteTitle = 'Elytrix — гриферский сервер Minecraft | Элитрикс'
const siteDescription = 'Elytrix (Элитрикс) — гриферский Minecraft сервер с кланами, PvP, топами игроков, коинами, донатом и мгновенной выдачей покупок. IP: mc.elytrix.pw.'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteTitle,
    template: '%s | Elytrix'
  },
  description: siteDescription,
  applicationName: 'Elytrix',
  keywords: [
    'Elytrix',
    'ElytriX',
    'Элитрикс',
    'элитрикс сервер',
    'elytrix сервер',
    'гриферский сервер',
    'гриферский сервер майнкрафт',
    'Minecraft сервер',
    'майнкрафт сервер',
    'сервер Minecraft с донатом',
    'донат магазин Minecraft',
    'mc.elytrix.pw'
  ],
  authors: [{ name: 'Elytrix' }],
  creator: 'Elytrix',
  publisher: 'Elytrix',
  category: 'Minecraft server',
  alternates: {
    canonical: '/'
  },
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    url: '/',
    siteName: 'Elytrix',
    title: siteTitle,
    description: siteDescription,
    images: [
      {
        url: '/images/hero.png',
        width: 1200,
        height: 630,
        alt: 'Elytrix — гриферский Minecraft сервер'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: siteTitle,
    description: siteDescription,
    images: ['/images/hero.png']
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1
    }
  }
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
