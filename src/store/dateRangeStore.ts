import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DateRange } from '../db/useTransactions'

interface DateRangeStore {
  range: DateRange
  setRange: (range: DateRange) => void
}

export const useDateRangeStore = create<DateRangeStore>()(
  persist(
    set => ({
      range: { start: null, end: null },
      setRange: range => set({ range }),
    }),
    {
      name: 'walleys-date-range',
      storage: {
        getItem: (key) => {
          const str = localStorage.getItem(key)
          if (!str) return null
          const parsed = JSON.parse(str)
          const range = parsed?.state?.range
          if (range) {
            parsed.state.range = {
              start: range.start ? new Date(range.start) : null,
              end: range.end ? new Date(range.end) : null,
            }
          }
          return parsed
        },
        setItem: (key, value) => localStorage.setItem(key, JSON.stringify(value)),
        removeItem: (key) => localStorage.removeItem(key),
      },
    }
  )
)
