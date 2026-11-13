import { NavLink } from 'react-router-dom'
import { Drawer as KitDrawer, DrawerContent } from '@onyantra-in/ui-kit/base'
import { APP_NAME, APP_VERSION } from './version.ts'
import { ArrowUpTrayIcon, BriefcaseIcon, ChartBarIcon, LightBulbIcon, TableCellsIcon, UsersIcon } from '@heroicons/react/24/outline'

const items = [
  { to: '/', label: 'Dashboard', Icon: ChartBarIcon, end: true },
  { to: '/schedule', label: 'Investment schedule', Icon: TableCellsIcon },
  { to: '/holdings', label: 'Holdings', Icon: BriefcaseIcon },
  { to: '/insights', label: 'Insights', Icon: LightBulbIcon },
  { to: '/accounts', label: 'Accounts', Icon: UsersIcon },
  { to: '/import', label: 'Import & backup', Icon: ArrowUpTrayIcon },
]

/** Slide-out menu, same pattern as fabric-costing-lite. */
export function SideDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return (
    <KitDrawer open={isOpen} onOpenChange={open => { if (!open) onClose() }} direction="left" disablePreventScroll={false}>
      <DrawerContent className="w-64">
        <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3">
          <img src="/icon.svg" alt="" className="h-9 w-9 rounded-lg" />
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-primary">{APP_NAME}</p>
            <p className="text-xs text-gray-500">Version {APP_VERSION}</p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {items.map(({ to, label, Icon, end }) => (
            <NavLink key={to} to={to} end={end} onClick={onClose}
              className={({ isActive }) => `flex w-full items-center space-x-3 rounded-lg px-4 py-3 transition-colors ${isActive ? 'bg-primary text-primary-foreground' : 'text-gray-800 hover:bg-gray-100'}`}>
              <Icon className="h-5 w-5" />
              <span className="text-lg font-medium">{label}</span>
            </NavLink>
          ))}
        </nav>
        <p className="border-t border-gray-200 p-4 text-xs text-gray-500">Your data stays on this device. Nothing is uploaded.</p>
      </DrawerContent>
    </KitDrawer>
  )
}
