import Papa from 'papaparse'
import type { SalesTransaction } from '../types/models'

function parseDateTime(value: string): Date | null {
  if (!value) return null
  const iso = new Date(value)
  if (!isNaN(iso.getTime())) return iso
  const match = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (match) {
    const [, m, d, y, h, min, sec] = match
    return new Date(+y, +m - 1, +d, +h, +min, +(sec ?? 0))
  }
  return null
}

function parseCurrency(value: string): number {
  if (!value) return 0
  const cleaned = value.replace(/[$,]/g, '').trim()
  return parseFloat(cleaned) || 0
}

function generateFallbackID(row: Record<string, string>, index: number): string {
  return `import-${index}-${Object.values(row).join('-').slice(0, 40)}`
}

/**
 * Returns true if the value looks like a random alphanumeric reference/token
 * (e.g. "A3KX9P2QM") rather than a human-readable card brand name.
 * Cash transactions in Square exports have a reference code in the card column
 * instead of a brand name like "Visa" or "American Express".
 */
function looksLikeCashRef(value: string): boolean {
  const v = value.trim()
  if (!v) return false
  // Must contain both letters and digits, no spaces, min length 4
  const hasLetters = /[A-Za-z]/.test(v)
  const hasDigits  = /[0-9]/.test(v)
  const noSpaces   = !/\s/.test(v)
  return hasLetters && hasDigits && noSpaces && v.length >= 4
}

const KNOWN_CARD_BRANDS = /visa|mastercard|master\s*card|amex|american express|discover|jcb|diners|unionpay|eftpos|paywave|eftpos|interac/i

export function parseCSVContent(content: string): Omit<SalesTransaction, 'id'>[] {
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: h => h.trim(),
  })

  const rows = result.data
  const transactions: Omit<SalesTransaction, 'id'>[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]

    const dateStr = row['Date'] ?? row['Transaction Date'] ?? row['Created At'] ?? ''
    const netSalesStr = row['Net Sales'] ?? row['Net Amount'] ?? row['Total'] ?? row['Amount'] ?? ''
    const staff = row['Employee'] ?? row['Staff'] ?? row['Cashier'] ?? row['Team Member'] ?? row['Served By'] ?? row['Sales Person'] ?? row['Salesperson'] ?? row['Associate'] ?? row['Operator'] ?? ''
    const description = row['Item Name'] ?? row['Description'] ?? row['Items'] ?? row['Line Items'] ?? ''
    const txID = row['Transaction ID'] ?? row['Payment ID'] ?? row['Order ID'] ?? ''

    // Detect payment method.
    // The card-brand column (e.g. "Card Brand", "Card", "Payment Method") contains either:
    //   - A readable card name like "Visa", "American Express", "Citi" → card payment
    //   - A random alphanumeric reference like "A3KX9P2QM" → cash transaction
    const cardBrandVal = (
      row['Card Brand'] ?? row['Card Type'] ?? row['Card'] ?? ''
    ).trim()

    let payment: string
    if (cardBrandVal) {
      if (KNOWN_CARD_BRANDS.test(cardBrandVal)) {
        // Explicit card brand name → use it directly
        payment = cardBrandVal
      } else if (looksLikeCashRef(cardBrandVal)) {
        // Random reference code in the card column → cash
        payment = 'Cash'
      } else {
        // Plain word(s) with no digits → treat as card brand label
        payment = cardBrandVal
      }
    } else {
      // No card brand column; fall back to explicit payment method columns
      payment = row['Payment Method']?.trim() ?? row['Tender Type']?.trim() ?? row['Payment Type']?.trim() ?? ''
    }

    const date = parseDateTime(dateStr)
    if (!date) continue

    const netSales = parseCurrency(netSalesStr)

    transactions.push({
      transactionID: txID || generateFallbackID(row, i),
      date,
      netSales,
      staffName: staff.trim(),
      paymentMethod: payment.trim(),
      itemDescription: description.trim(),
      dayOfWeek: date.getDay() + 1,
      hour: date.getHours(),
    })
  }

  return transactions
}
