import { useEffect } from 'react'
import { AppHeader } from '../components/AppHeader'
import { m } from '../i18n/t'

export default function Terms() {
  useEffect(() => {
    document.title = `${m.terms.title} · ${m.appName}`
  }, [])

  return (
    <div className="min-h-svh bg-stone-50">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="text-2xl font-semibold text-stone-900">{m.terms.title}</h1>
        <p className="mt-2 text-stone-600">{m.terms.intro}</p>
        <h2 className="mt-8 text-lg font-semibold text-stone-900">{m.terms.noticeHeading}</h2>
        <p className="mt-3 text-base leading-relaxed text-stone-800">{m.legal.notice}</p>
      </main>
    </div>
  )
}
