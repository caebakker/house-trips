import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AgencyNotice } from '../components/AgencyNotice'
import { AppHeader } from '../components/AppHeader'
import { AdminQueueScreen } from '../components/AdminQueueScreen'
import { ListingVerification } from '../components/ListingVerification'
import type { NearbyHouse, QueueItem, ResolveInput } from '../lib/admin/api'
import { m } from '../i18n/t'

const queue: QueueItem[] = [
  {
    id: 'req-alba',
    createdAt: '2026-10-28T09:00:00Z',
    listingId: 'listing-alba',
    tripListingId: 'stop-alba',
    tripName: 'November scouting',
    tripStart: '2026-11-02',
    tripEnd: '2026-11-06',
    buyerEmail: 'anna@example.com',
    comuneName: 'Alba',
    approxLat: 44.7,
    approxLng: 8.035,
    approxRadiusM: 2500,
    givenAddress: 'Via Vittorio Emanuele, Alba',
    givenLat: 44.7008,
    givenLng: 8.0354,
    listingUrl: 'https://example.com/listing-alba',
    portal: 'immobiliare',
    linkedPropertyId: null,
    linkedLat: null,
    linkedLng: null,
  },
  {
    id: 'req-asti',
    createdAt: '2026-10-29T09:00:00Z',
    listingId: 'listing-asti',
    tripListingId: 'stop-asti',
    tripName: 'December scouting',
    tripStart: '2026-12-01',
    tripEnd: '2026-12-04',
    buyerEmail: 'bram@example.com',
    comuneName: 'Asti',
    approxLat: 44.9,
    approxLng: 8.206,
    approxRadiusM: 3000,
    givenAddress: null,
    givenLat: null,
    givenLng: null,
    listingUrl: 'https://example.com/listing-asti',
    portal: 'idealista',
    linkedPropertyId: null,
    linkedLat: null,
    linkedLng: null,
  },
  {
    id: 'req-bra',
    createdAt: '2026-10-30T09:00:00Z',
    listingId: 'listing-bra',
    tripListingId: 'stop-bra',
    tripName: 'November scouting',
    tripStart: '2026-11-02',
    tripEnd: '2026-11-06',
    buyerEmail: 'anna@example.com',
    comuneName: 'Bra',
    approxLat: 44.7,
    approxLng: 7.85,
    approxRadiusM: 2000,
    givenAddress: null,
    givenLat: null,
    givenLng: null,
    listingUrl: 'https://example.com/listing-bra',
    portal: null,
    linkedPropertyId: 'house-1',
    linkedLat: 44.699,
    linkedLng: 8.034,
  },
]

const houses: NearbyHouse[] = [
  { id: 'house-1', lat: 44.6992, lng: 8.0341, distanceM: 180, label: 'Alba' },
]

function BuyerPreview() {
  return (
    <div className="min-h-svh bg-stone-50">
      <AppHeader />
      <main className="mx-auto max-w-lg px-4 py-4">
        <p className="text-sm text-stone-600">{m.trip.back}</p>
        <h1 className="mt-3 text-2xl font-semibold text-stone-900">November scouting</h1>
        <p className="mt-1 text-sm text-stone-600">2 Nov 2026 to 6 Nov 2026</p>
        <div className="mt-5">
          <AgencyNotice />
          <article className="mt-4 rounded-lg border border-stone-200 bg-white px-4 py-3">
            <div className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-800 text-xs font-semibold text-white">
                1
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-medium text-stone-900">Alba</h2>
                <p className="text-sm text-stone-500">Immobiliare.it, Must see</p>
                <p className="mt-1 text-sm text-stone-700">{m.trip.approximateArea}</p>
                <ListingVerification
                  listingStatus="check_requested"
                  rows={[{ status: 'queued', createdAt: '2026-10-28T09:00:00Z' }]}
                  credits={2}
                  busy={false}
                  error={null}
                  onRequest={() => {}}
                />
              </div>
            </div>
          </article>
        </div>
      </main>
    </div>
  )
}

function AdminPreview() {
  const [items, setItems] = useState(queue)
  return (
    <AdminQueueScreen
      items={items}
      loadNearby={async () => houses}
      onResolve={async (input: ResolveInput) => {
        setItems((current) => current.filter((item) => item.id !== input.requestId))
      }}
    />
  )
}

export default function M2Preview() {
  const [params] = useSearchParams()
  if (params.get('view') === 'buyer') return <BuyerPreview />
  return <AdminPreview />
}
