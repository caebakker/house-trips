import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { Field } from '../components/Field'
import { buttonDanger, buttonPrimary, buttonSecondary, inputClass } from '../components/ui'
import { addDays, formatHours, romeToday } from '../lib/dates'
import { createTrip, deleteTrip, getTrip, updateTrip } from '../lib/trips/api'
import { hoursToDriveMinutes, parseDwellMinutes, tripSpanError, validTripName } from '../lib/trips/validate'
import { m } from '../i18n/t'

type FieldErrors = {
  name?: string
  dates?: string
  drive?: string
  dwell?: string
}

export default function TripFormPage() {
  const { tripId } = useParams()
  const editing = Boolean(tripId)
  const navigate = useNavigate()
  const today = romeToday()

  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(addDays(today, 2))
  const [driveHours, setDriveHours] = useState('4')
  const [dwell, setDwell] = useState('10')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(editing)
  const [missing, setMissing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  useEffect(() => {
    document.title = `${editing ? m.tripForm.editTitle : m.tripForm.newTitle} · ${m.appName}`
  }, [editing])

  useEffect(() => {
    if (!tripId) return
    let cancelled = false
    getTrip(tripId)
      .then((trip) => {
        if (cancelled) return
        if (!trip) {
          setMissing(true)
          return
        }
        setName(trip.name)
        setStartDate(trip.startDate)
        setEndDate(trip.endDate)
        setDriveHours(formatHours(trip.maxDriveMinutes))
        setDwell(String(trip.dwellMinutes))
      })
      .catch((err: unknown) => {
        console.error(err)
        if (!cancelled) setFormError(m.tripForm.errors.save)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tripId])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const next: FieldErrors = {}
    if (!validTripName(name)) next.name = m.tripForm.errors.name
    const span = tripSpanError(startDate, endDate)
    if (span === 'order') next.dates = m.tripForm.errors.dates
    if (span === 'span') next.dates = m.tripForm.errors.span
    const driveMinutes = hoursToDriveMinutes(driveHours)
    if (driveMinutes == null) next.drive = m.tripForm.errors.drive
    const dwellMinutes = parseDwellMinutes(dwell)
    if (dwellMinutes == null) next.dwell = m.tripForm.errors.dwell
    setErrors(next)
    setFormError(null)
    if (Object.keys(next).length > 0 || driveMinutes == null || dwellMinutes == null) return

    const input = {
      name,
      startDate,
      endDate,
      maxDriveMinutes: driveMinutes,
      dwellMinutes,
    }
    setSubmitting(true)
    try {
      if (tripId) {
        const saved = await updateTrip(tripId, input)
        if (!saved) {
          setMissing(true)
          return
        }
        navigate(`/trips/${tripId}`)
      } else {
        const id = await createTrip(input)
        navigate(`/trips/${id}`)
      }
    } catch (err) {
      console.error(err)
      setFormError(m.tripForm.errors.save)
      setSubmitting(false)
    }
  }

  async function onDelete() {
    if (!tripId) return
    setSubmitting(true)
    setFormError(null)
    try {
      const removed = await deleteTrip(tripId)
      if (!removed) {
        setMissing(true)
        return
      }
      navigate('/trips')
    } catch (err) {
      console.error(err)
      setFormError(m.tripForm.errors.delete)
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-svh bg-stone-50">
      <AppHeader />
      <main className="mx-auto max-w-lg px-4 py-6">
        <Link to={tripId ? `/trips/${tripId}` : '/trips'} className="text-sm text-stone-600 hover:text-stone-900">
          {tripId ? m.trip.back : m.nav.trips}
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-stone-900">
          {editing ? m.tripForm.editTitle : m.tripForm.newTitle}
        </h1>

        {loading && <p className="mt-6 text-stone-600">{m.common.loading}</p>}
        {missing && <p className="mt-6 text-stone-600">{m.tripForm.notFound}</p>}

        {!loading && !missing && (
          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-5" noValidate>
            <Field label={m.tripForm.name} htmlFor="trip-name" hint={m.tripForm.nameHint} error={errors.name}>
              <input
                id="trip-name"
                required
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={errors.name ? 'trip-name-error' : 'trip-name-hint'}
                className={inputClass}
              />
            </Field>
            <Field label={m.tripForm.start} htmlFor="start-date" error={errors.dates}>
              <input
                id="start-date"
                type="date"
                required
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                aria-invalid={errors.dates ? true : undefined}
                aria-describedby={errors.dates ? 'start-date-error' : undefined}
                className={inputClass}
              />
            </Field>
            <Field label={m.tripForm.end} htmlFor="end-date">
              <input
                id="end-date"
                type="date"
                required
                min={startDate}
                max={addDays(startDate, 60)}
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label={m.tripForm.drive} htmlFor="drive-hours" hint={m.tripForm.driveHint} error={errors.drive}>
              <input
                id="drive-hours"
                type="number"
                inputMode="decimal"
                min={0.5}
                max={12}
                step={0.5}
                required
                value={driveHours}
                onChange={(event) => setDriveHours(event.target.value)}
                aria-invalid={errors.drive ? true : undefined}
                aria-describedby={errors.drive ? 'drive-hours-error' : 'drive-hours-hint'}
                className={inputClass}
              />
            </Field>
            <Field label={m.tripForm.dwell} htmlFor="dwell" hint={m.tripForm.dwellHint} error={errors.dwell}>
              <input
                id="dwell"
                type="number"
                inputMode="numeric"
                min={1}
                max={240}
                step={1}
                required
                value={dwell}
                onChange={(event) => setDwell(event.target.value)}
                aria-invalid={errors.dwell ? true : undefined}
                aria-describedby={errors.dwell ? 'dwell-error' : 'dwell-hint'}
                className={inputClass}
              />
            </Field>

            {formError && <p className="text-sm text-red-700">{formError}</p>}

            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="submit" className={buttonPrimary} disabled={submitting}>
                {submitting ? m.tripForm.saving : m.tripForm.save}
              </button>
              <Link to={tripId ? `/trips/${tripId}` : '/trips'} className={buttonSecondary}>
                {m.common.cancel}
              </Link>
            </div>

            {editing && (
              confirmingDelete ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                  <p className="text-sm text-red-900">{m.tripForm.confirmDelete}</p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <button type="button" className={buttonDanger} disabled={submitting} onClick={onDelete}>
                      {m.tripForm.confirm}
                    </button>
                    <button type="button" className={buttonSecondary} onClick={() => setConfirmingDelete(false)}>
                      {m.common.cancel}
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" className={buttonDanger} onClick={() => setConfirmingDelete(true)}>
                  {m.tripForm.delete}
                </button>
              )
            )}
          </form>
        )}
      </main>
    </div>
  )
}
