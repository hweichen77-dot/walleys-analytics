import { parseCSVContent } from './csvParser'
import { parseXLSXCatalogue } from './xlsxParser'
import { parseShopifyCSV, parseEtsyCSV } from './shopifyParser'
import { upsertTransactions, upsertCatalogueProducts, upsertProductCosts } from '../db/dbUtils'
import * as XLSX from 'xlsx'
import { format as fmtDate } from 'date-fns'
import { db } from '../db/database'
import type { OpexEntry, OpexCategory } from '../types/models'

export interface ImportResult {
  added: number
  total: number
  skipped: number
  errors: string[]
}

export async function importCSVTransactions(file: File): Promise<ImportResult> {
  const text = await file.text()
  const { transactions, skipped, schemaError } = parseCSVContent(text)
  if (schemaError) {
    return { added: 0, total: 0, skipped: 0, errors: [schemaError] }
  }
  if (transactions.length === 0) {
    return { added: 0, total: 0, skipped, errors: ['No valid rows found in CSV.'] }
  }
  const added = await upsertTransactions(transactions)
  return { added, total: transactions.length, skipped, errors: [] }
}

export async function importShopifyCSV(file: File): Promise<ImportResult> {
  const text = await file.text()
  const { transactions, skipped, schemaError } = parseShopifyCSV(text)
  if (schemaError) return { added: 0, total: 0, skipped: 0, errors: [schemaError] }
  if (transactions.length === 0) return { added: 0, total: 0, skipped, errors: ['No valid orders found in Shopify CSV.'] }
  const added = await upsertTransactions(transactions)
  return { added, total: transactions.length, skipped, errors: [] }
}

export async function importEtsyCSV(file: File): Promise<ImportResult> {
  const text = await file.text()
  const { transactions, skipped, schemaError } = parseEtsyCSV(text)
  if (schemaError) return { added: 0, total: 0, skipped: 0, errors: [schemaError] }
  if (transactions.length === 0) return { added: 0, total: 0, skipped, errors: ['No valid orders found in Etsy CSV.'] }
  const added = await upsertTransactions(transactions)
  return { added, total: transactions.length, skipped, errors: [] }
}

export async function importXLSXCatalogue(file: File): Promise<ImportResult> {
  const buffer = await file.arrayBuffer()
  const { products, costs } = parseXLSXCatalogue(buffer)
  if (products.length === 0) {
    return { added: 0, total: 0, skipped: 0, errors: ['No valid products found in XLSX. Is this a Square Item Library export?'] }
  }
  await upsertCatalogueProducts(products)
  if (costs.length > 0) {
    await upsertProductCosts(costs)
  }
  return { added: products.length, total: products.length, skipped: 0, errors: [] }
}

function detectOpexCategory(name: string): OpexCategory {
  const n = name.toLowerCase()
  if (/costco|amazon|supply|supplies|clean/.test(n)) return 'Misc'
  if (/handheld|equipment|shelf|shelv|storage|faucet/.test(n)) return 'Store Equipment'
  if (/logo|market|sign|print/.test(n)) return 'Marketing'
  return 'Other'
}

function excelSerialToYearMonth(serial: number): string {
  const date = new Date((serial - 25569) * 86400 * 1000)
  return fmtDate(date, 'yyyy-MM')
}

export async function importOpexXLSX(file: File): Promise<ImportResult> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    return { added: 0, total: 0, skipped: 0, errors: ['No sheets found in XLSX file.'] }
  }
  const sheet = workbook.Sheets[sheetName]
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as unknown[][]

  // Row 0 is header/summary — skip it. Parse right side cols 4, 5, 6
  const entries: OpexEntry[] = []
  let skipped = 0

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue
    const dateSerial = row[4]
    const amount = row[5]
    const rawName = row[6]

    if (typeof dateSerial !== 'number' || typeof amount !== 'number' || amount <= 0) {
      skipped++
      continue
    }

    const name = typeof rawName === 'string' ? rawName.trim() : String(rawName ?? '').trim()
    if (!name) { skipped++; continue }

    const month = excelSerialToYearMonth(dateSerial)
    const category = detectOpexCategory(name)

    entries.push({ name, category, amount, month, notes: '' })
  }

  if (entries.length === 0) {
    return { added: 0, total: 0, skipped, errors: [] }
  }

  // Fetch existing to avoid duplicates (same name + month + amount)
  const existing = await db.opexEntries.toArray()
  const existingSet = new Set(existing.map(e => `${e.name}|${e.month}|${e.amount}`))

  let added = 0
  for (const entry of entries) {
    const key = `${entry.name}|${entry.month}|${entry.amount}`
    if (!existingSet.has(key)) {
      await db.opexEntries.add(entry)
      existingSet.add(key)
      added++
    }
  }

  return { added, total: entries.length, skipped, errors: [] }
}
