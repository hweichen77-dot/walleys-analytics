import { useMemo, useState } from 'react'
import { useAllTransactions, useCatalogueProducts, useStoreEvents } from '../db/useTransactions'
import { generatePurchaseOrder } from '../engine/purchaseOrderEngine'
import { EmptyState } from '../components/ui/EmptyState'
import { formatCurrency } from '../utils/format'
import type { PurchaseOrderItem } from '../engine/purchaseOrderEngine'
import { utils, writeFile } from 'xlsx'
import { format } from 'date-fns'

const CATEGORY_COLORS: Record<string, string> = {
  Food: 'bg-orange-100 text-orange-700',
  Drinks: 'bg-blue-100 text-blue-700',
  'Ice Cream': 'bg-green-100 text-green-700',
  'Ramen/Hot Food': 'bg-red-100 text-red-700',
  Merch: 'bg-gray-100 text-gray-600',
  Other: 'bg-gray-100 text-gray-600',
}

function categoryClass(cat: string) {
  return CATEGORY_COLORS[cat] ?? 'bg-gray-100 text-gray-600'
}

function seasonLabel(month: number) {
  if (month >= 8 && month <= 9) return 'Back to School'
  if (month >= 10 && month <= 11) return 'Fall'
  if (month === 12) return 'Winter Holiday'
  if (month >= 1 && month <= 2) return 'Winter'
  if (month === 3) return 'Spring'
  if (month >= 4 && month <= 5) return 'Spring/Events'
  return 'Summer'
}

function exportToXLSX(items: PurchaseOrderItem[], qtyOverrides: Record<string, number>) {
  const rows = items.map(item => {
    const qty = qtyOverrides[item.productName] ?? item.recommendedQty
    const estTotal = item.avgPrice * qty
    return {
      Product: item.productName,
      Category: item.category,
      'Weekly Velocity': item.avgDailyVelocity.toFixed(2),
      'Recommended Qty': qty,
      'Avg Price': item.avgPrice.toFixed(2),
      'Est. Revenue': estTotal.toFixed(2),
      Reasoning: item.reasoning,
    }
  })
  const ws = utils.json_to_sheet(rows)
  const wb = utils.book_new()
  utils.book_append_sheet(wb, ws, 'Purchase Order')
  writeFile(wb, `PurchaseOrder-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
}

export default function PurchaseOrderView() {
  const transactions = useAllTransactions()
  const catalogueProducts = useCatalogueProducts()
  const events = useStoreEvents()
  const [weeksAhead, setWeeksAhead] = useState(2)
  const [onlyNeedingReorder, setOnlyNeedingReorder] = useState(false)
  const [qtyOverrides, setQtyOverrides] = useState<Record<string, number>>({})
  const [sortKey, setSortKey] = useState<'productName' | 'avgDailyVelocity' | 'recommendedQty' | 'estimatedRevenue'>('estimatedRevenue')
  const [sortDesc, setSortDesc] = useState(true)

  const overrides = useMemo(() => ({}), [])

  const orderItems = useMemo(
    () => generatePurchaseOrder(transactions, events, [], overrides, weeksAhead),
    [transactions, events, overrides, weeksAhead],
  )

  const displayItems = useMemo(() => {
    let items = orderItems.map(item => {
      const qty = qtyOverrides[item.productName] ?? item.recommendedQty
      return { ...item, recommendedQty: qty, estimatedRevenue: item.avgPrice * qty }
    })
    if (onlyNeedingReorder) {
      const catQty = Object.fromEntries(catalogueProducts.filter(p => p.quantity !== null).map(p => [p.name, p.quantity!]))
      items = items.filter(item => {
        const stock = catQty[item.productName]
        return stock === undefined || item.recommendedQty > stock
      })
    }
    return [...items].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === 'string' && typeof bv === 'string') return sortDesc ? bv.localeCompare(av) : av.localeCompare(bv)
      return sortDesc ? (bv as number) - (av as number) : (av as number) - (bv as number)
    })
  }, [orderItems, qtyOverrides, onlyNeedingReorder, catalogueProducts, sortKey, sortDesc])

  const totalItemCount = useMemo(
    () => displayItems.reduce((s, i) => s + i.recommendedQty, 0),
    [displayItems],
  )

  const totalEstimatedRevenue = useMemo(
    () => displayItems.reduce((s, i) => s + i.avgPrice * i.recommendedQty, 0),
    [displayItems],
  )

  const categorySubtotals = useMemo(() => {
    const g: Record<string, { qty: number; rev: number }> = {}
    for (const item of displayItems) {
      if (!g[item.category]) g[item.category] = { qty: 0, rev: 0 }
      g[item.category].qty += item.recommendedQty
      g[item.category].rev += item.avgPrice * item.recommendedQty
    }
    return Object.entries(g).sort(([a], [b]) => a.localeCompare(b))
  }, [displayItems])

  const upcomingEvents = useMemo(() => {
    const now = new Date()
    const twoWeeks = new Date(now.getTime() + 14 * 86_400_000)
    return events.filter(e =>
      (e.startDate >= now && e.startDate <= twoWeeks) ||
      (e.endDate >= now && e.endDate <= twoWeeks) ||
      (e.startDate <= now && e.endDate >= now),
    )
  }, [events])

  const currentMonth = new Date().getMonth() + 1
  const dateRangeLabel = `${format(new Date(), 'MMM d')} – ${format(new Date(Date.now() + weeksAhead * 7 * 86_400_000), 'MMM d, yyyy')}`

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDesc(d => !d)
    else { setSortKey(key); setSortDesc(true) }
  }

  if (transactions.length === 0) {
    return <EmptyState title="No transaction data" subtitle="Import your sales data to generate purchase recommendations." />
  }

  const sortArrow = (key: typeof sortKey) => sortKey === key ? (sortDesc ? ' ↓' : ' ↑') : ''

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Purchase Order</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Weeks:</span>
            <button onClick={() => setWeeksAhead(w => Math.max(1, w - 1))} className="w-7 h-7 rounded border border-gray-200 flex items-center justify-center text-sm hover:bg-gray-50">−</button>
            <span className="text-sm font-semibold w-4 text-center">{weeksAhead}</span>
            <button onClick={() => setWeeksAhead(w => Math.min(4, w + 1))} className="w-7 h-7 rounded border border-gray-200 flex items-center justify-center text-sm hover:bg-gray-50">+</button>
          </div>
          <button
            onClick={() => exportToXLSX(displayItems, qtyOverrides)}
            disabled={displayItems.length === 0}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            Export XLSX
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-xl">🛒</div>
          <div>
            <p className="text-xs text-gray-500">Items to Order</p>
            <p className="text-xl font-bold text-gray-900">{displayItems.length} products</p>
            <p className="text-xs text-gray-400">{totalItemCount} total units</p>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center text-xl">💵</div>
          <div>
            <p className="text-xs text-gray-500">Estimated Revenue</p>
            <p className="text-xl font-bold text-gray-900">{formatCurrency(totalEstimatedRevenue)}</p>
            <p className="text-xs text-gray-400">at avg sell price</p>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center text-xl">📅</div>
          <div>
            <p className="text-xs text-gray-500">Generated For</p>
            <p className="text-xl font-bold text-gray-900">{weeksAhead}-Week Window</p>
            <p className="text-xs text-gray-400">{dateRangeLabel}</p>
          </div>
        </div>
      </div>

      <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
        <span className="text-lg">🌿</span>
        <div className="flex-1">
          <p className="font-semibold text-sm text-gray-800">Upcoming Season: {seasonLabel(currentMonth)}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Recommendations account for seasonal demand patterns and upcoming events.
          </p>
        </div>
        {upcomingEvents.length > 0 && (
          <span className="text-xs font-semibold bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
            ⭐ {upcomingEvents.length} upcoming event{upcomingEvents.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={onlyNeedingReorder}
            onChange={e => setOnlyNeedingReorder(e.target.checked)}
            className="rounded"
          />
          Only show items needing reorder
        </label>
        <p className="text-xs text-gray-400">{displayItems.length} of {orderItems.length} items</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-500 cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => toggleSort('productName')}>Product{sortArrow('productName')}</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-500 cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => toggleSort('avgDailyVelocity')}>Wkly Velocity{sortArrow('avgDailyVelocity')}</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-500 cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => toggleSort('recommendedQty')}>Rec. Qty{sortArrow('recommendedQty')}</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-500 cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => toggleSort('estimatedRevenue')}>Est. Revenue{sortArrow('estimatedRevenue')}</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-500">Trend</th>
              </tr>
            </thead>
            <tbody>
              {displayItems.map(item => {
                const qty = qtyOverrides[item.productName] ?? item.recommendedQty
                return (
                  <tr key={item.productName} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-gray-900">{item.productName}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${categoryClass(item.category)}`}>
                          {item.category}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-gray-700">
                      {(item.avgDailyVelocity * 7).toFixed(1)} / wk
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <input
                        type="number"
                        className="border border-gray-200 rounded px-2 py-0.5 text-xs w-16 text-right font-mono"
                        value={qty}
                        onChange={e => {
                          const v = parseInt(e.target.value, 10)
                          if (!isNaN(v) && v >= 0) {
                            setQtyOverrides(prev => ({ ...prev, [item.productName]: v }))
                          }
                        }}
                        min={0}
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-gray-900">
                      {formatCurrency(item.avgPrice * qty)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        item.reasoning.includes('Growing') || item.reasoning.includes('boost')
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {item.reasoning.includes('boost') ? '↑ Event Boost' : 'Stable'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {categorySubtotals.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Category Subtotals</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {categorySubtotals.map(([cat, { qty, rev }]) => (
              <div key={cat} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <div>
                  <p className="font-semibold text-sm text-gray-900">{cat}</p>
                  <p className="text-xs text-gray-400">{qty} units</p>
                </div>
                <p className="font-mono text-sm text-gray-700">{formatCurrency(rev)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
