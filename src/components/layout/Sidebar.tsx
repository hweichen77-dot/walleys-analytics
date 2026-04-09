import { NavLink } from 'react-router-dom'
import { useTransactionCount } from '../../db/useTransactions'

const NAV_ITEMS = [
  { label: 'Dashboard', path: '/dashboard', icon: '📊' },
  { label: 'Transaction Intelligence', path: '/inventory', icon: '📦' },
  { label: 'Time Analysis', path: '/time-analysis', icon: '🕐' },
  { label: 'Staff Performance', path: '/staff', icon: '👥' },
  { label: 'Restock Alerts', path: '/restock', icon: '🔔' },
  { label: 'Profit Margins', path: '/profit', icon: '💰' },
  { label: 'Seasonal & Events', path: '/seasonal', icon: '🗓' },
  { label: 'Dead Stock', path: '/dead-stock', icon: '⚠️' },
  { label: 'Bundle & Cross-Sell', path: '/bundles', icon: '🛍' },
  { label: 'Price Optimization', path: '/price-optimization', icon: '📈' },
  { label: 'Staff Shift Analysis', path: '/staff-shift', icon: '🏷' },
  { label: 'Customer Frequency', path: '/customers', icon: '🧑‍🤝‍🧑' },
  { label: 'Catalogue Checker', path: '/catalogue-checker', icon: '✅' },
  { label: 'Catalogue Products', path: '/catalogue-products', icon: '🗂' },
  { label: 'Purchase Order', path: '/purchase-order', icon: '🛒' },
]

const BOTTOM_ITEMS = [
  { label: 'Reports', path: '/reports', icon: '📄' },
  { label: 'Import Data', path: '/import', icon: '⬆️' },
  { label: 'Square Sync', path: '/square-sync', icon: '🔄' },
]

export default function Sidebar() {
  const txCount = useTransactionCount()

  return (
    <aside className="w-56 shrink-0 bg-white border-r border-gray-200 flex flex-col h-full">
      <div className="px-4 py-5 border-b border-gray-100">
        <h1 className="text-base font-bold text-gray-900">Walley's Analytics</h1>
        <p className="text-xs text-gray-400 mt-0.5">{txCount.toLocaleString()} transactions</p>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                isActive
                  ? 'bg-indigo-50 text-indigo-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`
            }
          >
            <span className="text-base leading-none">{item.icon}</span>
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-gray-100 py-2">
        {BOTTOM_ITEMS.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                isActive
                  ? 'bg-indigo-50 text-indigo-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`
            }
          >
            <span className="text-base leading-none">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>
    </aside>
  )
}
