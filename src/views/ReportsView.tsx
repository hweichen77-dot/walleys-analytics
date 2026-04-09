import { useState, useMemo, useCallback } from 'react'
import { format, subDays, parseISO, isValid } from 'date-fns'
import {
  AreaChart, Area,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { useAllTransactions, useOverridesMap } from '../db/useTransactions'
import { EmptyState } from '../components/ui/EmptyState'
import { StatCard } from '../components/ui/StatCard'
import { formatCurrency, formatNumber, formatPercent } from '../utils/format'
import {
  buildRevenueReport,
  buildTopProductsReport,
  buildCustomerBehaviorReport,
  buildTransactionLogReport,
  buildSeasonalReport,
  buildMonthlyDetailReport,
  buildCashReport,
  REPORT_META,
} from '../engine/reportEngine'
import type { ReportType, AnyReport } from '../engine/reportEngine'
import type { TimeGranularity } from '../engine/analyticsEngine'
import { exportToPDF, exportToCSV } from '../engine/pdfExport'
import { useNavigate } from 'react-router-dom'

// ─── Palette ──────────────────────────────────────────────────────────────────

const PIE_COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#f97316', '#84cc16']
const REPORT_TYPES: ReportType[] = ['revenue', 'top-products', 'customer-behavior', 'transaction-log', 'seasonal', 'monthly-detail', 'cash']

// ─── Small helpers ────────────────────────────────────────────────────────────

function ExportBar({ onPDF, onCSV, loading }: { onPDF: () => void; onCSV: () => void; loading: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onCSV}
        disabled={loading}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40"
      >
        ⬇ CSV
      </button>
      <button
        onClick={onPDF}
        disabled={loading}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40"
      >
        ⬇ PDF
      </button>
    </div>
  )
}

// ─── Report renderers ─────────────────────────────────────────────────────────

function RevenueReportView({ report }: { report: Extract<AnyReport, { type: 'revenue' }> }) {
  const chartData = report.timeSeries.map(d => ({
    date: format(d.date, report.granularity === 'Monthly' ? 'MMM yy' : report.granularity === 'Weekly' ? 'MMM d' : 'M/d'),
    revenue: Math.round(d.revenue * 100) / 100,
    transactions: d.transactionCount,
  }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Revenue"    value={formatCurrency(report.totalRevenue)} />
        <StatCard label="Transactions"     value={formatNumber(report.transactions)} />
        <StatCard label="Avg Transaction"  value={formatCurrency(report.avgTransaction)} />
        <StatCard label="Best Period"      value={report.topPeriod ? formatCurrency(report.topPeriod.revenue) : '—'} sub={report.topPeriod?.label} />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="font-semibold text-gray-800 mb-4">Revenue over Time</h3>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="rptRevGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} width={48} />
            <Tooltip formatter={(v: number) => [formatCurrency(v), 'Revenue']} />
            <Area type="monotone" dataKey="revenue" stroke="#6366f1" fill="url(#rptRevGrad)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">Period Breakdown</h3>
        </div>
        <div className="overflow-x-auto max-h-80">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Period</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">Revenue</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">Transactions</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">Avg Transaction</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {report.timeSeries.map((d, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-700">{format(d.date, report.granularity === 'Monthly' ? 'MMMM yyyy' : 'MMM d, yyyy')}</td>
                  <td className="px-4 py-2 text-right font-mono text-gray-800">{formatCurrency(d.revenue)}</td>
                  <td className="px-4 py-2 text-right text-gray-600">{formatNumber(d.transactionCount)}</td>
                  <td className="px-4 py-2 text-right font-mono text-gray-600">{formatCurrency(d.transactionCount > 0 ? d.revenue / d.transactionCount : 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function TopProductsReportView({ report }: { report: Extract<AnyReport, { type: 'top-products' }> }) {
  const [tab, setTab] = useState<'revenue' | 'units'>('revenue')
  const rows = tab === 'revenue' ? report.byRevenue : report.byUnits

  const chartData = rows.slice(0, 10).map(p => ({
    name: p.name.length > 20 ? p.name.slice(0, 19) + '…' : p.name,
    value: tab === 'revenue' ? p.totalRevenue : p.totalUnitsSold,
  }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total Revenue"    value={formatCurrency(report.totalRevenue)} />
        <StatCard label="Total Units Sold" value={formatNumber(report.totalUnits)} />
        <StatCard label="Unique Products"  value={formatNumber(report.byRevenue.length)} />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800">Top 10 Products</h3>
          <div className="flex gap-1">
            {(['revenue', 'units'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-2.5 py-1 text-xs rounded-lg font-medium ${tab === t ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                By {t === 'revenue' ? 'Revenue' : 'Units'}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={chartData.length * 30 + 20}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 80, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10 }}
              tickFormatter={v => tab === 'revenue' ? `$${(v / 1000).toFixed(0)}k` : String(v)} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={140} />
            <Tooltip formatter={(v: number) => tab === 'revenue' ? formatCurrency(v) : formatNumber(v)} />
            <Bar dataKey="value" fill="#6366f1" radius={[0, 3, 3, 0]}
              label={{ position: 'right', fontSize: 9, fill: '#6b7280',
                formatter: (v: number) => tab === 'revenue' ? formatCurrency(v) : formatNumber(v) }} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Full Rankings</h3>
          <div className="flex gap-1">
            {(['revenue', 'units'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-2.5 py-1 text-xs rounded-lg font-medium ${tab === t ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                By {t === 'revenue' ? 'Revenue' : 'Units'}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500">#</th>
                <th className="px-3 py-2 text-left   text-xs font-semibold text-gray-500">Product</th>
                <th className="px-3 py-2 text-left   text-xs font-semibold text-gray-500">Category</th>
                <th className="px-3 py-2 text-right  text-xs font-semibold text-gray-500">Revenue</th>
                <th className="px-3 py-2 text-right  text-xs font-semibold text-gray-500">Units</th>
                <th className="px-3 py-2 text-right  text-xs font-semibold text-gray-500">Avg Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((p, i) => (
                <tr key={p.name} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-center text-gray-400 text-xs">{i + 1}</td>
                  <td className="px-3 py-2 font-medium text-gray-900 max-w-xs truncate">{p.name}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{p.category || '—'}</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-700">{formatCurrency(p.totalRevenue)}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{formatNumber(p.totalUnitsSold)}</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-500">{formatCurrency(p.avgPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function CustomerBehaviorReportView({ report }: { report: Extract<AnyReport, { type: 'customer-behavior' }> }) {
  const pieData = report.paymentMethods.map(p => ({ name: p.method, value: p.count }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total Transactions" value={formatNumber(report.totalTransactions)} />
        <StatCard label="Total Revenue"      value={formatCurrency(report.totalRevenue)} />
        <StatCard label="Avg Transaction"    value={formatCurrency(report.avgTransactionValue)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Methods pie */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="font-semibold text-gray-800 mb-4">Payment Methods</h3>
          <div className="flex gap-4 items-center">
            <ResponsiveContainer width={170} height={170}>
              <PieChart>
                <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={48} outerRadius={78}>
                  {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => [formatNumber(v), 'Transactions']} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2 min-w-0">
              {report.paymentMethods.map((p, i) => (
                <div key={p.method} className="flex items-center gap-2 text-sm">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="flex-1 truncate text-gray-700">{p.method}</span>
                  <span className="text-gray-500 text-xs">{formatPercent(p.pct)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Day of week */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="font-semibold text-gray-800 mb-4">Busiest Days</h3>
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={report.peakDays} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={36} />
              <Tooltip formatter={(v: number) => [formatNumber(v), 'Transactions']} />
              <Bar dataKey="count" fill="#6366f1" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Peak hours */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="font-semibold text-gray-800 mb-4">Transactions by Hour</h3>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={report.peakHours} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={1} />
            <YAxis tick={{ fontSize: 11 }} width={36} />
            <Tooltip formatter={(v: number) => [formatNumber(v), 'Transactions']} />
            <Bar dataKey="count" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Payment method table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">Payment Method Detail</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-4 py-2 text-left   text-xs font-semibold text-gray-500">Method</th>
              <th className="px-4 py-2 text-right  text-xs font-semibold text-gray-500">Transactions</th>
              <th className="px-4 py-2 text-right  text-xs font-semibold text-gray-500">Share</th>
              <th className="px-4 py-2 text-right  text-xs font-semibold text-gray-500">Revenue</th>
              <th className="px-4 py-2 text-right  text-xs font-semibold text-gray-500">Avg Transaction</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {report.paymentMethods.map(p => (
              <tr key={p.method} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-medium text-gray-900">{p.method}</td>
                <td className="px-4 py-2 text-right text-gray-700">{formatNumber(p.count)}</td>
                <td className="px-4 py-2 text-right text-gray-500">{formatPercent(p.pct)}</td>
                <td className="px-4 py-2 text-right font-mono text-gray-700">{formatCurrency(p.revenue)}</td>
                <td className="px-4 py-2 text-right font-mono text-gray-600">
                  {formatCurrency(p.count > 0 ? p.revenue / p.count : 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TransactionLogReportView({ report }: { report: Extract<AnyReport, { type: 'transaction-log' }> }) {
  const [search, setSearch] = useState('')
  const [payFilter, setPayFilter] = useState('All')
  const [minAmount, setMinAmount] = useState('')

  const paymentMethods = useMemo(() => {
    const methods = Array.from(new Set(report.transactions.map(t => t.paymentMethod || 'Unknown')))
    return ['All', ...methods.sort()]
  }, [report.transactions])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const min = parseFloat(minAmount) || 0
    return report.transactions.filter(tx => {
      if (q && !tx.itemDescription.toLowerCase().includes(q) && !tx.staffName.toLowerCase().includes(q)) return false
      if (payFilter !== 'All' && (tx.paymentMethod || 'Unknown') !== payFilter) return false
      if (min > 0 && tx.netSales < min) return false
      return true
    })
  }, [report.transactions, search, payFilter, minAmount])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Transactions"    value={formatNumber(report.count)} sub={filtered.length !== report.count ? `${formatNumber(filtered.length)} shown` : undefined} />
        <StatCard label="Total Revenue"   value={formatCurrency(report.totalRevenue)} />
        <StatCard label="Avg Transaction" value={formatCurrency(report.count > 0 ? report.totalRevenue / report.count : 0)} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text" placeholder="Search items or staff…" value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
        <select value={payFilter} onChange={e => setPayFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
          {paymentMethods.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <input
          type="number" placeholder="Min amount $" value={minAmount}
          onChange={e => setMinAmount(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
        <span className="self-center text-sm text-gray-400 ml-auto">{formatNumber(filtered.length)} transactions</span>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto max-h-[28rem]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-2.5 text-left   text-xs font-semibold text-gray-500">Date & Time</th>
                <th className="px-4 py-2.5 text-left   text-xs font-semibold text-gray-500">Items</th>
                <th className="px-4 py-2.5 text-right  text-xs font-semibold text-gray-500">Amount</th>
                <th className="px-4 py-2.5 text-left   text-xs font-semibold text-gray-500">Payment</th>
                <th className="px-4 py-2.5 text-left   text-xs font-semibold text-gray-500">Staff</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.slice(0, 500).map((tx, i) => (
                <tr key={tx.transactionID ?? i} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-500 whitespace-nowrap text-xs">{format(tx.date, 'MMM d, yyyy h:mm a')}</td>
                  <td className="px-4 py-2 text-gray-800 max-w-xs truncate">{tx.itemDescription}</td>
                  <td className="px-4 py-2 text-right font-mono text-gray-800">{formatCurrency(tx.netSales)}</td>
                  <td className="px-4 py-2 text-gray-500 text-xs">{tx.paymentMethod || '—'}</td>
                  <td className="px-4 py-2 text-gray-500 text-xs">{tx.staffName || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 500 && (
            <p className="text-center text-xs text-gray-400 py-3">
              Showing first 500 of {formatNumber(filtered.length)} — export CSV for full list
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

const SEASON_COLORS: Record<string, string> = {
  Spring: '#10b981',
  Summer: '#f59e0b',
  Fall:   '#ef4444',
  Winter: '#6366f1',
}

function SeasonalReportView({ report }: { report: Extract<AnyReport, { type: 'seasonal' }> }) {
  const [activeSeason, setActiveSeason] = useState<string | null>(null)
  const chartData = report.monthly.map(m => ({
    month: format(parseISO(m.month + '-01'), 'MMM yy'),
    revenue: Math.round(m.revenue * 100) / 100,
  }))
  const avgMonthly = report.monthly.length > 0 ? report.totalRevenue / report.monthly.length : 0
  const selectedSeason = report.seasons.find(s => s.name === activeSeason) ?? null

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Revenue" value={formatCurrency(report.totalRevenue)} />
        <StatCard label="Best Season"   value={report.bestSeason ?? '—'} sub={report.seasons.find(s => s.name === report.bestSeason) ? formatCurrency(report.seasons.find(s => s.name === report.bestSeason)!.revenue) : undefined} />
        <StatCard label="Best Month"    value={report.bestMonth ? formatCurrency(report.bestMonth.revenue) : '—'} sub={report.bestMonth?.month} />
        <StatCard label="Monthly Avg"   value={formatCurrency(avgMonthly)} />
      </div>

      {/* Season cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {report.seasons.map(s => {
          const isActive = activeSeason === s.name
          return (
            <button
              key={s.name}
              onClick={() => setActiveSeason(isActive ? null : s.name)}
              className={`text-left p-4 rounded-xl border transition-all ${isActive ? 'ring-2 ring-offset-1' : 'hover:bg-gray-50'}`}
              style={{ borderColor: SEASON_COLORS[s.name], background: isActive ? `${SEASON_COLORS[s.name]}10` : undefined, ['--tw-ring-color' as any]: SEASON_COLORS[s.name] }}
            >
              <div className="text-2xl mb-1">{s.icon}</div>
              <p className="font-semibold text-gray-800 text-sm">{s.name}</p>
              <p className="font-mono text-gray-900 mt-1">{formatCurrency(s.revenue)}</p>
              <p className="text-xs text-gray-400 mt-0.5">{s.revenueShare.toFixed(1)}% of total · {formatNumber(s.transactions)} txns</p>
              {s.topProducts[0] && <p className="text-xs text-gray-500 mt-1 truncate">Top: {s.topProducts[0].name}</p>}
            </button>
          )
        })}
      </div>

      {/* Expanded season detail */}
      {selectedSeason && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <span className="text-xl">{selectedSeason.icon}</span>
            <h3 className="font-semibold text-gray-800">{selectedSeason.name} — Top Products</h3>
            <span className="text-xs text-gray-400 ml-auto">{selectedSeason.months.join(', ')}</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
            {/* Top products table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500">#</th>
                    <th className="px-4 py-2 text-left   text-xs font-semibold text-gray-500">Product</th>
                    <th className="px-4 py-2 text-right  text-xs font-semibold text-gray-500">Revenue</th>
                    <th className="px-4 py-2 text-right  text-xs font-semibold text-gray-500">Units</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {selectedSeason.topProducts.map((p, i) => (
                    <tr key={p.name} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-center text-gray-400 text-xs">{i + 1}</td>
                      <td className="px-4 py-2 font-medium text-gray-800 max-w-xs truncate">{p.name}</td>
                      <td className="px-4 py-2 text-right font-mono text-gray-700">{formatCurrency(p.totalRevenue)}</td>
                      <td className="px-4 py-2 text-right text-gray-600">{formatNumber(p.totalUnitsSold)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Month breakdown for this season */}
            <div className="p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Monthly Breakdown</p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={selectedSeason.monthBreakdown} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} width={44} />
                  <Tooltip formatter={(v: number) => [formatCurrency(v), 'Revenue']} />
                  <Bar dataKey="revenue" fill={SEASON_COLORS[selectedSeason.name]} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Monthly bar chart */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="font-semibold text-gray-800 mb-4">Monthly Revenue</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} width={48} />
            <Tooltip formatter={(v: number) => [formatCurrency(v), 'Revenue']} />
            <Bar dataKey="revenue" fill="#6366f1" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">Month-by-Month Breakdown</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-2 text-left  text-xs font-semibold text-gray-500">Month</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">Revenue</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">Transactions</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">Avg Transaction</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">vs Avg</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {report.monthly.map(m => {
                const diff = m.revenue - avgMonthly
                return (
                  <tr key={m.month} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-900">{format(parseISO(m.month + '-01'), 'MMMM yyyy')}</td>
                    <td className="px-4 py-2 text-right font-mono text-gray-800">{formatCurrency(m.revenue)}</td>
                    <td className="px-4 py-2 text-right text-gray-600">{formatNumber(m.transactions)}</td>
                    <td className="px-4 py-2 text-right font-mono text-gray-600">{formatCurrency(m.avgTransaction)}</td>
                    <td className={`px-4 py-2 text-right font-mono text-xs font-medium ${diff >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {diff >= 0 ? '+' : ''}{formatCurrency(diff)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildInventorySuggestions(row: Extract<AnyReport, { type: 'monthly-detail' }>['rows'][number], prevRow: Extract<AnyReport, { type: 'monthly-detail' }>['rows'][number] | null): string[] {
  const tips: string[] = []
  const nextMonth = format(parseISO(row.month + '-01'), 'MMMM')

  // Top sellers → stock more
  row.topProducts.slice(0, 3).forEach((p, i) => {
    const verb = i === 0 ? 'Prioritise reordering' : 'Stock up on'
    tips.push(`${verb} **${p.name}** — your #${i + 1} seller at ${formatCurrency(p.totalRevenue)} (${formatNumber(p.totalUnitsSold)} units). Ensure sufficient inventory going into ${nextMonth}.`)
  })

  // MoM growth advice
  if (row.momGrowth != null) {
    if (row.momGrowth > 15) {
      tips.push(`Revenue grew **+${row.momGrowth.toFixed(1)}%** vs last month — scale purchase orders proportionally for ${nextMonth} to avoid stockouts.`)
    } else if (row.momGrowth < -15) {
      tips.push(`Revenue fell **${row.momGrowth.toFixed(1)}%** vs last month — hold off on over-ordering; focus on your proven top sellers and avoid excess stock of slower items.`)
    }
  }

  // Slow movers (bottom products with revenue > 0)
  const slowMovers = row.topProducts.filter(p => p.totalUnitsSold <= 2 && p.totalRevenue > 0)
  if (slowMovers.length > 0) {
    tips.push(`**${slowMovers[0].name}** moved only ${slowMovers[0].totalUnitsSold} unit(s) this month — consider reducing order quantity or bundling it with a top seller.`)
  }

  // High avg transaction → upsell
  if (row.avgTransaction > 20) {
    tips.push(`Average transaction was ${formatCurrency(row.avgTransaction)} — customers are buying multiple items. Consider pre-packing combo bundles for ${nextMonth} to increase throughput.`)
  }

  // If prev month had a different top product
  if (prevRow && prevRow.topProduct && prevRow.topProduct !== row.topProduct) {
    tips.push(`Last month's top seller (**${prevRow.topProduct}**) was replaced by **${row.topProduct ?? '—'}** this month. Monitor both going into ${nextMonth} — seasonal rotation may be occurring.`)
  }

  return tips
}

function MonthlyDetailReportView({ report }: { report: Extract<AnyReport, { type: 'monthly-detail' }> }) {
  const [selectedMonth, setSelectedMonth] = useState<string>(report.rows[report.rows.length - 1]?.month ?? '')

  const chartData = report.rows.map(r => ({
    month: format(parseISO(r.month + '-01'), 'MMM yy'),
    revenue: Math.round(r.revenue * 100) / 100,
  }))

  const selectedRow = report.rows.find(r => r.month === selectedMonth) ?? null
  const selectedIdx = report.rows.findIndex(r => r.month === selectedMonth)
  const prevRow = selectedIdx > 0 ? report.rows[selectedIdx - 1] : null
  const suggestions = selectedRow ? buildInventorySuggestions(selectedRow, prevRow) : []

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Revenue"      value={formatCurrency(report.totalRevenue)} />
        <StatCard label="Total Transactions" value={formatNumber(report.totalTransactions)} />
        <StatCard label="Monthly Avg"        value={formatCurrency(report.avgMonthlyRevenue)} />
        <StatCard label="Best Month"         value={report.bestMonth ? formatCurrency(report.bestMonth.revenue) : '—'} sub={report.bestMonth?.label} />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="font-semibold text-gray-800 mb-4">Monthly Revenue</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} width={48} />
            <Tooltip formatter={(v: number) => [formatCurrency(v), 'Revenue']} />
            <Bar dataKey="revenue" fill="#6366f1" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Month selector + detail */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
          <h3 className="font-semibold text-gray-800">Monthly Deep Dive</h3>
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="ml-auto border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            {report.rows.map(r => (
              <option key={r.month} value={r.month}>{r.label}</option>
            ))}
          </select>
        </div>

        {selectedRow && (
          <div className="divide-y divide-gray-100">
            {/* Stats row */}
            <div className="grid grid-cols-4 divide-x divide-gray-100">
              {[
                { label: 'Revenue',      value: formatCurrency(selectedRow.revenue) },
                { label: 'Transactions', value: formatNumber(selectedRow.transactions) },
                { label: 'Avg Sale',     value: formatCurrency(selectedRow.avgTransaction) },
                { label: 'MoM Growth',   value: selectedRow.momGrowth == null ? '—' : `${selectedRow.momGrowth >= 0 ? '+' : ''}${selectedRow.momGrowth.toFixed(1)}%`, color: selectedRow.momGrowth == null ? undefined : selectedRow.momGrowth >= 0 ? 'text-green-600' : 'text-red-500' },
              ].map(item => (
                <div key={item.label} className="px-4 py-3 text-center">
                  <p className="text-xs text-gray-400 mb-1">{item.label}</p>
                  <p className={`font-semibold font-mono ${item.color ?? 'text-gray-900'}`}>{item.value}</p>
                </div>
              ))}
            </div>

            {/* Top products for this month */}
            {selectedRow.topProducts.length > 0 && (
              <div>
                <p className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-500 uppercase">Top Products This Month</p>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500">#</th>
                      <th className="px-4 py-2 text-left   text-xs font-semibold text-gray-500">Product</th>
                      <th className="px-4 py-2 text-right  text-xs font-semibold text-gray-500">Revenue</th>
                      <th className="px-4 py-2 text-right  text-xs font-semibold text-gray-500">Units</th>
                      <th className="px-4 py-2 text-right  text-xs font-semibold text-gray-500">Avg Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {selectedRow.topProducts.map((p, i) => (
                      <tr key={p.name} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-center text-gray-400 text-xs">{i + 1}</td>
                        <td className="px-4 py-2 font-medium text-gray-800 max-w-xs truncate">{p.name}</td>
                        <td className="px-4 py-2 text-right font-mono text-gray-700">{formatCurrency(p.totalRevenue)}</td>
                        <td className="px-4 py-2 text-right text-gray-600">{formatNumber(p.totalUnitsSold)}</td>
                        <td className="px-4 py-2 text-right font-mono text-gray-500">{formatCurrency(p.avgPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Inventory suggestions */}
      {suggestions.length > 0 && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5">
          <p className="text-sm font-semibold text-indigo-800 mb-3">
            Inventory Suggestions for {selectedRow ? format(parseISO(selectedRow.month + '-01'), 'MMMM') : 'Next Month'}
          </p>
          <ul className="space-y-2.5">
            {suggestions.map((tip, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-indigo-900">
                <span className="mt-0.5 shrink-0 text-indigo-400">→</span>
                <span dangerouslySetInnerHTML={{ __html: escapeHtml(tip).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Full table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">All Months</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-2 text-left  text-xs font-semibold text-gray-500">Month</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">Revenue</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">Transactions</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">Avg Transaction</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">MoM Growth</th>
                <th className="px-4 py-2 text-left  text-xs font-semibold text-gray-500">Top Product</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {report.rows.map(r => (
                <tr key={r.month} className={`hover:bg-gray-50 cursor-pointer ${r.month === selectedMonth ? 'bg-indigo-50' : ''}`}
                  onClick={() => setSelectedMonth(r.month)}>
                  <td className="px-4 py-2 font-medium text-gray-900">{r.label}</td>
                  <td className="px-4 py-2 text-right font-mono text-gray-800">{formatCurrency(r.revenue)}</td>
                  <td className="px-4 py-2 text-right text-gray-600">{formatNumber(r.transactions)}</td>
                  <td className="px-4 py-2 text-right font-mono text-gray-600">{formatCurrency(r.avgTransaction)}</td>
                  <td className={`px-4 py-2 text-right text-xs font-medium ${r.momGrowth == null ? 'text-gray-400' : r.momGrowth >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {r.momGrowth == null ? '—' : `${r.momGrowth >= 0 ? '+' : ''}${r.momGrowth.toFixed(1)}%`}
                  </td>
                  <td className="px-4 py-2 text-gray-500 text-xs max-w-xs truncate">{r.topProduct ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function CashReportView({ report }: { report: Extract<AnyReport, { type: 'cash' }> }) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return report.transactions
    return report.transactions.filter(tx =>
      tx.itemDescription.toLowerCase().includes(q) || tx.staffName.toLowerCase().includes(q)
    )
  }, [report.transactions, search])

  const dayChartData = report.byDayOfWeek.map(d => ({ day: d.label.slice(0, 3), count: d.cashCount, revenue: d.cashRevenue }))
  const hourChartData = report.byHour.filter(h => h.cashCount > 0).map(h => ({ hour: h.label, count: h.cashCount }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Cash Revenue"      value={formatCurrency(report.cashRevenue)} sub={`${report.cashRevenuePct.toFixed(1)}% of total`} />
        <StatCard label="Cash Transactions" value={formatNumber(report.cashTransactions)} sub={`${report.cashPct.toFixed(1)}% of total`} />
        <StatCard label="Avg Cash Sale"     value={formatCurrency(report.avgCashTransaction)} />
        <StatCard label="Total Revenue"     value={formatCurrency(report.totalRevenue)} sub={`${formatNumber(report.totalTransactions)} transactions`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="font-semibold text-gray-800 mb-4">Cash by Day of Week</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={dayChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={36} />
              <Tooltip formatter={(v: number) => [formatNumber(v), 'Cash Transactions']} />
              <Bar dataKey="count" fill="#6366f1" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="font-semibold text-gray-800 mb-4">Cash by Hour</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={hourChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="hour" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 11 }} width={36} />
              <Tooltip formatter={(v: number) => [formatNumber(v), 'Cash Transactions']} />
              <Bar dataKey="count" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Weekly cash totals */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">Weekly Cash Totals</h3>
        </div>
        <div className="overflow-x-auto max-h-72">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-2 text-left  text-xs font-semibold text-gray-500">Week</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">Cash Revenue</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">Cash Txns</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">Total Revenue</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">Cash %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {report.byWeek.map(w => (
                <tr key={w.weekStart} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-700 whitespace-nowrap">{w.weekLabel}</td>
                  <td className="px-4 py-2 text-right font-mono text-gray-800">{formatCurrency(w.cashRevenue)}</td>
                  <td className="px-4 py-2 text-right text-gray-600">{formatNumber(w.cashCount)}</td>
                  <td className="px-4 py-2 text-right font-mono text-gray-500">{formatCurrency(w.totalRevenue)}</td>
                  <td className="px-4 py-2 text-right text-xs text-gray-500">
                    {w.totalRevenue > 0 ? `${((w.cashRevenue / w.totalRevenue) * 100).toFixed(1)}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment breakdown */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">Payment Method Breakdown</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-4 py-2 text-left  text-xs font-semibold text-gray-500">Method</th>
              <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">Transactions</th>
              <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">Revenue</th>
              <th className="px-4 py-2 text-left  text-xs font-semibold text-gray-500">Type</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {report.paymentBreakdown.map(p => (
              <tr key={p.method} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-medium text-gray-900">{p.method}</td>
                <td className="px-4 py-2 text-right text-gray-600">{formatNumber(p.count)}</td>
                <td className="px-4 py-2 text-right font-mono text-gray-800">{formatCurrency(p.revenue)}</td>
                <td className="px-4 py-2">
                  {p.isCash
                    ? <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-medium">Cash</span>
                    : <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Card / Other</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cash transaction log */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Cash Transactions</h3>
          <input
            type="text" placeholder="Search…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
        <div className="overflow-x-auto max-h-[28rem]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-2.5 text-left  text-xs font-semibold text-gray-500">Date & Time</th>
                <th className="px-4 py-2.5 text-left  text-xs font-semibold text-gray-500">Items</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">Amount</th>
                <th className="px-4 py-2.5 text-left  text-xs font-semibold text-gray-500">Staff</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.slice(0, 500).map((tx, i) => (
                <tr key={tx.transactionID ?? i} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-500 whitespace-nowrap text-xs">{format(tx.date, 'MMM d, yyyy h:mm a')}</td>
                  <td className="px-4 py-2 text-gray-800 max-w-xs truncate">{tx.itemDescription}</td>
                  <td className="px-4 py-2 text-right font-mono text-gray-800">{formatCurrency(tx.netSales)}</td>
                  <td className="px-4 py-2 text-gray-500 text-xs">{tx.staffName || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 500 && (
            <p className="text-center text-xs text-gray-400 py-3">
              Showing first 500 of {formatNumber(filtered.length)} — export CSV for full list
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main view ────────────────────────────────────────────────────────────────

export default function ReportsView() {
  const navigate = useNavigate()
  const allTransactions = useAllTransactions()
  const overrides = useOverridesMap()

  const [selectedType, setSelectedType] = useState<ReportType>('revenue')
  const [startDate, setStartDate] = useState(() => format(subDays(new Date(), 90), 'yyyy-MM-dd'))
  const [endDate,   setEndDate]   = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [granularity, setGranularity] = useState<TimeGranularity>('Daily')
  const [topN, setTopN] = useState(20)
  const [report, setReport] = useState<AnyReport | null>(null)
  const [generating, setGenerating] = useState(false)

  const filtered = useMemo(() => {
    const start = startDate ? parseISO(startDate) : null
    const end   = endDate   ? new Date(parseISO(endDate).getTime() + 86_400_000 - 1) : null
    return allTransactions.filter(tx => {
      if (start && isValid(start) && tx.date < start) return false
      if (end   && isValid(end)   && tx.date > end)   return false
      return true
    })
  }, [allTransactions, startDate, endDate])

  const dateRangeLabel = useMemo(() => {
    try {
      return `${format(parseISO(startDate), 'MMM d, yyyy')} – ${format(parseISO(endDate), 'MMM d, yyyy')}`
    } catch {
      return `${startDate} – ${endDate}`
    }
  }, [startDate, endDate])

  const generate = useCallback(() => {
    if (filtered.length === 0) return
    setGenerating(true)
    setReport(null)
    // setTimeout lets React flush the loading state before the (sync) compute
    setTimeout(() => {
      try {
        let result: AnyReport
        if      (selectedType === 'revenue')           result = buildRevenueReport(filtered, granularity)
        else if (selectedType === 'top-products')      result = buildTopProductsReport(filtered, overrides, topN)
        else if (selectedType === 'customer-behavior') result = buildCustomerBehaviorReport(filtered)
        else if (selectedType === 'transaction-log')   result = buildTransactionLogReport(filtered)
        else if (selectedType === 'monthly-detail')    result = buildMonthlyDetailReport(filtered, overrides)
        else if (selectedType === 'cash')              result = buildCashReport(filtered)
        else                                           result = buildSeasonalReport(filtered, overrides)
        setReport(result)
      } finally {
        setGenerating(false)
      }
    }, 0)
  }, [filtered, selectedType, granularity, topN, overrides])

  if (allTransactions.length === 0) {
    return (
      <EmptyState
        title="No transaction data"
        subtitle="Import a CSV or sync via Square to generate reports."
        action={{ label: 'Go to Import', onClick: () => navigate('/import') }}
      />
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Reports</h1>

      {/* ── Report type picker ── */}
      <div className="grid grid-cols-4 gap-3">
        {REPORT_TYPES.map(type => {
          const meta = REPORT_META[type]
          const active = selectedType === type
          return (
            <button
              key={type}
              onClick={() => { setSelectedType(type); setReport(null) }}
              className={`text-left p-4 rounded-xl border transition-all ${
                active
                  ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-400'
                  : 'border-gray-200 bg-white hover:border-indigo-200 hover:bg-gray-50'
              }`}
            >
              <div className="text-2xl mb-1">{meta.icon}</div>
              <p className={`text-sm font-semibold leading-tight ${active ? 'text-indigo-700' : 'text-gray-800'}`}>
                {meta.label}
              </p>
              <p className="text-xs text-gray-400 mt-1 leading-snug line-clamp-2">{meta.description}</p>
            </button>
          )
        })}
      </div>

      {/* ── Config bar ── */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-end gap-4">
        {/* Date range */}
        <div className="flex items-center gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          <span className="text-gray-400 mt-5">–</span>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
        </div>

        {/* Granularity (revenue only) */}
        {selectedType === 'revenue' && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Granularity</label>
            <div className="flex gap-1">
              {(['Daily', 'Weekly', 'Monthly'] as TimeGranularity[]).map(g => (
                <button key={g} onClick={() => setGranularity(g)}
                  className={`px-3 py-2 text-xs rounded-lg font-medium border ${
                    granularity === g ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}>
                  {g}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Top N (top-products only) */}
        {selectedType === 'top-products' && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Show top</label>
            <select value={topN} onChange={e => setTopN(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
              {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n} products</option>)}
            </select>
          </div>
        )}

        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-gray-400">{formatNumber(filtered.length)} transactions in range</span>
          <button
            onClick={generate}
            disabled={generating || filtered.length === 0}
            className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
          >
            {generating && (
              <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            )}
            {generating ? 'Generating…' : 'Generate Report'}
          </button>
        </div>
      </div>

      {/* ── Loading ── */}
      {generating && (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-gray-200 border-t-indigo-500 rounded-full animate-spin" />
            <span className="text-sm">Building report…</span>
          </div>
        </div>
      )}

      {/* ── Report output ── */}
      {!generating && report && (
        <>
          {/* Export bar */}
          <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-gray-800">{REPORT_META[report.type].label}</p>
              <p className="text-xs text-gray-400">{dateRangeLabel}</p>
            </div>
            <ExportBar
              loading={false}
              onCSV={() => exportToCSV(report)}
              onPDF={() => exportToPDF(report, dateRangeLabel)}
            />
          </div>

          {/* Report content */}
          {report.type === 'revenue'           && <RevenueReportView          report={report} />}
          {report.type === 'top-products'      && <TopProductsReportView      report={report} />}
          {report.type === 'customer-behavior' && <CustomerBehaviorReportView report={report} />}
          {report.type === 'transaction-log'   && <TransactionLogReportView   report={report} />}
          {report.type === 'seasonal'          && <SeasonalReportView         report={report} />}
          {report.type === 'monthly-detail'    && <MonthlyDetailReportView    report={report} />}
          {report.type === 'cash'              && <CashReportView             report={report} />}
        </>
      )}

      {/* ── Empty prompt (no report generated yet) ── */}
      {!generating && !report && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📄</p>
          <p className="text-sm font-medium">Select a report type, set your date range, and click Generate.</p>
        </div>
      )}
    </div>
  )
}
