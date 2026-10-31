import { useRef, useState, type FormEvent } from 'react'
import type { Comune } from '../lib/comuni/data'
import type { AddressHit } from '../lib/geo/address'
import { lookupAddress } from '../lib/geo/address'
import type { ListingInput } from '../lib/trips/api'
import { canonicaliseListingUrl } from '../lib/urls/canonical'
import { m, fill } from '../i18n/t'
import { ComuneAutocomplete } from './ComuneAutocomplete'
import { Field } from './Field'
import { buttonPrimary, buttonQuiet, buttonSecondary, inputClass } from './ui'

export type ListingFormValues = ListingInput

type Props = {
  mode: 'new' | 'edit'
  initialUrl: string
  initialComune: Comune | null
  initialPriority: number
  initialAddress: string
  initialPin: { lat: number; lng: number } | null
  initialAgentName: string
  initialAgentEmail: string
  initialAgentPhone: string
  submitting: boolean
  formError: string | null
  onSubmit: (values: ListingFormValues) => void
  onCancel: () => void
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type FieldErrors = {
  url?: string
  comune?: string
  address?: string
  agentName?: string
  agentEmail?: string
  agentPhone?: string
}

export function ListingForm({
  mode,
  initialUrl,
  initialComune,
  initialPriority,
  initialAddress,
  initialPin,
  initialAgentName,
  initialAgentEmail,
  initialAgentPhone,
  submitting,
  formError,
  onSubmit,
  onCancel,
}: Props) {
  const [url, setUrl] = useState(initialUrl)
  const [comune, setComune] = useState<Comune | null>(initialComune)
  const [priority, setPriority] = useState(initialPriority)
  const [address, setAddress] = useState(initialAddress)
  const [pin, setPin] = useState(initialPin)
  const [pinLabel, setPinLabel] = useState<string | null>(null)
  const [agentName, setAgentName] = useState(initialAgentName)
  const [agentEmail, setAgentEmail] = useState(initialAgentEmail)
  const [agentPhone, setAgentPhone] = useState(initialAgentPhone)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [hits, setHits] = useState<AddressHit[]>([])
  const [lookingUp, setLookingUp] = useState(false)
  const [lookupNote, setLookupNote] = useState<string | null>(null)
  const lookupRequest = useRef(0)

  async function onLookup() {
    setLookupNote(null)
    if (!comune) {
      setLookupNote(m.listingForm.lookupNeedComune)
      setHits([])
      return
    }
    if (!address.trim()) return
    const requestId = ++lookupRequest.current
    setLookingUp(true)
    setHits([])
    try {
      const found = await lookupAddress(address, comune)
      if (requestId !== lookupRequest.current) return
      setHits(found)
      setLookupNote(found.length === 0 ? m.listingForm.lookupEmpty : null)
    } catch (error) {
      console.error(error)
      if (requestId !== lookupRequest.current) return
      setLookupNote(m.listingForm.lookupError)
    } finally {
      if (requestId === lookupRequest.current) setLookingUp(false)
    }
  }

  function chooseHit(hit: AddressHit) {
    setPin({ lat: hit.lat, lng: hit.lng })
    setPinLabel(hit.label)
    setHits([])
    setLookupNote(null)
  }

  function onSubmitForm(event: FormEvent) {
    event.preventDefault()
    const next: FieldErrors = {}
    if (mode === 'new' && !canonicaliseListingUrl(url)) next.url = m.listingForm.errors.url
    if (!comune) next.comune = m.listingForm.errors.comune
    if (address.trim().length > 300) next.address = m.listingForm.errors.address
    if (agentName.trim().length > 200) next.agentName = m.listingForm.errors.agentName
    if (agentEmail.trim() && (agentEmail.trim().length > 320 || !EMAIL.test(agentEmail.trim()))) {
      next.agentEmail = m.listingForm.errors.agentEmail
    }
    if (agentPhone.trim().length > 50) next.agentPhone = m.listingForm.errors.agentPhone
    setErrors(next)
    if (Object.keys(next).length > 0 || !comune) return

    const trimmedAddress = address.trim()
    onSubmit({
      url,
      comune,
      priority,
      givenAddress: trimmedAddress,
      givenLat: trimmedAddress && pin ? pin.lat : null,
      givenLng: trimmedAddress && pin ? pin.lng : null,
      agentName,
      agentEmail,
      agentPhone,
    })
  }

  return (
    <form onSubmit={onSubmitForm} className="flex flex-col gap-5" noValidate>
      {mode === 'new' ? (
        <Field label={m.listingForm.url} htmlFor="listing-url" hint={m.listingForm.urlHint} error={errors.url}>
          <input
            id="listing-url"
            type="url"
            inputMode="url"
            required
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            aria-invalid={errors.url ? true : undefined}
            aria-describedby={errors.url ? 'listing-url-error' : 'listing-url-hint'}
            className={inputClass}
          />
        </Field>
      ) : (
        <div>
          <p className="text-sm font-medium text-stone-800">{m.listingForm.url}</p>
          <a
            href={initialUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 block text-base break-all text-stone-900 underline"
          >
            {initialUrl}
          </a>
          <p className="mt-1 text-sm text-stone-500">{m.listingForm.urlLocked}</p>
        </div>
      )}

      <Field label={m.listingForm.comune} htmlFor="comune" hint={m.listingForm.comuneHint} error={errors.comune}>
        <ComuneAutocomplete value={comune} onChange={setComune} error={errors.comune} />
      </Field>

      <Field
        label={m.listingForm.address}
        htmlFor="address"
        hint={m.listingForm.addressHint}
        error={errors.address}
      >
        <textarea
          id="address"
          rows={2}
          value={address}
          maxLength={300}
          onChange={(event) => {
            setAddress(event.target.value)
            setPin(null)
            setPinLabel(null)
            setHits([])
            lookupRequest.current += 1
            setLookingUp(false)
            setLookupNote(null)
          }}
          aria-invalid={errors.address ? true : undefined}
          aria-describedby={errors.address ? 'address-error' : 'address-hint'}
          className={inputClass}
        />
      </Field>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          className={buttonSecondary}
          disabled={lookingUp || address.trim().length === 0}
          onClick={onLookup}
        >
          {lookingUp ? m.listingForm.looking : m.listingForm.lookup}
        </button>
        <p className="text-sm text-stone-500">{m.listingForm.lookupHint}</p>
        {lookupNote && <p className="text-sm text-red-700">{lookupNote}</p>}
        {hits.length > 0 && (
          <ul className="overflow-hidden rounded-lg border border-stone-200">
            {hits.map((hit) => (
              <li key={`${hit.label}-${hit.lat}-${hit.lng}`}>
                <button
                  type="button"
                  className="w-full px-3 py-3 text-left text-base hover:bg-amber-50"
                  onClick={() => chooseHit(hit)}
                >
                  {hit.label}
                </button>
              </li>
            ))}
          </ul>
        )}
        {pin && address.trim() && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-stone-100 px-3 py-2 text-sm text-stone-800">
            <p>{pinLabel ? fill(m.listingForm.pinSet, { label: pinLabel }) : m.listingForm.pinSaved}</p>
            <button
              type="button"
              className={buttonQuiet}
              onClick={() => {
                setPin(null)
                setPinLabel(null)
              }}
            >
              {m.listingForm.clearPin}
            </button>
          </div>
        )}
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-stone-800">{m.listingForm.agentLegend}</legend>
        <p className="text-sm text-stone-500">{m.listingForm.agentHint}</p>
        <Field label={m.listingForm.agentName} htmlFor="agent-name" error={errors.agentName}>
          <input
            id="agent-name"
            value={agentName}
            maxLength={200}
            onChange={(event) => setAgentName(event.target.value)}
            aria-invalid={errors.agentName ? true : undefined}
            className={inputClass}
          />
        </Field>
        <Field label={m.listingForm.agentEmail} htmlFor="agent-email" error={errors.agentEmail}>
          <input
            id="agent-email"
            type="email"
            autoComplete="email"
            value={agentEmail}
            maxLength={320}
            onChange={(event) => setAgentEmail(event.target.value)}
            aria-invalid={errors.agentEmail ? true : undefined}
            className={inputClass}
          />
        </Field>
        <Field label={m.listingForm.agentPhone} htmlFor="agent-phone" error={errors.agentPhone}>
          <input
            id="agent-phone"
            type="tel"
            autoComplete="tel"
            value={agentPhone}
            maxLength={50}
            onChange={(event) => setAgentPhone(event.target.value)}
            aria-invalid={errors.agentPhone ? true : undefined}
            className={inputClass}
          />
        </Field>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium text-stone-800">{m.listingForm.priority}</legend>
        <div className="mt-2 grid gap-2">
          {[1, 2, 3].map((level) => (
            <label
              key={level}
              className={`flex items-center gap-3 rounded-lg border px-3 py-3 text-base ${
                priority === level ? 'border-stone-900' : 'border-stone-200'
              }`}
            >
              <input
                type="radio"
                name="priority"
                value={level}
                checked={priority === level}
                onChange={() => setPriority(level)}
              />
              {level === 1 ? m.listingForm.priority1 : level === 3 ? m.listingForm.priority3 : m.listingForm.priority2}
            </label>
          ))}
        </div>
      </fieldset>

      {formError && <p className="text-sm text-red-700">{formError}</p>}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="submit" className={buttonPrimary} disabled={submitting}>
          {submitting ? m.listingForm.saving : mode === 'new' ? m.listingForm.save : m.listingForm.saveEdit}
        </button>
        <button type="button" className={buttonSecondary} onClick={onCancel}>
          {m.common.cancel}
        </button>
      </div>
    </form>
  )
}
