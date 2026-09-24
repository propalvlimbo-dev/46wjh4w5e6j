import Header from '@/components/Header'
import Hero from '@/components/Hero'
import LiveOrders from '@/components/LiveOrders'
import Shop from '@/components/Shop'
import SeoContent from '@/components/SeoContent'

import Footer from '@/components/Footer'

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': 'https://elytrix.pw/#website',
      url: 'https://elytrix.pw/',
      name: 'Elytrix',
      alternateName: ['Элитрикс', 'ElytriX'],
      inLanguage: 'ru-RU',
      description: 'Elytrix — гриферский Minecraft сервер с кланами, PvP, топами, коинами и магазином привилегий.'
    },
    {
      '@type': 'Organization',
      '@id': 'https://elytrix.pw/#organization',
      name: 'Elytrix',
      alternateName: 'Элитрикс',
      url: 'https://elytrix.pw/',
      logo: 'https://elytrix.pw/icon.png',
      email: 'elytrixhelp@mail.ru',
      sameAs: ['https://t.me/Elytrix_Help']
    },
    {
      '@type': 'VideoGame',
      '@id': 'https://elytrix.pw/#minecraft-server',
      name: 'Elytrix',
      alternateName: ['Элитрикс', 'ElytriX Minecraft сервер'],
      url: 'https://elytrix.pw/',
      gamePlatform: 'Minecraft Java Edition',
      genre: ['Гриферский сервер', 'Minecraft сервер', 'PvP', 'Выживание'],
      applicationCategory: 'Game',
      operatingSystem: 'Windows, macOS, Linux',
      description: 'Гриферский сервер Майнкрафт Elytrix: кланы, PvP, топы игроков, магазин, коины и быстрый старт. IP сервера: mc.elytrix.pw.'
    },
    {
      '@type': 'GameServer',
      '@id': 'https://elytrix.pw/#game-server',
      name: 'Elytrix Minecraft сервер',
      alternateName: 'Элитрикс гриферский сервер',
      url: 'https://elytrix.pw/',
      serverStatus: 'Online',
      game: { '@type': 'VideoGame', name: 'Minecraft' }
    }
  ]
}

export default function Home() {
  return (
    <main className="relative overflow-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }}
      />
      <Header />
      <Hero />
      <SeoContent />
      <Shop />
      <LiveOrders />
      <Footer />
    </main>
  )
}
