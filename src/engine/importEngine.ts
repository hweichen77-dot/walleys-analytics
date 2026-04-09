import { parseCSVContent } from './csvParser'
import { parseXLSXCatalogue } from './xlsxParser'
import { upsertTransactions, upsertCatalogueProducts, upsertProductCosts } from '../db/dbUtils'

export interface ImportResult {
  added: number
  total: number
  errors: string[]
}

export async function importCSVTransactions(file: File): Promise<ImportResult> {
  const text = await file.text()
  const rows = parseCSVContent(text)
  if (rows.length === 0) {
    return { added: 0, total: 0, errors: ['No valid rows found in CSV.'] }
  }
  const added = await upsertTransactions(rows)
  return { added, total: rows.length, errors: [] }
}

export async function importXLSXCatalogue(file: File): Promise<ImportResult> {
  const buffer = await file.arrayBuffer()
  const { products, costs } = parseXLSXCatalogue(buffer)
  if (products.length === 0) {
    return { added: 0, total: 0, errors: ['No valid products found in XLSX.'] }
  }
  await upsertCatalogueProducts(products)
  if (costs.length > 0) {
    await upsertProductCosts(costs)
  }
  return { added: products.length, total: products.length, errors: [] }
}
