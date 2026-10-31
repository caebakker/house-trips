import { useId, useMemo, useState, type KeyboardEvent } from 'react'
import { comuneLabel, type Comune } from '../lib/comuni/data'
import { searchComuni } from '../lib/comuni/search'
import { m } from '../i18n/t'
import { inputClass } from './ui'

type Props = {
  value: Comune | null
  onChange: (comune: Comune | null) => void
  error?: string | null
}

export function ComuneAutocomplete({ value, onChange, error }: Props) {
  const listId = useId()
  const inputId = 'comune'
  const [query, setQuery] = useState(value ? comuneLabel(value) : '')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const results = useMemo(() => (open ? searchComuni(query) : []), [open, query])
  const showList = open && query.trim().length >= 2

  function select(comune: Comune) {
    onChange(comune)
    setQuery(comuneLabel(comune))
    setOpen(false)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!showList) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((current) => Math.min(current + 1, Math.max(results.length - 1, 0)))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((current) => Math.max(current - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const chosen = results[active]
      if (chosen) select(chosen)
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="relative">
      <input
        id={inputId}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && results[active] ? `${listId}-${results[active].istat}` : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : `${inputId}-hint`}
        className={`${inputClass} ${value ? 'pr-28' : ''}`}
        placeholder={m.listingForm.comunePlaceholder}
        autoComplete="off"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
          setActive(0)
          if (value && event.target.value !== comuneLabel(value)) onChange(null)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {value && (
        <button
          type="button"
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded px-2 py-1 text-sm text-stone-500 hover:text-stone-900"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            onChange(null)
            setQuery('')
            setOpen(false)
          }}
        >
          {m.listingForm.clearComune}
        </button>
      )}
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-stone-200 bg-white shadow-lg"
        >
          {results.length === 0 ? (
            <li className="px-3 py-3 text-sm text-stone-500">{m.listingForm.noMatch}</li>
          ) : (
            results.map((comune, index) => (
              <li key={comune.istat} id={`${listId}-${comune.istat}`} role="option" aria-selected={index === active}>
                <button
                  type="button"
                  className={`flex w-full items-baseline justify-between gap-3 px-3 py-3 text-left text-base ${
                    index === active ? 'bg-amber-50' : 'bg-white'
                  }`}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => select(comune)}
                >
                  <span className="text-stone-900">
                    {comune.name}
                    {comune.nameAlt ? <span className="text-stone-500"> / {comune.nameAlt}</span> : null}
                  </span>
                  <span className="shrink-0 text-sm text-stone-500">
                    {comune.province} ({comune.provinceCode})
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
