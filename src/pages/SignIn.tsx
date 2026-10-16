import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { m, fill } from '../i18n/t'

type Status = 'idle' | 'sending' | 'sent' | 'error'

export default function SignIn() {
  const { session } = useAuth()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')

  if (session) return <Navigate to="/trips" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setStatus('sending')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/trips` },
    })
    setStatus(error ? 'error' : 'sent')
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold text-stone-900">{m.signIn.title}</h1>
      <p className="mt-2 text-stone-600">{m.signIn.intro}</p>

      {status === 'sent' ? (
        <p className="mt-8 rounded-lg bg-emerald-50 p-4 text-emerald-900">
          {fill(m.signIn.sent, { email })}
        </p>
      ) : (
        <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-3">
          <label htmlFor="email" className="text-sm font-medium text-stone-700">
            {m.signIn.emailLabel}
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-stone-300 px-4 py-3 text-base focus:border-stone-900 focus:outline-none"
          />
          <button
            type="submit"
            disabled={status === 'sending'}
            className="rounded-lg bg-stone-900 px-4 py-3 font-medium text-white disabled:opacity-60"
          >
            {status === 'sending' ? m.signIn.sending : m.signIn.submit}
          </button>
          {status === 'error' && <p className="text-sm text-red-700">{m.signIn.error}</p>}
        </form>
      )}
    </main>
  )
}
