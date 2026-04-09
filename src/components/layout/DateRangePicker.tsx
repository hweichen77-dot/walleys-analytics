import { useState } from 'react'
import { subDays, subMonths, startOfMonth, startOfDay, endOfMonth } from 'date-fns'
import { useDateRangeStore } from '../../store/dateRangeStore'
import type { DateRange } from '../../db/useTransactions'

interface Preset {
  label: string
  range: DateRange
}

function makePresets(): Preset[] {
  const now = new Date()
  return [
    { label: 'Today', range: { start: startOfDay(now), end: now } },
    { label: 'Last 7 days', range: { start: subDays(now, 7), end: now } },
    { label: 'Last 30 days', range: { start: subDays(now, 30), end: now } },
    { label: 'Last 90 days', range: { start: subDays(now, 90), end: now } },
    { label: 'This month', range: { start: startOfMonth(now), end: endOfMonth(now) } },
    { label: 'Last month', range: { start: startOfMonth(subMonths(now, 1)), end: endOfMonth(subMonths(now, 1)) } },
    { label: 'Last 6 months', range: { start: subMonths(now, 6), end: now } },
    { label: 'Last 12 months', range: { start: subMonths(now, 12), end: now } },
    { label: 'All time', range: { start: null, end: null } },
  ]
}

export function DateRangePicker() {
  const { range, setRange } = useDateRangeStore()
  const [open, setOpen] = useState(false)

  const presets = makePresets()
  const activePreset = presets.find(p =>
    p.range.start?.getTime() === range.start?.getTime() &&
    p.range.end?.getTime() === range.end?.getTime()
  ) ?? { label: 'Custom' }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50"
      >
        <span>📅</span>
        <span className="font-medium text-gray-700">{activePreset.label}</span>
        <span className="text-gray-400">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-44">
            {presets.map(p => (
              <button
                key={p.label}
                onClick={() => { setRange(p.range); setOpen(false) }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 text-gray-700"
              >
                {p.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
