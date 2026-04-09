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
      show(`Added ${result.added} of ${result.total} transactions`, 'success')
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
      show(`Imported ${result.added} catalogue products`, 'success')
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
        <h1 className="text-2xl font-bold text-gray-900">Import Data</h1>
        <p className="text-sm text-gray-500 mt-1">
          {formatNumber(txCount)} transactions · {formatNumber(catCount)} catalogue products stored
        </p>
      </div>

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
          dragging ? 'border-indigo-400 bg-indigo-50' : 'border-gray-300 hover:border-indigo-300 bg-gray-50'
        }`}
        onClick={() => csvRef.current?.click()}
      >
        <p className="text-4xl mb-3">📄</p>
        <p className="font-medium text-gray-700">Drop Square CSV here or click to browse</p>
        <p className="text-sm text-gray-400 mt-1">Accepts Square transaction export (.csv)</p>
        <input ref={csvRef} type="file" accept=".csv" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleCSV(f) }} />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-semibold text-gray-800 mb-3">Catalogue Import (XLSX)</h2>
        <p className="text-sm text-gray-500 mb-3">Import Square Item Library export to enable price tracking and catalogue checking.</p>
        <button
          onClick={() => xlsxRef.current?.click()}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          disabled={importing}
        >
          {importing ? 'Importing…' : 'Select XLSX file'}
        </button>
        <input ref={xlsxRef} type="file" accept=".xlsx" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleXLSX(f) }} />
      </div>

      {(txCount > 0 || catCount > 0) && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <h2 className="font-semibold text-red-800 mb-1">Clear All Data</h2>
          <p className="text-sm text-red-600 mb-3">Permanently deletes all transactions, catalogue products, and settings stored locally.</p>
          {confirmClear ? (
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-red-700">Are you sure? This cannot be undone.</span>
              <button
                onClick={handleClearAll}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
              >
                Yes, delete everything
              </button>
              <button
                onClick={() => setConfirmClear(false)}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmClear(true)}
              className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
            >
              Clear everything
            </button>
          )}
        </div>
      )}
    </div>
  )
}
