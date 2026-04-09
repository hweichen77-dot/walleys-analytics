import { db } from './database'
import type { SalesTransaction, CatalogueProduct, ProductCostData } from '../types/models'

export async function upsertTransactions(transactions: Omit<SalesTransaction, 'id'>[]): Promise<number> {
  let added = 0
  await db.transaction('rw', db.salesTransactions, async () => {
    for (const tx of transactions) {
      const existing = await db.salesTransactions.where('transactionID').equals(tx.transactionID).first()
      if (!existing) {
        await db.salesTransactions.add(tx)
        added++
      }
    }
  })
  return added
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
    db.productCostData, db.storeEvents, db.productBundles, db.catalogueProducts],
    async () => {
      await Promise.all([
        db.salesTransactions.clear(),
        db.categoryOverrides.clear(),
        db.restockLogs.clear(),
        db.productCostData.clear(),
        db.storeEvents.clear(),
        db.productBundles.clear(),
        db.catalogueProducts.clear(),
      ])
    }
  )
}

export async function getTransactionCount(): Promise<number> {
  return db.salesTransactions.count()
}
