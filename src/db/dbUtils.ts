import { db } from './database'
import type { SalesTransaction, CatalogueProduct, ProductCostData, CategoryOverride, OpexEntry, RestockLog, StaffWage } from '../types/models'

export async function upsertStaffWage(staffName: string, hourlyWage: number): Promise<void> {
  const existing = await db.staffWages.where('staffName').equals(staffName).first()
  if (existing) {
    await db.staffWages.update(existing.id!, { hourlyWage })
  } else {
    await db.staffWages.add({ staffName, hourlyWage })
  }
}

export async function upsertTransactions(transactions: Omit<SalesTransaction, 'id'>[]): Promise<number> {
  if (transactions.length === 0) return 0
  const ids = transactions.map(t => t.transactionID)
  const existing = new Set(
    (await db.salesTransactions.where('transactionID').anyOf(ids).toArray()).map(t => t.transactionID)
  )
  const toAdd = transactions.filter(t => !existing.has(t.transactionID))
  if (toAdd.length > 0) await db.salesTransactions.bulkAdd(toAdd)
  return toAdd.length
}

export async function upsertCatalogueProducts(products: Omit<CatalogueProduct, 'id'>[]): Promise<void> {
  await db.transaction('rw', db.catalogueProducts, async () => {
    for (const p of products) {
      const existing = await db.catalogueProducts.where('name').equals(p.name).first()
      if (existing) {
        await db.catalogueProducts.update(existing.id!, p)
      } else {
        await db.catalogueProducts.add(p)
      }
    }
  })
}

export async function upsertProductCosts(costs: Omit<ProductCostData, 'id'>[]): Promise<void> {
  await db.transaction('rw', db.productCostData, async () => {
    for (const c of costs) {
      const existing = await db.productCostData.where('productName').equals(c.productName).first()
      if (existing) {
        await db.productCostData.update(existing.id!, c)
      } else {
        await db.productCostData.add(c)
      }
    }
  })
}

export async function clearAllData(): Promise<void> {
  await db.transaction('rw',
    [db.salesTransactions, db.categoryOverrides, db.restockLogs,
    db.productCostData, db.storeEvents, db.productBundles, db.catalogueProducts,
    db.opexEntries, db.staffWages],
    async () => {
      await Promise.all([
        db.salesTransactions.clear(),
        db.categoryOverrides.clear(),
        db.restockLogs.clear(),
        db.productCostData.clear(),
        db.storeEvents.clear(),
        db.productBundles.clear(),
        db.catalogueProducts.clear(),
        db.opexEntries.clear(),
        db.staffWages.clear(),
      ])
    }
  )
}

export async function exportAllData(): Promise<string> {
  const [transactions, catalogue, costData, overrides, opexEntries, restockLogs, storeEvents, productBundles, staffWages] = await Promise.all([
    db.salesTransactions.toArray(),
    db.catalogueProducts.toArray(),
    db.productCostData.toArray(),
    db.categoryOverrides.toArray(),
    db.opexEntries.toArray(),
    db.restockLogs.toArray(),
    db.storeEvents.toArray(),
    db.productBundles.toArray(),
    db.staffWages.toArray(),
  ])
  return JSON.stringify({
    version: 2,
    exportedAt: new Date().toISOString(),
    data: { transactions, catalogue, costData, overrides, opexEntries, restockLogs, storeEvents, productBundles, staffWages },
  })
}

export async function restoreAllData(json: string): Promise<{ transactions: number; catalogue: number }> {
  const backup = JSON.parse(json) as {
    version: number
    data: {
      transactions?: Record<string, unknown>[]
      catalogue?: Record<string, unknown>[]
      costData?: Record<string, unknown>[]
      overrides?: Record<string, unknown>[]
      opexEntries?: Record<string, unknown>[]
      restockLogs?: Record<string, unknown>[]
      storeEvents?: Record<string, unknown>[]
      productBundles?: Record<string, unknown>[]
      staffWages?: Record<string, unknown>[]
      // v1 used salesTransactions/catalogueProducts keys
      salesTransactions?: Record<string, unknown>[]
      catalogueProducts?: Record<string, unknown>[]
      productCostData?: Record<string, unknown>[]
      categoryOverrides?: Record<string, unknown>[]
    }
  }

  if (!backup?.data) throw new Error('Invalid backup file — missing data field.')

  const d = backup.data
  // Support both v1 and v2 key names
  const txRaw = d.transactions ?? d.salesTransactions ?? []
  const catRaw = d.catalogue ?? d.catalogueProducts ?? []
  const costRaw = d.costData ?? d.productCostData ?? []
  const overridesRaw = d.overrides ?? d.categoryOverrides ?? []

  await clearAllData()

  // Strip IDs and fix Date fields
  function stripId<T extends Record<string, unknown>>(rec: T): Omit<T, 'id'> {
    const { id: _id, ...rest } = rec
    return rest as Omit<T, 'id'>
  }

  // Use unknown cast to bridge generic Record types to typed Dexie tables
  if (txRaw.length) {
    await db.salesTransactions.bulkAdd(txRaw.map(r => ({
      ...stripId(r), date: new Date(r.date as string),
    })) as unknown as SalesTransaction[])
  }
  if (catRaw.length) {
    await db.catalogueProducts.bulkAdd(catRaw.map(r => ({
      ...stripId(r), importedAt: new Date(r.importedAt as string),
    })) as unknown as CatalogueProduct[])
  }
  if (costRaw.length) {
    await db.productCostData.bulkAdd(costRaw.map(r => ({
      ...stripId(r), lastUpdated: new Date(r.lastUpdated as string),
    })) as unknown as ProductCostData[])
  }
  if (overridesRaw.length) {
    await db.categoryOverrides.bulkAdd(overridesRaw.map(stripId) as unknown as CategoryOverride[])
  }
  if (d.opexEntries?.length) {
    await db.opexEntries.bulkAdd(d.opexEntries.map(stripId) as unknown as OpexEntry[])
  }
  if (d.restockLogs?.length) {
    await db.restockLogs.bulkAdd(d.restockLogs.map(r => ({
      ...stripId(r), date: new Date(r.date as string),
    })) as unknown as RestockLog[])
  }
  if (d.staffWages?.length) {
    await db.staffWages.bulkAdd(d.staffWages.map(stripId) as unknown as StaffWage[])
  }

  return { transactions: txRaw.length, catalogue: catRaw.length }
}

export async function getTransactionCount(): Promise<number> {
  return db.salesTransactions.count()
}
