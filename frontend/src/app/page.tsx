import Header from '@/components/Header'
import Hero from '@/components/Hero'
import LiveOrders from '@/components/LiveOrders'
import Shop from '@/components/Shop'

import Footer from '@/components/Footer'

export default function Home() {
  return (
    <main className="relative overflow-hidden">
      <Header />
      <Hero />
      <Shop />
      <LiveOrders />
      <Footer />
    </main>
  )
}