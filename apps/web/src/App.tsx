import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useData } from './data.tsx'
import { InstallGate } from './InstallGate.tsx'
import { isInstalledOrDesktop } from './install.ts'
import AccountsPage from './pages/AccountsPage.tsx'
import DashboardPage from './pages/DashboardPage.tsx'
import HoldingsPage from './pages/HoldingsPage.tsx'
import InsightsPage from './pages/InsightsPage.tsx'
import ImportPage from './pages/ImportPage.tsx'
import SchedulePage from './pages/SchedulePage.tsx'

export default function App() {
  const [installed] = useState(isInstalledOrDesktop)
  const { ready, accounts } = useData()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  // A first-time visitor has nothing to show; start on Import.
  useEffect(() => { if (ready && accounts.length === 0 && pathname === '/') navigate('/import', { replace: true }) }, [ready, accounts.length, pathname, navigate])

  if (!installed) return <InstallGate />   // before the data wait, so the install prompt is available immediately
  if (!ready) return null
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/schedule" element={<SchedulePage />} />
      <Route path="/holdings" element={<HoldingsPage />} />
      <Route path="/insights" element={<InsightsPage />} />
      <Route path="/accounts" element={<AccountsPage />} />
      <Route path="/import" element={<ImportPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
