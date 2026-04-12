/**
 * catalogueExporter.ts
 *
 * Generates a Square-compatible XLSX item library file from the local catalogue.
 * The output follows Square's import template format exactly so it can be
 * dragged directly into Square Dashboard → Items → Actions → Import Library.
 *
 * Column reference (Square item library template, single-location):
 *   Token | Item Name | Variation Name | SKU | Description | GTIN
 *   Categories | Reporting Category | Tax - Sales (X%) | Enabled [Location]
 *   Current Quantity [Location] | New Quantity [Location]
 *   Default Unit Cost | Archived
 *
 * Rules:
 *  - Token: keep squareItemID if present (tells Square to UPDATE existing item),
 *    leave blank for brand-new items (Square will create them).
 *  - Tax column header must include the % value: "Tax - Sales (9%)"
 *  - Archived: Y for disabled items, N/blank for active ones.
 *  - Y/N used for boolean fields.
 */

import * as XLSX from 'xlsx'
import type { CatalogueProduct } from '../types/models'

export interface ExportOptions {
  locationName?: string   // defaults to "Walley's"
  taxName?: string        // defaults to "Sales"
  taxPercent?: number     // defaults to 9
}

function bool(v: boolean): string {
  return v ? 'Y' : 'N'
}

export function exportCatalogueToXLSX(
  products: CatalogueProduct[],
  options: ExportOptions = {},
): void {
  const location   = options.locationName ?? "Walley's"
  const taxName    = options.taxName ?? 'Sales'
  const taxPct     = options.taxPercent ?? 9
  const taxHeader  = `Tax - ${taxName} (${taxPct}%)`
  const enabledCol = `Enabled [${location}]`
  const curQtyCol  = `Current Quantity [${location}]`
  const newQtyCol  = `New Quantity [${location}]`

  // -- Headers ------------------------------------------------------------------
  const headers = [
    'Token',
    'Item Name',
    'Variation Name',
    'SKU',
    'Description',
    'GTIN',
    'Categories',
    'Reporting Category',
    taxHeader,
    enabledCol,
    curQtyCol,
    newQtyCol,
    'Default Unit Cost',
    'Archived',
  ]

  // -- Rows ---------------------------------------------------------------------
  // Square format: each item variation is one row.
  // We store items as flat CatalogueProduct entries (already variation-expanded
  // from the parser), so each product → one row.
  const rows: (string | number)[][] = products.map(p => {
    return [
      p.squareItemID ?? '',                 // Token
      p.itemName || p.name,                 // Item Name
      p.variationName || 'Regular',         // Variation Name
      p.sku ?? '',                          // SKU
      '',                                   // Description (not stored locally)
      '',                                   // GTIN
      p.category ?? '',                     // Categories
      p.category ?? '',                     // Reporting Category (same as category)
      bool(p.taxable),                      // Tax column
      bool(p.enabled),                      // Enabled
      p.quantity ?? '',                     // Current Quantity
      p.quantity ?? '',                     // New Quantity (same — Square uses this to SET stock)
      '',                                   // Default Unit Cost
      bool(!p.enabled),                     // Archived
    ]
  })

  // -- Build workbook -----------------------------------------------------------
  const worksheetData = [headers, ...rows]
  const ws = XLSX.utils.aoa_to_sheet(worksheetData)

  // Column widths for readability
  ws['!cols'] = [
    { wch: 28 }, // Token
    { wch: 32 }, // Item Name
    { wch: 16 }, // Variation Name
    { wch: 16 }, // SKU
    { wch: 24 }, // Description
    { wch: 14 }, // GTIN
    { wch: 28 }, // Categories
    { wch: 28 }, // Reporting Category
    { wch: 18 }, // Tax
    { wch: 16 }, // Enabled
    { wch: 20 }, // Current Qty
    { wch: 18 }, // New Qty
    { wch: 18 }, // Unit Cost
    { wch: 10 }, // Archived
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Item Library')

  // -- Trigger download ---------------------------------------------------------
  const today = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `walleys-catalogue-${today}.xlsx`)
}
