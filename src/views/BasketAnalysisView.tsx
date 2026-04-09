import { useMemo, useState } from 'react'
import { useAllTransactions } from '../db/useTransactions'
import { computeBasketAnalysis } from '../engine/basketEngine'
import type { BasketPair } from '../engine/basketEngine'
import { EmptyState } from '../components/ui/EmptyState'
import { formatPercent, formatNumber } from '../utils/format'
import { useNavigate } from 'react-router-dom'

type SortKey = 'coOccurrences' | 'lift' | 'confidence'

const SORT_OPTIONS: { key: SortKey; label: string; desc: string }[] = [
  { key: 'coOccurrences', label: 'Frequency', desc: 'How often bought together' },
  { key: 'lift', label: 'Lift', desc: 'Stronger-than-chance association' },
  { key: 'confidence', label: 'Confidence', desc: 'If buying A, % chance of buying B' },
]

function LiftBadge({ lift }: { lift: number }) {
  const cls =
    lift >= 3 ? 'bg-green-100 text-green-700' :
    lift >= 1.5 ? 'bg-blue-100 text-blue-700' :
    'bg-gray-100 text-gray-500'
  return (
    <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${cls}`}>
      {lift.toFixed(2)}x
    </span>
  )
}

function PairRow({ pair, rank }: { pair: BasketPair; rank: number }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50">
      <span className="text-xs text-gray-400 w-5 text-right shrink-0">{rank}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium text-gray-800 truncate max-w-[140px]" title={pair.itemA}>{pair.itemA}</span>
          <span className="text-xs text-gray-400">+</span>
          <span className="text-sm font-medium text-gray-800 truncate max-w-[140px]" title={pair.itemB}>{pair.itemB}</span>
        </div>
        <p className="text-xs text-gray-400 mt-0.5">
          {formatPercent(pair.confidence * 100, 0)} who buy {pair.itemA.split(' ')[0]}… also buy {pair.itemB.split(' ')[0]}…
        </p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div className="text-right">
          <p className="text-sm font-semibold text-gray-900">{formatNumber(pair.coOccurrences)}</p>
          <p className="text-xs text-gray-400">together</p>
        </div>
        <LiftBadge lift={pair.lift} />
      </div>
    </div>
  )
}

export default function BasketAnalysisView() {
  const transactions = useAllTransactions()
  const navigate = useNavigate()
  const [sortKey, setSortKey] = useState<SortKey>('coOccurrences')
  const [search, setSearch] = useState('')

  const result = useMemo(() => computeBasketAnalysis(transactions), [transactions])

  const sorted = useMemo(() => {
    return [...result.pairs].sort((a, b) => b[sortKey] - a[sortKey])
  }, [result.pairs, sortKey])

  const filtered = useMemo(() => {
    if (!search.trim()) return sorted
    const q = search.trim().toLowerCase()
    return sorted.filter(p => p.itemA.toLowerCase().includes(q) || p.itemB.toLowerCase().includes(q))
  }, [sorted, search])

  if (transactions.length === 0) {
    return (
      <EmptyState
        title="No data yet"
        subtitle="Import transactions to see basket analysis."
        action={{ label: 'Go to Import', onClick: () => navigate('/import') }}
      />
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Basket Analysis</h1>
        <p className="text-sm text-gray-500 mt-1">
          Items that are frequently purchased together — useful for upsell training and layout decisions.
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{formatNumber(result.totalTransactions)}</p>
          <p className="text-xs text-gray-500 mt-0.5">Total orders</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-indigo-600">{formatNumber(result.multiItemTransactions)}</p>
          <p className="text-xs text-gray-500 mt-0.5">Multi-item orders</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{formatNumber(result.pairs.length)}</p>
          <p className="text-xs text-gray-500 mt-0.5">Item pairs found</p>
        </div>
      </div>

      {result.pairs.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-500">
          {result.multiItemTransactions === 0
            ? 'No multi-item orders found. Basket analysis requires orders with 2+ items.'
            : 'No item pairs appear together enough times to show (min. 2 co-occurrences).'}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
            <input
              type="text"
              placeholder="Search item…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            <div className="flex gap-1">
              {SORT_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setSortKey(opt.key)}
                  title={opt.desc}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    sortKey === opt.key
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs text-gray-400 font-medium uppercase tracking-wide">
            <span className="w-5" />
            <span className="flex-1">Items</span>
            <span className="w-20 text-right">Together</span>
            <span className="w-14 text-right">Lift</span>
          </div>

          {filtered.length === 0
            ? <div className="p-8 text-center text-sm text-gray-400">No pairs match your search.</div>
            : filtered.slice(0, 100).map((pair, i) => (
                <PairRow key={i} pair={pair} rank={i + 1} />
              ))
          }

          {filtered.length > 100 && (
            <div className="px-4 py-3 text-xs text-gray-400 text-center border-t border-gray-100">
              Showing top 100 of {filtered.length} pairs
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-gray-400">
        Lift &gt; 1 means items are bought together more often than chance. Lift &gt; 3 is a strong association worth acting on.
        Confidence = "of all orders containing item A, {'{'}%{'}'} also contained item B."
      </p>
    </div>
  )
}
