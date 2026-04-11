import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import { EmptyState } from '../components/ui/EmptyState'
import { Badge } from '../components/ui/Badge'
import { formatCurrency } from '../utils/format'
import { exportCatalogueToXLSX } from '../engine/catalogueExporter'
import { useToastStore } from '../store/toastStore'
import type { CatalogueProduct } from '../types/models'

// ---------------------------------------------------------------------------
// Known categories for the dropdown (user can also type a custom value)
// ---------------------------------------------------------------------------
const KNOWN_CATEGORIES = [
  'Ramen',
  'Carbonated Drinks',
  'Snacks',
  'Candy',
  'Chips',
  'Prepared Food and Beverage',
  'Beverages',
  'Hot Food',
  'Cold Food',
  'Merchandise',
  'Other',
]

// ---------------------------------------------------------------------------
// Add / Edit item modal
// ---------------------------------------------------------------------------

interface ItemFormData {
  name: string
  variationName: string
  sku: string
  price: string
  category: string
  customCategory: string
  taxable: boolean
  quantity: string
  enabled: boolean
}

const EMPTY_FORM: ItemFormData = {
  name: '',
  variationName: '',
  sku: '',
  price: '',
  category: '',
  customCategory: '',
  taxable: false,
  quantity: '',
  enabled: true,
}

interface ItemModalProps {
  initial?: CatalogueProduct | null
  onClose: () => void
  onSave: (data: Omit<CatalogueProduct, 'id'>) => Promise<void>
}

function ItemModal({ initial, onClose, onSave }: ItemModalProps) {
  // Pre-populate from existing product if editing
  const initForm = (): ItemFormData => {
    if (!initial) return EMPTY_FORM
    const variationMatch = initial.name.match(/^(.+)\s+\((.+)\)$/)
    const isKnown = KNOWN_CATEGORIES.includes(initial.category ?? '')
    return {
      name: variationMatch ? variationMatch[1] : initial.name,
      variationName: variationMatch ? variationMatch[2] : '',
      sku: initial.sku ?? '',
      price: initial.price != null ? String(initial.price) : '',
      category: isKnown ? (initial.category ?? '') : '__custom__',
      customCategory: !isKnown ? (initial.category ?? '') : '',
      taxable: initial.taxable,
      quantity: initial.quantity != null ? String(initial.quantity) : '',
      enabled: initial.enabled,
    }
  }

  const [form, setForm] = useState<ItemFormData>(initForm)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof ItemFormData, string>>>({})

  function field(key: keyof ItemFormData) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [key]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }))
  }

  function validate(): boolean {
    const errs: typeof errors = {}
    if (!form.name.trim()) errs.name = 'Item name is required'
    if (form.name.includes(',')) errs.name = 'Name cannot contain a comma (Square CSV restriction)'
    if (form.price && isNaN(parseFloat(form.price))) errs.price = 'Must be a number'
    if (form.quantity && isNaN(parseInt(form.quantity, 10))) errs.quantity = 'Must be a whole number'
    if (parseInt(form.quantity, 10) < 0) errs.quantity = 'Quantity cannot be negative'
    if (form.category === '__custom__' && !form.customCategory.trim()) errs.customCategory = 'Enter a category name'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSave() {
    if (!validate()) return
    setSaving(true)
    const cat = form.category === '__custom__' ? form.customCategory.trim() : form.category
    const baseName = form.name.trim()
    const variation = form.variationName.trim()
    const fullName = variation ? `${baseName} (${variation})` : baseName

    await onSave({
      name: fullName,
      sku: form.sku.trim(),
      price: form.price ? parseFloat(form.price) : null,
      category: cat,
      taxable: form.taxable,
      enabled: form.enabled,
      quantity: form.quantity ? parseInt(form.quantity, 10) : null,
      importedAt: new Date(),
      squareItemID: initial?.squareItemID ?? '',
    })
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Modal header */}
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
          <h2 className="font-semibold text-slate-100">{initial ? 'Edit Item' : 'Add New Item'}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form body */}
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Item Name */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-slate-400 mb-1.5">Item Name <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={form.name}
                onChange={field('name')}
                placeholder="e.g. Shoyu Ramen"
                className="w-full bg-slate-700/60 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500/40"
              />
              {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name}</p>}
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Variation Name</label>
              <input
                type="text"
                value={form.variationName}
                onChange={field('variationName')}
                placeholder="e.g. Large (optional)"
                className="w-full bg-slate-700/60 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500/40"
              />
              <p className="text-[10px] text-slate-600 mt-1">Leave blank → defaults to "Regular"</p>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">SKU</label>
              <input
                type="text"
                value={form.sku}
                onChange={field('sku')}
                placeholder="e.g. SKU-001"
                className="w-full bg-slate-700/60 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500/40"
              />
            </div>
          </div>

          {/* Price + Quantity */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Price ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={field('price')}
                placeholder="e.g. 12.50"
                className="w-full bg-slate-700/60 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500/40"
              />
              {errors.price && <p className="text-xs text-red-400 mt-1">{errors.price}</p>}
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Stock Quantity</label>
              <input
                type="number"
                min="0"
                step="1"
                value={form.quantity}
                onChange={field('quantity')}
                placeholder="e.g. 50"
                className="w-full bg-slate-700/60 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500/40"
              />
              {errors.quantity && <p className="text-xs text-red-400 mt-1">{errors.quantity}</p>}
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Category</label>
            <select
              value={form.category}
              onChange={field('category')}
              className="w-full bg-slate-700/60 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/40"
            >
              <option value="">Select a category…</option>
              {KNOWN_CATEGORIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
              <option value="__custom__">Custom…</option>
            </select>
          </div>
          {form.category === '__custom__' && (
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Custom Category Name</label>
              <input
                type="text"
                value={form.customCategory}
                onChange={field('customCategory')}
                placeholder="Enter category name"
                className="w-full bg-slate-700/60 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500/40"
              />
              {errors.customCategory && <p className="text-xs text-red-400 mt-1">{errors.customCategory}</p>}
            </div>
          )}

          {/* Taxable + Enabled */}
          <div className="flex gap-6">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.taxable}
                onChange={field('taxable')}
                className="w-4 h-4 rounded accent-teal-500"
              />
              <span className="text-sm text-slate-300">Taxable</span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={field('enabled')}
                className="w-4 h-4 rounded accent-teal-500"
              />
              <span className="text-sm text-slate-300">Active (not archived)</span>
            </label>
          </div>

          {/* Tax hint */}
          <p className="text-xs text-slate-500 bg-slate-700/30 rounded-lg px-3 py-2 border border-slate-700">
            Tax rule: only <span className="text-teal-400">ramen</span> and{' '}
            <span className="text-teal-400">carbonated drinks</span> should be taxable.
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-700 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            {saving ? 'Saving…' : initial ? 'Save Changes' : 'Add Item'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export default function CatalogueProductsView() {
  const catalogue    = useLiveQuery(() => db.catalogueProducts.orderBy('name').toArray(), []) ?? []
  const showToast    = useToastStore(s => s.show)
  const [search, setSearch]             = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [showDisabled, setShowDisabled] = useState(false)
  const [showModal, setShowModal]       = useState(false)
  const [editTarget, setEditTarget]     = useState<CatalogueProduct | null>(null)
  const [exporting, setExporting]       = useState(false)

  const categories = useMemo(() => {
    const cats = Array.from(new Set(catalogue.map(c => c.category).filter(Boolean)))
    return ['All', ...cats.sort()]
  }, [catalogue])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return catalogue.filter(c => {
      if (!showDisabled && !c.enabled) return false
      if (categoryFilter !== 'All' && c.category !== categoryFilter) return false
      if (q && !c.name.toLowerCase().includes(q) && !c.sku.toLowerCase().includes(q)) return false
      return true
    })
  }, [catalogue, search, categoryFilter, showDisabled])

  const enabledCount  = catalogue.filter(c => c.enabled).length
  const disabledCount = catalogue.filter(c => !c.enabled).length

  // -- Add / Edit ---------------------------------------------------------------

  async function handleSave(data: Omit<CatalogueProduct, 'id'>) {
    if (editTarget?.id) {
      await db.catalogueProducts.update(editTarget.id, data)
      showToast(`Updated "${data.name}"`, 'success')
    } else {
      await db.catalogueProducts.add(data)
      showToast(`Added "${data.name}" to catalogue`, 'success')
    }
  }

  function openAdd() {
    setEditTarget(null)
    setShowModal(true)
  }

  function openEdit(product: CatalogueProduct) {
    setEditTarget(product)
    setShowModal(true)
  }

  // -- Export -------------------------------------------------------------------

  function handleExport() {
    if (catalogue.length === 0) {
      showToast('No catalogue items to export.', 'error')
      return
    }
    setExporting(true)
    try {
      exportCatalogueToXLSX(catalogue)
      showToast(`Exported ${catalogue.length} items as Square XLSX`, 'success')
    } catch {
      showToast('Export failed — check console.', 'error')
    } finally {
      setExporting(false)
    }
  }

  // -- Empty state --------------------------------------------------------------

  if (catalogue.length === 0) {
    return (
      <>
        <div className="flex justify-end mb-4">
          <button
            onClick={openAdd}
            className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium transition-colors flex items-center gap-2"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            Add Item
          </button>
        </div>
        <EmptyState
          title="No catalogue products"
          subtitle="Import a Square catalogue XLSX, sync via Square, or add items manually."
        />
        {showModal && (
          <ItemModal onClose={() => setShowModal(false)} onSave={handleSave} />
        )}
      </>
    )
  }

  // -- Main render --------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Catalogue Products</h1>
          <p className="text-sm text-slate-500 mt-1">
            {enabledCount} enabled · {disabledCount} archived · {catalogue.length} total
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 text-sm font-medium transition-colors flex items-center gap-2 border border-slate-600"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
            {exporting ? 'Exporting…' : 'Export to Square'}
          </button>
          <button
            onClick={openAdd}
            className="px-3 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium transition-colors flex items-center gap-2"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            Add Item
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search name or SKU…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-slate-600 rounded-lg px-3 py-2 bg-slate-700/50 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
        />
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="border border-slate-600 rounded-lg px-3 py-2 bg-slate-700/50 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
        >
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showDisabled}
            onChange={e => setShowDisabled(e.target.checked)}
            className="rounded"
          />
          Show archived
        </label>
        <span className="ml-auto text-sm text-slate-500 self-center">{filtered.length} products</span>
      </div>

      {/* Table */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-slate-500 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">SKU</th>
                <th className="px-4 py-3 text-left">Category</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3 text-right">Stock</th>
                <th className="px-4 py-3 text-center">Taxable</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Edit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/40">
              {filtered.map(product => (
                <tr
                  key={product.id ?? product.name}
                  className={`hover:bg-slate-700/50 ${!product.enabled ? 'opacity-50' : ''}`}
                >
                  <td className="px-4 py-3 font-medium text-slate-100">{product.name}</td>
                  <td className="px-4 py-3 text-slate-500 font-mono text-xs">{product.sku || '—'}</td>
                  <td className="px-4 py-3">
                    {product.category ? (
                      <Badge variant="secondary">{product.category}</Badge>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-300">
                    {product.price != null ? formatCurrency(product.price) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-300">
                    {product.quantity != null ? product.quantity : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {product.taxable ? (
                      <span className="text-emerald-400 font-medium text-xs">Yes</span>
                    ) : (
                      <span className="text-slate-500 text-xs">No</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      product.enabled
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-slate-800 text-slate-500'
                    }`}>
                      {product.enabled ? 'Active' : 'Archived'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => openEdit(product)}
                      className="text-xs px-2.5 py-1 rounded-md text-slate-400 hover:text-teal-400 hover:bg-slate-700 border border-slate-600 hover:border-teal-500/40 transition-colors"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="text-center py-10 text-slate-500 text-sm">No products match your filters.</div>
        )}
      </div>

      {/* Export hint */}
      <p className="text-xs text-slate-600 text-right">
        "Export to Square" downloads a .xlsx file you can import directly at Square Dashboard → Items → Actions → Import Library.
      </p>

      {/* Modal */}
      {showModal && (
        <ItemModal
          initial={editTarget}
          onClose={() => { setShowModal(false); setEditTarget(null) }}
          onSave={handleSave}
        />
      )}
    </div>
  )
}
