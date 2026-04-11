import { useState, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import { importCSVTransactions, importXLSXCatalogue } from '../engine/importEngine'
import { clearAllData } from '../db/dbUtils'
import { useToastStore } from '../store/toastStore'
import { formatNumber } from '../utils/format'

export default function ImportView() {
  const { show } = useToastStore()
  const txCount = useLiveQuery(() => db.salesTransactions.count(), []) ?? 0
  const catCount = useLiveQuery(() => db.catalogueProducts.count(), []) ?? 0
  const [dragging, setDragging] = useState(false)
  const [importing, setImporting] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const csvRef = useRef<HTMLInputElement>(null)
  const xlsxRef = useRef<HTMLInputElement>(null)

  async function handleCSV(file: File) {
    setImporting(true)
    try {
      const result = await importCSVTransactions(file)
      if (result.errors.length > 0) {
        show(result.errors[0], 'error')
      } else if (result.added === 0) {
        show('No new transactions found (all already imported).', 'info')
      } else {
        const skippedNote = result.skipped > 0 ? ` · ${result.skipped} rows skipped (missing date)` : ''
        show(`Added ${result.added} of ${result.total} transactions${skippedNote}`, 'success')
      }
    } catch (e) {
      show(`CSV import failed: ${(e as Error).message}`, 'error')
    } finally {
      setImporting(false)
    }
  }

  async function handleXLSX(file: File) {
    setImporting(true)
    try {
      const result = await importXLSXCatalogue(file)
      if (result.errors.length > 0) {
        show(result.errors[0], 'error')
      } else {
        show(`Imported ${result.added} catalogue products`, 'success')
      }
    } catch (e) {
      show(`XLSX import failed: ${(e as Error).message}`, 'error')
    } finally {
      setImporting(false)
    }
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    if (file.name.endsWith('.csv')) handleCSV(file)
    else if (file.name.endsWith('.xlsx')) handleXLSX(file)
    else show('Unsupported file type. Use .csv or .xlsx', 'error')
  }

  async function handleClearAll() {
    try {
      await clearAllData()
      show('All data cleared', 'info')
    } catch (e) {
      show(`Clear failed: ${(e as Error).message}`, 'error')
    } finally {
      setConfirmClear(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Import Data</h1>
        <p className="text-sm text-slate-500 mt-1">
          {formatNumber(txCount)} transactions · {formatNumber(catCount)} catalogue products stored
        </p>
      </div>

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
          dragging ? 'border-teal-400 bg-teal-500/10' : 'border-slate-600 hover:border-teal-300 bg-slate-900'
        }`}
        onClick={() => csvRef.current?.click()}
      >
        <div className="w-12 h-12 rounded-xl bg-slate-700 border border-slate-600 flex items-center justify-center mx-auto mb-3">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
        </div>
        <p className="font-medium text-slate-200">Drop Square CSV here or click to browse</p>
        <p className="text-sm text-slate-500 mt-1">Accepts Square transaction export (.csv)</p>
        <input ref={csvRef} type="file" accept=".csv" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleCSV(f) }} />
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
        <h2 className="font-semibold text-slate-200 mb-3">Catalogue Import (XLSX)</h2>
        <p className="text-sm text-slate-500 mb-3">Import Square Item Library export to enable price tracking and catalogue checking.</p>
        <button
          onClick={() => xlsxRef.current?.click()}
          className="px-4 py-2 bg-teal-500 text-slate-950 rounded-lg text-sm font-medium hover:bg-teal-600 disabled:opacity-50"
          disabled={importing}
        >
          {importing ? 'Importing…' : 'Select XLSX file'}
        </button>
        <input ref={xlsxRef} type="file" accept=".xlsx" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleXLSX(f) }} />
      </div>

      {(txCount > 0 || catCount > 0) && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <h2 className="font-semibold text-red-300 mb-1">Clear All Data</h2>
          <p className="text-sm text-red-400 mb-3">Permanently deletes all transactions, catalogue products, and settings stored locally.</p>
          {confirmClear ? (
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-red-400">Are you sure? This cannot be undone.</span>
              <button
                onClick={handleClearAll}
                className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-700"
              >
                Yes, delete everything
              </button>
              <button
                onClick={() => setConfirmClear(false)}
                className="px-4 py-2 bg-slate-800 border border-slate-600 text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-700/50"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmClear(true)}
              className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-700"
            >
              Clear everything
            </button>
          )}
        </div>
      )}
    </div>
  )
}
