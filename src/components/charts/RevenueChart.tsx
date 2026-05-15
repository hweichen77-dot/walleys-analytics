import { useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { format } from 'date-fns'
import type { DailyRevenue, TimeGranularity } from '../../engine/analyticsEngine'

interface RevenueChartProps {
  daily: DailyRevenue[]
  weekly: DailyRevenue[]
  monthly: DailyRevenue[]
}

function shortCurrency(value: number): string {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`
  return `$${value.toFixed(0)}`
}

const GRANULARITIES: TimeGranularity[] = ['Daily', 'Weekly', 'Monthly']

export function RevenueChart({ daily, weekly, monthly }: RevenueChartProps) {
  const [granularity, setGranularity] = useState<TimeGranularity>('Daily')

  const data = granularity === 'Daily' ? daily : granularity === 'Weekly' ? weekly : monthly
  const fmt = granularity === 'Monthly' ? 'MMM yyyy' : 'MMM d'

  const chartData = data.map(d => ({
    date: format(d.date, fmt),
    revenue: Math.round(d.revenue * 100) / 100,
    transactions: d.transactionCount,
  }))

  return (
    <div className="bg-slate-800/30 border border-slate-700/40 p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-600 text-slate-200 text-sm tracking-tight">Revenue</h2>
        <div className="flex gap-0.5">
          {GRANULARITIES.map(g => (
            <button
              key={g}
              onClick={() => setGranularity(g)}
              className={`px-2.5 py-1 text-xs font-medium transition-colors duration-150 cursor-pointer ${
                granularity === g
                  ? 'bg-teal-500/15 text-teal-400'
                  : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/50'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="oklch(0.73 0.22 252)" stopOpacity={0.25} />
              <stop offset="95%" stopColor="oklch(0.73 0.22 252)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.23 0.006 55)" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'oklch(0.47 0.008 65)' }} interval="preserveStartEnd" axisLine={{ stroke: 'oklch(0.23 0.006 55)' }} tickLine={false} />
          <YAxis tickFormatter={shortCurrency} tick={{ fontSize: 11, fill: 'oklch(0.47 0.008 65)' }} width={48} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ background: 'oklch(0.17 0.007 55)', border: '1px solid oklch(0.26 0.006 55)', borderRadius: '4px', fontSize: '12px' }}
            labelStyle={{ color: 'oklch(0.61 0.009 65)' }}
            itemStyle={{ color: 'oklch(0.73 0.22 252)' }}
            formatter={(v: number) => [`$${v.toFixed(2)}`, 'Revenue']}
          />
          <Area type="monotone" dataKey="revenue" stroke="oklch(0.73 0.22 252)" fill="url(#revGradient)" strokeWidth={1.5} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
