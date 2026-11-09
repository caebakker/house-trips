import { useState } from 'react'
import { AdminOptOutScreen } from '../components/AdminOptOutScreen'
import type { OptOutRequest } from '../lib/optout/api'

const sample: OptOutRequest[] = [
  {
    id: 'opt-alba',
    status: 'pending',
    listingUrls: [
      'https://www.immobiliare.it/annunci/116128813',
      'https://www.idealista.it/immobile/24811320',
    ],
    comune: 'Alba',
    contactEmail: 'owner@example.com',
    ownerConfirmed: true,
    createdAt: '2026-11-09T09:30:00Z',
  },
  {
    id: 'opt-asti',
    status: 'approved',
    listingUrls: ['https://www.casa.it/immobili/82715349'],
    comune: 'Asti',
    contactEmail: 'agent@example.com',
    ownerConfirmed: true,
    createdAt: '2026-11-08T11:05:00Z',
  },
]

/** Dev-only stand-in for /admin/opt-outs, using the same screen. */
export default function OptOutPreview() {
  const [items, setItems] = useState(sample)
  return (
    <AdminOptOutScreen
      items={items}
      onDecide={async (request, decision) => {
        setItems((current) =>
          decision === 'rejected'
            ? current.filter((row) => row.id !== request.id)
            : current.map((row) => (row.id === request.id ? { ...row, status: 'approved' } : row)),
        )
      }}
      onRestore={async (request) => {
        setItems((current) => current.filter((row) => row.id !== request.id))
      }}
    />
  )
}
