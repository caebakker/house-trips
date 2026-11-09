import { useEffect, useState, type FormEvent } from 'react'
import { AppHeader } from '../components/AppHeader'
import { Field } from '../components/Field'
import { buttonPrimary, inputClass } from '../components/ui'
import { submitSellerOptOut, submitFailure } from '../lib/optout/api'
import { canonicalOptOutUrls, optOutEmailOk } from '../lib/optout/urls'
import { m, fill } from '../i18n/t'

function failureCopy(reason: ReturnType<typeof submitFailure>): string {
  if (reason === 'urls') return m.optOut.errors.urls
  if (reason === 'email') return m.optOut.errors.email
  if (reason === 'comune') return m.optOut.errors.comune
  if (reason === 'confirm') return m.optOut.errors.confirm
  if (reason === 'slow') return m.optOut.errors.slow
  return m.optOut.errors.save
}

export default function OptOut() {
  const [urls, setUrls] = useState('')
  const [comune, setComune] = useState('')
  const [email, setEmail] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [company, setCompany] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    document.title = `${m.optOut.title} · ${m.appName}`
  }, [])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const parsed = canonicalOptOutUrls(urls)
    if ('error' in parsed) {
      setError(
        parsed.error === 'too_many'
          ? m.optOut.errors.tooMany
          : parsed.error === 'invalid'
            ? fill(m.optOut.errors.url, { url: parsed.invalid ?? '' })
            : m.optOut.errors.urls,
      )
      return
    }
    if (comune.trim().length > 80) {
      setError(m.optOut.errors.comune)
      return
    }
    if (!optOutEmailOk(email)) {
      setError(m.optOut.errors.email)
      return
    }
    if (!confirmed) {
      setError(m.optOut.errors.confirm)
      return
    }

    setBusy(true)
    try {
      await submitSellerOptOut({
        urls: parsed.urls,
        comune,
        email,
        confirmed,
        company,
      })
      setSent(true)
    } catch (err) {
      console.error(err)
      const reason = submitFailure(err instanceof Error ? err.message : '')
      setError(failureCopy(reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-svh bg-stone-50">
      <AppHeader />
      <main className="mx-auto max-w-lg px-4 py-6">
        <h1 className="text-2xl font-semibold text-stone-900">{m.optOut.title}</h1>
        <p className="mt-2 text-base leading-relaxed text-stone-600">{m.optOut.intro}</p>

        {sent ? (
          <div className="mt-8 rounded-lg bg-emerald-50 p-4 text-emerald-950" role="status">
            <p className="font-medium">{m.optOut.successTitle}</p>
            <p className="mt-2 leading-relaxed">{m.optOut.success}</p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-5" noValidate>
            <Field label={m.optOut.urls} htmlFor="opt-out-urls" hint={m.optOut.urlsHint}>
              <textarea
                id="opt-out-urls"
                rows={5}
                required
                value={urls}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                onChange={(event) => setUrls(event.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label={m.optOut.comune} htmlFor="opt-out-comune" hint={m.optOut.comuneHint}>
              <input
                id="opt-out-comune"
                value={comune}
                maxLength={80}
                autoComplete="address-level2"
                onChange={(event) => setComune(event.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label={m.optOut.email} htmlFor="opt-out-email" hint={m.optOut.emailHint}>
              <input
                id="opt-out-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                maxLength={320}
                onChange={(event) => setEmail(event.target.value)}
                className={inputClass}
              />
            </Field>
            <label className="flex items-start gap-3 text-base leading-relaxed text-stone-800">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                className="mt-1 h-5 w-5 shrink-0 accent-stone-900"
              />
              <span>{m.optOut.confirm}</span>
            </label>
            <div className="absolute left-[-9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
              <label htmlFor="opt-out-company">Company website</label>
              <input
                id="opt-out-company"
                name="company"
                tabIndex={-1}
                autoComplete="off"
                value={company}
                onChange={(event) => setCompany(event.target.value)}
              />
            </div>
            {error && <p className="text-sm text-red-700">{error}</p>}
            <button type="submit" className={buttonPrimary} disabled={busy}>
              {busy ? m.optOut.sending : m.optOut.submit}
            </button>
          </form>
        )}
      </main>
    </div>
  )
}
