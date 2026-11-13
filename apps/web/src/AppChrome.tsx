import { useState, type ReactNode } from 'react'
import { Bars3Icon } from '@heroicons/react/24/outline'
import Controls from './Controls.tsx'
import { SideDrawer } from './SideDrawer.tsx'

/** Sticky header (menu + page title) shared by every page. `controls` adds the account/date/hurdle bar. */
export function AppChrome({ title, controls = false, children }: { title: string; controls?: boolean; children: ReactNode }) {
  const [menu, setMenu] = useState(false)
  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-40 bg-primary text-primary-foreground shadow-lg">
        <div className="mx-auto flex max-w-5xl items-center space-x-2 px-2 py-2">
          <button onClick={() => setMenu(true)} className="-ml-2 rounded-sm p-2 transition-colors hover:bg-primary/90" title="Menu" aria-label="Open menu">
            <Bars3Icon className="h-6 w-6" />
          </button>
          <h1 className="text-base font-bold">{title}</h1>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-3 px-2 py-3">
        {controls && <Controls />}
        {children}
      </main>
      <SideDrawer isOpen={menu} onClose={() => setMenu(false)} />
    </div>
  )
}
