import { useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { useFilteredTransactions } from '../db/useTransactions'
import { useDateRangeStore } from '../store/dateRangeStore'
import { computeStaffStats } from '../engine/analyticsEngine'
import { EmptyState } from '../components/ui/EmptyState'
import { formatCurrency, formatNumber } from '../utils/format'
import { format } from 'date-fns'

export default function StaffView() {
  const { range } = useDateRangeStore()
  const transactions = useFilteredTransactions(range)
  const [expandedStaff, setExpandedStaff] = useState<string | null>(null)

  const staffStats = useMemo(() => computeStaffStats(transactions), [transactions])
  const totalRevenue = useMemo(() => staffStats.reduce((s, x) => s + x.totalSales, 0), [staffStats])

  // Build per-staff transaction lists for the expanded view.
  const txByStaff = useMemo(() => {
    const map: Record<string, typeof transactions> = {}
    for (const tx of transactions) {
      const name = tx.staffName.trim() || 'Unknown'
      if (!map[name]) map[name] = []
      map[name].push(tx)
    }
    // Sort each list newest first.
    for (const name of Object.keys(map)) {
      map[name].sort((a, b) => b.date.getTime() - a.date.getTime())
    }
    return map
  }, [transactions])

  if (transactions.length === 0) {
    return <EmptyState title="No data" subtitle="Import CSV data to see staff performance." />
  }

  if (staffStats.length === 0) {
    return <EmptyState title="No staff data" subtitle="No staff names found in the imported transactions." />
  }

  const chartData = [...staffStats].reverse()

  function initials(name: string) {
    if (name === 'Unknown') return '?'
    return name.split(/\s+/).map(w => w[0]?.toUpperCase() ?? '').slice(0, 2).join('')
  }

  const AVATAR_COLORS = [
    'bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500',
    'bg-violet-500', 'bg-cyan-500', 'bg-pink-500', 'bg-teal-500',
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Staff Performance</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500">Staff Members</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{staffStats.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500">Total Revenue</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(totalRevenue)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500">Total Transactions</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatNumber(transactions.length)}</p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Revenue by Staff Member</h2>
        <ResponsiveContainer width="100%" height={Math.max(200, staffStats.length * 40)}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 60, left: 16, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
              tick={{ fontSize: 11 }}
            />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
            <Tooltip formatter={(v: number) => formatCurrency(v)} />
            <Bar dataKey="totalSales" radius={[0, 3, 3, 0]} label={{ position: 'right', formatter: (v: number) => `$${Math.round(v)}`, fontSize: 10, fill: '#6b7280' }}>
              {chartData.map((_, i) => (
                <Cell key={i} fill="#6366f1" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Staff breakdown with expandable transaction rows */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Staff Breakdown</h2>
          <p className="text-xs text-gray-400 mt-0.5">Click a row to see individual transactions</p>
        </div>
        <div className="divide-y divide-gray-50">
          {staffStats.map((staff, idx) => {
            const avg = staff.transactionCount > 0 ? staff.totalSales / staff.transactionCount : 0
            const share = totalRevenue > 0 ? (staff.totalSales / totalRevenue) * 100 : 0
            const isExpanded = expandedStaff === staff.name
            const avatarColor = AVATAR_COLORS[idx % AVATAR_COLORS.length]
            const staffTxs = txByStaff[staff.name] ?? []

            return (
              <div key={staff.name}>
                <button
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
                  onClick={() => setExpandedStaff(isExpanded ? null : staff.name)}
                >
                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-full ${avatarColor} flex items-center justify-center text-white text-sm font-bold shrink-0`}>
                    {initials(staff.name)}
                  </div>

                  {/* Name + share bar */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900 text-sm">{staff.name}</p>
                      {staff.name === 'Unknown' && (
                        <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full">no name in CSV</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full max-w-32">
                        <div
                          className={`h-1.5 rounded-full ${avatarColor}`}
                          style={{ width: `${share}%`, opacity: 0.7 }}
                        />
                      </div>
                      <span className="text-xs text-gray-400">{share.toFixed(1)}% of revenue</span>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="hidden sm:flex items-center gap-8 shrink-0">
                    <div className="text-right">
                      <p className="text-xs text-gray-400">Transactions</p>
                      <p className="font-mono font-semibold text-sm text-gray-900">{formatNumber(staff.transactionCount)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400">Total Sales</p>
                      <p className="font-mono font-semibold text-sm text-gray-900">{formatCurrency(staff.totalSales)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400">Avg Sale</p>
                      <p className="font-mono text-sm text-gray-700">{formatCurrency(avg)}</p>
                    </div>
                  </div>

                  {/* Expand chevron */}
                  <span className="text-gray-400 text-sm shrink-0">{isExpanded ? '▲' : '▼'}</span>
                </button>

                {/* Expanded transactions */}
                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50">
                    <div className="px-5 py-3">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        Recent Transactions — {staff.name}
                      </p>
                      {staffTxs.length === 0 ? (
                        <p className="text-xs text-gray-400">No transactions found.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-gray-200 text-left">
                                <th className="pb-2 font-semibold text-gray-500">Date</th>
                                <th className="pb-2 font-semibold text-gray-500">Staff</th>
                                <th className="pb-2 font-semibold text-gray-500">Items</th>
                                <th className="pb-2 font-semibold text-gray-500 text-right">Amount</th>
                                <th className="pb-2 font-semibold text-gray-500">Payment</th>
                              </tr>
                            </thead>
                            <tbody>
                              {staffTxs.slice(0, 20).map(tx => (
                                <tr key={tx.transactionID} className="border-b border-gray-100 hover:bg-white">
                                  <td className="py-1.5 font-mono text-gray-600">{format(tx.date, 'MMM d, yyyy h:mm a')}</td>
                                  <td className="py-1.5">
                                    <span className="font-semibold text-gray-800">{tx.staffName.trim() || 'Unknown'}</span>
                                  </td>
                                  <td className="py-1.5 text-gray-600 max-w-56 truncate">{tx.itemDescription || '—'}</td>
                                  <td className="py-1.5 font-mono font-semibold text-gray-900 text-right">{formatCurrency(tx.netSales)}</td>
                                  <td className="py-1.5 text-gray-500">{tx.paymentMethod || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {staffTxs.length > 20 && (
                            <p className="text-xs text-gray-400 mt-2">Showing 20 of {staffTxs.length} transactions.</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
