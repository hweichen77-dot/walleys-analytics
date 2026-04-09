import { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { useAllTransactions } from '../db/useTransactions'
import { computeForecast } from '../engine/forecastEngine'
import { EmptyState } from '../components/ui/EmptyState'
import { formatCurrency } from '../utils/format'
import { format } from 'date-fns'
import { useNavigate } from 'react-router-dom'

function TrendBadge({ label }: { label: string }) {
  const up = label.startsWith('+')
  const down = label.startsWith('-') && !label.startsWith('-0')
  const base = 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium'
  const cls = up ? `${base} bg-green-100 text-green-700` :
               down ? `${base} bg-red-100 text-red-700` :
               `${base} bg-gray-100 text-gray-600`
  return <span className={cls}>{label}</span>
}

export default function ForecastView() {
  const transactions = useAllTransactions()
  const navigate = useNavigate()
  const forecast = useMemo(() => computeForecast(transactions), [transactions])

  if (transactions.length === 0) {
    return (
      <EmptyState
        title="No data to forecast"
        subtitle="Import transactions first to generate sales forecasts."
        action={{ label: 'Go to Import', onClick: () => navigate('/import') }}
      />
    )
  }

  if (!forecast.hasEnoughData) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Sales Forecast</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-800">
          <p className="font-semibold">Not enough history to forecast</p>
          <p className="mt-1">Need at least 2 complete weeks of data. You have {forecast.weeksOfHistory} week{forecast.weeksOfHistory === 1 ? '' : 's'}.</p>
        </div>
      </div>
    )
  }

  const { thisWeek, nextWeek, trendLabel } = forecast

  // Progress through this week
  const daysWithData = thisWeek.days.filter(d => d.actualRevenue !== null).length
  const progressPct = daysWithData > 0 ? Math.min(100, (thisWeek.actualTotal / thisWeek.projectedTotal) * 100) : 0
  const onTrack = thisWeek.projectedTotal > 0 && thisWeek.actualTotal >= (thisWeek.projectedTotal * (daysWithData / 7) * 0.9)

  // Chart data for this week
  const thisWeekData = thisWeek.days.map(d => ({
    label: d.dayLabel,
    actual: d.actualRevenue ?? undefined,
    projected: d.actualRevenue === null ? d.projectedRevenue : undefined,
    projectedOverlay: d.projectedRevenue,
  }))

  // Chart data for next week
  const nextWeekData = nextWeek.days.map(d => ({
    label: d.dayLabel,
    projected: d.projectedRevenue,
  }))

  const weekLabel = (ws: Date) => `Week of ${format(ws, 'MMM d')}`

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Sales Forecast</h1>
        <TrendBadge label={trendLabel} />
      </div>

      {/* On-track banner */}
      {daysWithData > 0 && (
        <div className={`rounded-xl border p-5 ${onTrack ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex items-start justify-between">
            <div>
              <p className={`text-sm font-semibold ${onTrack ? 'text-green-700' : 'text-amber-700'}`}>
                {onTrack ? 'On track this week' : 'Slightly behind this week'}
              </p>
              <p className={`text-xs mt-0.5 ${onTrack ? 'text-green-600' : 'text-amber-600'}`}>
                {formatCurrency(thisWeek.actualTotal)} actual · {formatCurrency(thisWeek.projectedTotal)} projected total
              </p>
            </div>
            <div className="text-right">
              <p className={`text-2xl font-bold ${onTrack ? 'text-green-700' : 'text-amber-700'}`}>
                {formatCurrency(thisWeek.projectedTotal)}
              </p>
              <p className="text-xs text-gray-500">projected this week</p>
            </div>
          </div>
          <div className="mt-3">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>{daysWithData} of 7 days in</span>
              <span>{progressPct.toFixed(0)}% of projected</span>
            </div>
            <div className="w-full bg-white rounded-full h-2 border border-gray-200">
              <div
                className={`h-2 rounded-full transition-all ${onTrack ? 'bg-green-500' : 'bg-amber-400'}`}
                style={{ width: `${Math.min(progressPct, 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* This week chart */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-semibold text-gray-800 mb-1">{weekLabel(thisWeek.weekStart)} — Current Week</h2>
        <p className="text-xs text-gray-400 mb-4">Solid bars = actual revenue. Striped bars = forecast for remaining days.</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={thisWeekData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} width={48} />
            <Tooltip formatter={(v: number) => formatCurrency(v)} />
            <Bar dataKey="actual" name="Actual" fill="#6366f1" radius={[3, 3, 0, 0]} />
            <Bar dataKey="projected" name="Forecast" fill="#c7d2fe" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Next week chart */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold text-gray-800">{weekLabel(nextWeek.weekStart)} — Forecast</h2>
          <span className="text-sm font-semibold text-indigo-600">{formatCurrency(nextWeek.projectedTotal)} projected</span>
        </div>
        <p className="text-xs text-gray-400 mb-4">Based on day-of-week averages from the last {Math.min(12, forecast.weeksOfHistory)} weeks.</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={nextWeekData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} width={48} />
            <Tooltip formatter={(v: number) => formatCurrency(v)} />
            <Bar dataKey="projected" name="Forecast" radius={[3, 3, 0, 0]}>
              {nextWeekData.map((_, i) => (
                <Cell key={i} fill="#a5b4fc" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="text-xs text-gray-400">
        Forecast uses day-of-week averages from up to 12 weeks of history, adjusted by a trend factor computed from the last 8 weeks.
        Based on {forecast.weeksOfHistory} complete week{forecast.weeksOfHistory === 1 ? '' : 's'} of data.
      </p>
    </div>
  )
}
