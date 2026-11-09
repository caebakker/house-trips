import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useIsAdmin } from '../auth/useIsAdmin'
import { AppHeader } from '../components/AppHeader'
import { Field } from '../components/Field'
import { buttonPrimary, buttonSecondary, inputClass } from '../components/ui'
import { adminCreditBalance, adminFailure, fetchRecentGrants, grantCredits, type GrantRow } from '../lib/admin/api'
import { formatTripDate } from '../lib/dates'
import { m, fill } from '../i18n/t'

function balanceCopy(email: string, balance: number): string {
  return balance === 1
    ? fill(m.credits.balanceOne, { email })
    : fill(m.credits.balance, { email, balance: String(balance) })
}

export default function AdminCredits() {
  const { isAdmin, checked } = useIsAdmin()
  const [email, setEmail] = useState('')
  const [amount, setAmount] = useState('1')
  const [note, setNote] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState<'grant' | 'check' | null>(null)
  const [recent, setRecent] = useState<GrantRow[] | null>(null)

  useEffect(() => {
    document.title = `${m.credits.title} · ${m.appName}`
  }, [])

  useEffect(() => {
    if (!checked || !isAdmin) return
    let cancelled = false
    fetchRecentGrants()
      .then((rows) => {
        if (!cancelled) setRecent(rows)
      })
      .catch((err: unknown) => {
        console.error(err)
        if (!cancelled) setRecent([])
      })
    return () => {
      cancelled = true
    }
  }, [checked, isAdmin])

  function parsedAmount(): number | null {
    if (!/^\d+$/.test(amount.trim())) return null
    const value = Number(amount)
    if (value < 1 || value > 500) return null
    return value
  }

  async function onCheck() {
    setFormError(null)
    setMessage(null)
    if (!email.trim()) {
      setFormError(m.credits.errors.email)
      return
    }
    setBusy('check')
    try {
      const balance = await adminCreditBalance(email)
      setMessage(balanceCopy(email.trim(), balance))
    } catch (err) {
      console.error(err)
      const reason = adminFailure(err instanceof Error ? err.message : '')
      setFormError(reason === 'none' ? m.credits.errors.none : m.credits.errors.save)
    } finally {
      setBusy(null)
    }
  }

  async function onGrant(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    setMessage(null)
    const credits = parsedAmount()
    if (!email.trim()) {
      setFormError(m.credits.errors.email)
      return
    }
    if (credits == null) {
      setFormError(m.credits.errors.amount)
      return
    }
    setBusy('grant')
    try {
      const balance = await grantCredits(email, credits, note)
      setMessage(fill(m.credits.granted, { amount: String(credits), email: email.trim(), balance: String(balance) }))
      setNote('')
      const rows = await fetchRecentGrants()
      setRecent(rows)
    } catch (err) {
      console.error(err)
      const reason = adminFailure(err instanceof Error ? err.message : '')
      setFormError(
        reason === 'none' ? m.credits.errors.none : reason === 'amount' ? m.credits.errors.amount : m.credits.errors.save,
      )
    } finally {
      setBusy(null)
    }
  }

  if (!checked) {
    return (
      <div className="min-h-svh bg-stone-50">
        <AppHeader />
        <p className="p-6 text-stone-600">{m.common.loading}</p>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="min-h-svh bg-stone-50">
        <AppHeader />
        <main className="mx-auto max-w-lg px-4 py-8">
          <p className="text-stone-700">{m.credits.forbidden}</p>
          <Link to="/trips" className={`${buttonSecondary} mt-4`}>
            {m.admin.back}
          </Link>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-svh bg-stone-50">
      <AppHeader />
      <main className="mx-auto max-w-lg px-4 py-6">
        <Link to="/admin/queue" className="text-sm text-stone-600 hover:text-stone-900">
          {m.admin.title}
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-stone-900">{m.credits.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-stone-600">{m.credits.intro}</p>

        <form className="mt-6 flex flex-col gap-4" onSubmit={(event) => void onGrant(event)}>
          <Field label={m.credits.email} htmlFor="credit-email">
            <input
              id="credit-email"
              type="email"
              autoComplete="off"
              className={inputClass}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={formError ? true : undefined}
            />
          </Field>
          <Field label={m.credits.amount} htmlFor="credit-amount" hint={m.credits.amountHint}>
            <input
              id="credit-amount"
              inputMode="numeric"
              className={inputClass}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>
          <Field label={m.credits.note} htmlFor="credit-note">
            <input
              id="credit-note"
              className={inputClass}
              maxLength={500}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
          {formError && (
            <p className="text-sm text-red-700" aria-live="polite">
              {formError}
            </p>
          )}
          {message && (
            <p className="text-sm text-stone-800" aria-live="polite">
              {message}
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="submit" className={buttonPrimary} disabled={busy !== null}>
              {busy === 'grant' ? m.credits.granting : m.credits.grant}
            </button>
            <button type="button" className={buttonSecondary} disabled={busy !== null} onClick={() => void onCheck()}>
              {busy === 'check' ? m.credits.checking : m.credits.check}
            </button>
          </div>
        </form>

        <h2 className="mt-8 text-lg font-semibold text-stone-900">{m.credits.recent}</h2>
        {recent === null && <p className="mt-2 text-sm text-stone-600">{m.common.loading}</p>}
        {recent && recent.length === 0 && <p className="mt-2 text-sm text-stone-600">{m.credits.recentEmpty}</p>}
        {recent && recent.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2">
            {recent.map((row) => (
              <li key={`${row.createdAt}-${row.email}`} className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm">
                <p className="text-stone-900">
                  {fill(m.credits.recentLine, { amount: String(row.delta), email: row.email })}
                </p>
                <p className="text-stone-500">{formatTripDate(row.createdAt.slice(0, 10))}</p>
                {row.note && <p className="text-stone-600">{row.note}</p>}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
