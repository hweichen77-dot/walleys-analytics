import { subDays } from 'date-fns'
import { useAuthStore } from '../store/authStore'
import { refreshAccessToken } from './squareAuth'
import { fetchOrders, fetchCatalogue, fetchInventory } from './squareAPIClient'
import type { SquareOrder, SquareCatalogItem } from './squareAPIClient'
import { upsertTransactions, upsertCatalogueProducts } from '../db/dbUtils'
import type { SalesTransaction, CatalogueProduct } from '../types/models'
import { parseProductItems } from '../types/models'

export interface SyncStatus {
  phase: 'idle' | 'orders' | 'catalogue' | 'inventory' | 'done' | 'error'
  message: string
  ordersAdded: number
  productsAdded: number
}

function orderToTransaction(order: SquareOrder): Omit<SalesTransaction, 'id'> | null {
  const date = new Date(order.created_at)
  if (isNaN(date.getTime())) return null

  const amountCents = order.net_amounts?.total_money?.amount ?? order.total_money?.amount ?? 0
  const netSales = amountCents / 100

  const lineItems = order.line_items ?? []
  const description = lineItems
    .map(li => {
      const qty = parseInt(li.quantity, 10) || 1
      return `${qty} x ${li.name}`
    })
    .join(', ')

  const payment = order.tenders?.[0]?.type ?? 'UNKNOWN'

  return {
    transactionID: order.id,
    date,
    netSales,
    staffName: order.employee_id ?? '',
    paymentMethod: payment,
    itemDescription: description,
    dayOfWeek: date.getDay() + 1,
    hour: date.getHours(),
  }
}

function catalogueToProduct(item: SquareCatalogItem): Omit<CatalogueProduct, 'id'>[] {
  const data = item.item_data
  if (!data?.name) return []
  const name = data.name.trim()
  if (!name) return []

  const variations = data.variations ?? []
  const common = {
    category: '',
    taxable: data.is_taxable ?? false,
    enabled: !(data.is_archived ?? false),
    quantity: null as number | null,
    importedAt: new Date(),
  }

  if (variations.length === 0) {
    return [{ ...common, name, sku: '', price: null, squareItemID: item.id }]
  }

  // One product row per variation; squareItemID stores the variation ID for
  // direct inventory lookup (invMap is keyed by catalog_object_id = variation ID).
  return variations.map(variation => {
    const varData = variation.item_variation_data
    const priceCents = varData?.price_money?.amount
    const variantLabel = varData?.name
    // Only suffix name if there are multiple variants and the label isn't the
    // generic "Regular" placeholder Square inserts for single-variant items.
    const displayName =
      variations.length > 1 && variantLabel && variantLabel.toLowerCase() !== 'regular'
        ? `${name} – ${variantLabel}`
        : name
    return {
      ...common,
      name: displayName,
      sku: varData?.sku ?? '',
      price: priceCents != null ? priceCents / 100 : null,
      squareItemID: variation.id,
    }
  })
}

export async function runSquareSync(
  onStatus: (status: SyncStatus) => void,
): Promise<void> {
  // Refresh the access token if it is expired or expiring within 5 minutes.
  const { tokenExpiresAt } = useAuthStore.getState()
  if (tokenExpiresAt != null && tokenExpiresAt - Date.now() < 5 * 60 * 1000) {
    await refreshAccessToken()
  }

  const { accessToken, locationID, daysBack } = useAuthStore.getState()

  onStatus({ phase: 'orders', message: 'Fetching orders…', ordersAdded: 0, productsAdded: 0 })

  const endDate = new Date()
  const startDate = subDays(endDate, daysBack)
  const orders = await fetchOrders(accessToken, locationID, startDate, endDate)
  const txRows = orders.flatMap(o => {
    const tx = orderToTransaction(o)
    return tx ? [tx] : []
  })
  const ordersAdded = await upsertTransactions(txRows)

  onStatus({ phase: 'catalogue', message: 'Fetching catalogue…', ordersAdded, productsAdded: 0 })
  const catItems = await fetchCatalogue(accessToken)
  const products = catItems.flatMap(catalogueToProduct)
  await upsertCatalogueProducts(products)

  onStatus({ phase: 'inventory', message: 'Fetching inventory…', ordersAdded, productsAdded: products.length })
  const invCounts = await fetchInventory(accessToken, locationID)
  const invMap = new Map(invCounts.map(c => [c.catalog_object_id, parseInt(c.quantity, 10)]))

  // product.squareItemID now holds the Square variation ID, which is the same
  // key that invMap uses (catalog_object_id from the inventory counts endpoint).
  for (const product of products) {
    const qty = invMap.get(product.squareItemID)
    if (qty != null) product.quantity = qty
  }
  await upsertCatalogueProducts(products)

  useAuthStore.getState().setCredentials({
    lastSyncDate: new Date().toISOString(),
    lastSyncCount: ordersAdded,
  })

  onStatus({ phase: 'done', message: 'Sync complete', ordersAdded, productsAdded: products.length })
}

export { parseProductItems }
