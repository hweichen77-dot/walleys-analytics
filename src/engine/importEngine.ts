import { parseCSVContent } from './csvParser'
import { parseXLSXCatalogue } from './xlsxParser'
import { upsertTransactions, upsertCatalogueProducts, upsertProductCosts } from '../db/dbUtils'

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
