const searchTags = ['elytrix', 'элитрикс', 'гриферский сервер', 'minecraft сервер', 'майнкрафт сервер', 'донат Elytrix']

const benefits = [
  {
    title: 'Гриферский режим',
    text: 'Свободная игра, PvP, развитие базы, рейды и активное выживание без лишней духоты.'
  },
  {
    title: 'Кланы и топы',
    text: 'Соревнуйтесь за места в топах игроков и кланов, набирайте опыт и показывайте результат.'
  },
  {
    title: 'Магазин и коины',
    text: 'Пополнение баланса, привилегии и предметы выдаются быстро прямо на Minecraft сервер.'
  }
]

export default function SeoContent() {
  return (
    <section aria-labelledby="about-elytrix" className="px-4 sm:px-8 py-8 sm:py-12 relative">
      <div className="max-w-7xl mx-auto glass rounded-3xl p-5 sm:p-7 lg:p-9 overflow-hidden relative">
        <div className="absolute -right-24 -top-24 w-64 h-64 rounded-full bg-pink-soft/35 blur-3xl" />
        <div className="relative grid lg:grid-cols-[1.05fr_0.95fr] gap-6 lg:gap-10 items-start">
          <div>
            <div className="text-xs text-pink-deep font-bold uppercase tracking-[0.22em] mb-3">Minecraft сервер</div>
            <h2 id="about-elytrix" className="font-display text-2xl sm:text-3xl lg:text-4xl leading-tight">
              Elytrix — гриферский сервер Minecraft
            </h2>
            <p className="mt-4 text-sm sm:text-base text-ink/65 leading-relaxed max-w-2xl">
              Elytrix, он же Элитрикс, — гриферский сервер Майнкрафт с активной экономикой, кланами,
              топами, PvP и быстрым стартом. Заходи на сервер по IP <span className="font-semibold text-ink/80">mc.elytrix.pw</span>,
              развивайся, собирай ресурсы, участвуй в сражениях и покупай коины или привилегии в магазине.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {searchTags.map(tag => (
                <span key={tag} className="rounded-full bg-white/65 border border-pink-soft/45 px-3 py-1.5 text-xs font-semibold text-ink/55">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="grid sm:grid-cols-3 lg:grid-cols-1 gap-3">
            {benefits.map(item => (
              <div key={item.title} className="rounded-2xl bg-white/65 border border-pink-soft/35 p-4 shadow-sm">
                <h3 className="font-display text-sm sm:text-base mb-1.5">{item.title}</h3>
                <p className="text-xs sm:text-sm text-ink/60 leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
