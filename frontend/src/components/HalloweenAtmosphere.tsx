import { Ghost, Sparkles } from 'lucide-react'

/**
 * Seasonal decoration lives in one component and one CSS section.
 * Remove this component and the `halloween-atmosphere` CSS block after Halloween.
 */
export default function HalloweenAtmosphere() {
  return (
    <div className="halloween-atmosphere" aria-hidden="true">
      <div className="halloween-moon" />
      <div className="halloween-ghost halloween-ghost-one">
        <Ghost strokeWidth={1.35} />
      </div>
      <div className="halloween-ghost halloween-ghost-two">
        <Ghost strokeWidth={1.2} />
      </div>
      <div className="halloween-ghost halloween-ghost-three">
        <Ghost strokeWidth={1.35} />
      </div>
      <Sparkles className="halloween-spark halloween-spark-one" size={15} strokeWidth={1.4} />
      <Sparkles className="halloween-spark halloween-spark-two" size={11} strokeWidth={1.4} />
    </div>
  )
}
