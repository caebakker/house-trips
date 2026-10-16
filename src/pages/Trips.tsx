import { supabase } from '../lib/supabase'
import { m } from '../i18n/t'

export default function Trips() {
  return (
    <div className="min-h-svh bg-stone-50">
      <header className="flex items-center justify-between border-b border-stone-200 bg-white px-6 py-4">
        <span className="font-semibold text-stone-900">{m.appName}</span>
        <button
          onClick={() => supabase.auth.signOut()}
          className="text-sm text-stone-600 hover:text-stone-900"
        >
          {m.nav.signOut}
        </button>
      </header>
      <main className="mx-auto max-w-2xl px-6 py-8">
        <h1 className="text-2xl font-semibold text-stone-900">{m.trips.title}</h1>
        <p className="mt-6 rounded-lg border border-dashed border-stone-300 p-8 text-center text-stone-600">
          {m.trips.empty}
        </p>
      </main>
    </div>
  )
}
