import type { ReactNode } from 'react'

type Props = {
  label: string
  htmlFor: string
  hint?: string
  error?: string | null
  children: ReactNode
}

export function Field({ label, htmlFor, hint, error, children }: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-stone-800">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-sm text-red-700">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${htmlFor}-hint`} className="text-sm text-stone-500">
            {hint}
          </p>
        )
      )}
    </div>
  )
}
