import { AppHeader } from '../components/AppHeader'
import { PlanWorkspace, type ViewStop } from '../components/PlanWorkspace'
import { LANGHE_MAX_DRIVE, LANGHE_START, LANGHE_STOPS } from '../lib/scheduler/fixture'

const stops: ViewStop[] = LANGHE_STOPS.map((stop, index) => ({
  id: stop.id,
  comuneName: stop.name,
  priority: stop.priority,
  dwellMinutes: 10,
  radiusM: 2500,
  zoneLat: stop.comuneLat,
  zoneLng: stop.comuneLng,
  givenAddress: stop.unlocked ? null : stop.givenAddress,
  given: stop.givenAddress ? { lat: stop.comuneLat, lng: stop.comuneLng } : null,
  unlocked: stop.unlocked ? { lat: stop.lat, lng: stop.lng } : null,
  url: `https://example.com/listings/${stop.id}`,
  portal: index % 2 === 0 ? 'immobiliare' : 'idealista',
}))

/** Dev-only view of the real plan screen, with the Langhe fixture. No account needed. */
export default function M3Preview() {
  return (
    <div className="min-h-svh bg-stone-50">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-4">
        <PlanWorkspace
          tripName="November in the Langhe"
          startDate="2026-11-10"
          endDate="2026-11-11"
          maxDriveMinutes={LANGHE_MAX_DRIVE}
          stops={stops}
          initialStart={{ label: 'Alba', lat: LANGHE_START.lat, lng: LANGHE_START.lng }}
          initialLunchStart={750}
          initialLunchEnd={900}
          initialPlan={null}
        />
      </main>
    </div>
  )
}
