import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { ListingForm, type ListingFormValues } from '../components/ListingForm'
import { findComune } from '../lib/comuni/data'
import { addTripListing, getTrip, getTripListing, updateTripListing } from '../lib/trips/api'
import { m } from '../i18n/t'

export default function ListingFormPage() {
  const { tripId, tripListingId } = useParams()
  const editing = Boolean(tripListingId)
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [initial, setInitial] = useState<{
    url: string
    comuneIstat: string | null
    priority: number
    address: string
    pin: { lat: number; lng: number } | null
    agentName: string
    agentEmail: string
    agentPhone: string
  } | null>(null)

  useEffect(() => {
    document.title = `${editing ? m.listingForm.editTitle : m.listingForm.addTitle} · ${m.appName}`
  }, [editing])

  useEffect(() => {
    if (!tripId) return
    let cancelled = false
    const listingPromise = tripListingId ? getTripListing(tripId, tripListingId) : Promise.resolve(null)
    Promise.all([getTrip(tripId), listingPromise])
      .then(([trip, listing]) => {
        if (cancelled) return
        if (!trip || (tripListingId && !listing)) {
          setMissing(true)
          return
        }
        if (listing) {
          setInitial({
            url: listing.canonicalUrl,
            comuneIstat: listing.comuneIstat,
            priority: listing.priority,
            address: listing.givenAddress ?? '',
            pin:
              listing.givenLat != null && listing.givenLng != null
                ? { lat: listing.givenLat, lng: listing.givenLng }
                : null,
            agentName: listing.agentName ?? '',
            agentEmail: listing.agentEmail ?? '',
            agentPhone: listing.agentPhone ?? '',
          })
        } else {
          setInitial({
            url: '',
            comuneIstat: null,
            priority: 2,
            address: '',
            pin: null,
            agentName: '',
            agentEmail: '',
            agentPhone: '',
          })
        }
      })
      .catch((err: unknown) => {
        console.error(err)
        if (!cancelled) setFormError(m.listingForm.errors.save)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tripId, tripListingId])

  async function onSubmit(values: ListingFormValues) {
    if (!tripId) return
    setSubmitting(true)
    setFormError(null)
    try {
      if (tripListingId) {
        const saved = await updateTripListing(tripListingId, values)
        if (!saved) {
          setMissing(true)
          return
        }
      } else {
        const result = await addTripListing(tripId, values)
        if (!result.ok) {
          setFormError(
            result.reason === 'duplicate'
              ? m.listingForm.errors.duplicate
              : result.reason === 'url'
                ? m.listingForm.errors.url
                : m.listingForm.errors.save,
          )
          setSubmitting(false)
          return
        }
      }
      navigate(`/trips/${tripId}`)
    } catch (err) {
      console.error(err)
      setFormError(m.listingForm.errors.save)
      setSubmitting(false)
    }
  }

  const comune = initial?.comuneIstat ? findComune(initial.comuneIstat) : null

  return (
    <div className="min-h-svh bg-stone-50">
      <AppHeader />
      <main className="mx-auto max-w-lg px-4 py-6">
        <Link to={tripId ? `/trips/${tripId}` : '/trips'} className="text-sm text-stone-600 hover:text-stone-900">
          {m.trip.back}
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-stone-900">
          {editing ? m.listingForm.editTitle : m.listingForm.addTitle}
        </h1>

        {loading && <p className="mt-6 text-stone-600">{m.common.loading}</p>}
        {missing && (
          <p className="mt-6 text-stone-600">{editing ? m.listingForm.notFound : m.trip.notFound}</p>
        )}

        {!loading && !missing && initial && (
          <div className="mt-6">
            <ListingForm
              mode={editing ? 'edit' : 'new'}
              initialUrl={initial.url}
              initialComune={comune}
              initialPriority={initial.priority}
              initialAddress={initial.address}
              initialPin={initial.pin}
              initialAgentName={initial.agentName}
              initialAgentEmail={initial.agentEmail}
              initialAgentPhone={initial.agentPhone}
              submitting={submitting}
              formError={formError}
              onSubmit={onSubmit}
              onCancel={() => navigate(tripId ? `/trips/${tripId}` : '/trips')}
            />
          </div>
        )}
      </main>
    </div>
  )
}
