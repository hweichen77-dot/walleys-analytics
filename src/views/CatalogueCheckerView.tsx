import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import { useFilteredTransactions, useOverridesMap } from '../db/useTransactions'
import { useDateRangeStore } from '../store/dateRangeStore'
import { computeProductStats } from '../engine/analyticsEngine'
import { auditCatalogue, type AuditIssue, type AuditSeverity } from '../engine/catalogueAuditEngine'
import { EmptyState } from '../components/ui/EmptyState'
import { useToastStore } from '../store/toastStore'

// ---------------------------------------------------------------------------
// Severity styles
// ---------------------------------------------------------------------------

const SEV_STYLES: Record<AuditSeverity, { badge: string; row: string; dot: string }> = {
  error:   { badge: 'bg-red-500/15 text-red-400 border border-red-500/30',     row: 'hover:bg-slate-700/50', dot: 'bg-red-400' },
  warning: { badge: 'bg-amber-500/15 text-amber-400 border border-amber-500/30', row: 'hover:bg-slate-700/50', dot: 'bg-amber-400' },
  info:    { badge: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',   row: 'hover:bg-slate-700/50', dot: 'bg-blue-400' },
}

const SEV_LABEL: Record<AuditSeverity, string> = {
  error: 'Error',
  warning: 'Warning',
  info: 'Info',
}

// ---------------------------------------------------------------------------
// Auto-fix helpers
// ---------------------------------------------------------------------------

async function applyFix(issue: AuditIssue): Promise<void> {
  if (!issue.productId) return
  switch (issue.fixType) {
    case 'set_taxable_true':
      await db.catalogueProducts.update(issue.productId, { taxable: true })
      break
    case 'set_taxable_false':
      await db.catalogueProducts.update(issue.productId, { taxable: false })
      break
    case 'set_quantity_zero':
      await db.catalogueProducts.update(issue.productId, { quantity: 0 })
      break
    case 'set_category':
      await db.catalogueProducts.update(issue.productId, { category: issue.fixValue as string })
      break
  }
}

// ---------------------------------------------------------------------------
// Severity filter tabs
// ---------------------------------------------------------------------------

type Filter = 'all' | AuditSeverity

export default function CatalogueCheckerView() {
  const { range } = useDateRangeStore()
  const transactions = useFilteredTransactions(range)
  const overrides    = useOverridesMap()
  const catalogue    = useLiveQuery(() => db.catalogueProducts.toArray(), []) ?? []
  const showToast    = useToastStore(s => s.show)

  const [filter, setFilter] = useState<Filter>('all')
  const [fixing, setFixing] = useState(false)

  // ---------------------------------------------------------------------------
  // Build audit result
  // ---------------------------------------------------------------------------

  const { issues, errorCount, warningCount, infoCount } = useMemo(() => {
    const stats     = computeProductStats(transactions, overrides)
    const salesNames = new Set(stats.map(s => s.name))
    const avgPrices  = new Map(stats.map(s => [s.name, s.avgPrice]))
    return auditCatalogue(catalogue, salesNames, avgPrices)
  }, [transactions, overrides, catalogue])

  // ---------------------------------------------------------------------------
  // Filtered view
  // ---------------------------------------------------------------------------

  const visible = useMemo(
    () => filter === 'all' ? issues : issues.filter(i => i.severity === filter),
    [issues, filter],
  )

  const autoFixable = issues.filter(i => i.fixType && i.productId)

  // ---------------------------------------------------------------------------
  // Fix all
  // ---------------------------------------------------------------------------

  async function fixAll() {
    setFixing(true)
    let fixed = 0
    for (const issue of autoFixable) {
      try {
        await applyFix(issue)
        fixed++
      } catch {
        // skip
      }
    }
    setFixing(false)
    showToast(`Fixed ${fixed} issue${fixed !== 1 ? 's' : ''} automatically.`, 'success')
  }

  async function fixOne(issue: AuditIssue) {
    try {
      await applyFix(issue)
      showToast(`Fixed: ${issue.issue} on "${issue.productName}"`, 'success')
    } catch {
      showToast('Fix failed — check console.', 'error')
    }
  }

  // ---------------------------------------------------------------------------
  // Empty / no-catalogue states
  // ---------------------------------------------------------------------------

  if (catalogue.length === 0) {
    return (
      <EmptyState
        title="No catalogue loaded"
        subtitle="Import a Square catalogue XLSX or sync via Square to run the audit."
      />
    )
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Catalogue Checker</h1>
          <p className="text-sm text-slate-500 mt-1">
            Audits your catalogue for Square import errors, tax violations, and data quality issues.
          </p>
        </div>
        {autoFixable.length > 0 && (
          <button
            onClick={fixAll}
            disabled={fixing}
            className="shrink-0 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            {fixing ? 'Fixing…' : `Fix All Auto-Fixable (${autoFixable.length})`}
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard
          label="Errors"
          count={errorCount}
          active={filter === 'error'}
          onClick={() => setFilter(filter === 'error' ? 'all' : 'error')}
          color="text-red-400"
          bg="bg-red-500/10 border-red-500/30"
        />
        <SummaryCard
          label="Warnings"
          count={warningCount}
          active={filter === 'warning'}
          onClick={() => setFilter(filter === 'warning' ? 'all' : 'warning')}
          color="text-amber-400"
          bg="bg-amber-500/10 border-amber-500/30"
        />
        <SummaryCard
          label="Info"
          count={infoCount}
          active={filter === 'info'}
          onClick={() => setFilter(filter === 'info' ? 'all' : 'info')}
          color="text-blue-400"
          bg="bg-blue-500/10 border-blue-500/30"
        />
        <SummaryCard
          label="Total"
          count={issues.length}
          active={filter === 'all'}
          onClick={() => setFilter('all')}
          color="text-slate-300"
          bg="bg-slate-700/50 border-slate-600/30"
        />
      </div>

      {/* Tax rules callout */}
      <div className="bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-400">
        <span className="text-slate-200 font-medium">Tax rules for this store: </span>
        Only <span className="text-teal-400">ramen</span> and{' '}
        <span className="text-teal-400">carbonated drinks</span> should be taxed.
        All other items must be non-taxable.
      </div>

      {/* All-clear */}
      {issues.length === 0 && (
        <div className="text-center py-16 text-slate-500">
          <p className="text-4xl mb-3">✅</p>
          <p className="font-semibold text-slate-300 text-lg">Catalogue looks clean!</p>
          <p className="text-sm mt-1">No errors, warnings, or issues found.</p>
        </div>
      )}

      {/* Issue table */}
      {visible.length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
            <h2 className="font-semibold text-slate-200 text-sm">
              {filter === 'all' ? 'All Issues' : `${SEV_LABEL[filter]}s`}
              <span className="ml-2 text-slate-500 font-normal">({visible.length})</span>
            </h2>
            {filter !== 'all' && (
              <button
                onClick={() => setFilter('all')}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                Show all
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-slate-500 uppercase text-xs">
                <tr>
                  <th className="px-4 py-2.5 text-left w-4"></th>
                  <th className="px-4 py-2.5 text-left">Product</th>
                  <th className="px-4 py-2.5 text-left">Issue</th>
                  <th className="px-4 py-2.5 text-left">Detail</th>
                  <th className="px-4 py-2.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/40">
                {visible.map(issue => {
                  const styles = SEV_STYLES[issue.severity]
                  const canFix = !!(issue.fixType && issue.productId)
                  return (
                    <tr key={issue.id} className={styles.row}>
                      <td className="px-4 py-2.5">
                        <span className={`inline-block w-2 h-2 rounded-full ${styles.dot}`} />
                      </td>
                      <td className="px-4 py-2.5 font-medium text-slate-100 max-w-[180px] truncate" title={issue.productName}>
                        {issue.productName}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles.badge}`}>
                          {issue.issue}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-400 text-xs max-w-xs">
                        {issue.detail}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {canFix ? (
                          <button
                            onClick={() => fixOne(issue)}
                            className="text-xs px-2.5 py-1 rounded-md bg-teal-600/20 text-teal-400 hover:bg-teal-600/40 border border-teal-500/30 transition-colors whitespace-nowrap"
                          >
                            Auto-fix
                          </button>
                        ) : (
                          <span className="text-xs text-slate-600">Manual</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* No matches for current filter */}
      {visible.length === 0 && issues.length > 0 && (
        <div className="text-center py-10 text-slate-500 text-sm">
          No {SEV_LABEL[filter as AuditSeverity]?.toLowerCase()}s found.{' '}
          <button onClick={() => setFilter('all')} className="text-teal-400 hover:underline">Show all issues</button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Summary card component
// ---------------------------------------------------------------------------

function SummaryCard({
  label, count, active, onClick, color, bg,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
  color: string
  bg: string
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border p-4 text-left transition-all cursor-pointer ${bg} ${
        active ? 'ring-2 ring-teal-500/50' : 'hover:brightness-110'
      }`}
    >
      <p className={`text-3xl font-bold ${color}`}>{count}</p>
      <p className="text-xs text-slate-400 mt-1 font-medium">{label}</p>
    </button>
  )
}
