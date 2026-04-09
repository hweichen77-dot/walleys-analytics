import { differenceInDays } from 'date-fns'
import type { SalesTransaction, StoreEvent, RestockLog } from '../types/models'
import { computeProductStats, productVelocity } from './analyticsEngine'

export interface PurchaseOrderItem {
  productName: string
  category: string
  avgDailyVelocity: number
  recommendedQty: number
  estimatedRevenue: number
  avgPrice: number
  lastSoldDate: Date
  reasoning: string
}

export function generatePurchaseOrder(
  transactions: SalesTransaction[],
  events: StoreEvent[],
  _restockLogs: RestockLog[],
  overrides: Record<string, string> = {},
  weeksAhead = 2,
): PurchaseOrderItem[] {
  const reorderDays = weeksAhead * 7
  const stats = computeProductStats(transactions, overrides)
  const today = new Date()
  const items: PurchaseOrderItem[] = []

  const upcomingEvents = events.filter(e => {
    const daysUntil = differenceInDays(e.startDate, today)
    return daysUntil >= 0 && daysUntil <= 30
  })

  for (const product of stats) {
    const velocity = productVelocity(product)
    if (velocity <= 0) continue

    let multiplier = 1.0

    if (upcomingEvents.length > 0) {
      const isHighDemandEvent = upcomingEvents.some(e =>
        ['Spirit Week', 'Homecoming', 'Back to School', 'Sports Game'].includes(e.eventType)
      )
      if (isHighDemandEvent) multiplier = 1.5
      else multiplier = 1.2
    }

    const recommendedQty = Math.ceil(velocity * reorderDays * multiplier)
    const estimatedRevenue = recommendedQty * product.avgPrice

    let reasoning = `Based on ${velocity.toFixed(2)} units/day (calendar)`
    if (multiplier > 1) {
      reasoning += ` · ${Math.round((multiplier - 1) * 100)}% boost for upcoming event`
    }

    items.push({
      productName: product.name,
      category: product.category,
      avgDailyVelocity: velocity,
      recommendedQty,
      estimatedRevenue,
      avgPrice: product.avgPrice,
      lastSoldDate: product.lastSoldDate,
      reasoning,
    })
  }

  return items.sort((a, b) => b.estimatedRevenue - a.estimatedRevenue)
}
