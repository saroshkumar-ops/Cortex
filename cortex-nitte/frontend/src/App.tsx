import { Route, Routes } from 'react-router-dom'
import Layout from './components/layout/Layout'
import Dashboard from './pages/Dashboard'
import Incidents from './pages/Incidents'
import IncidentDetail from './pages/IncidentDetail'
import Memory from './pages/Memory'
import Actions from './pages/Actions'
import Demo from './pages/Demo'
import Settings from './pages/Settings'
import { useWebSocket } from './hooks/useWebSocket'

interface AppProps {}

export default function App({}: AppProps) {
  useWebSocket()

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="incidents" element={<Incidents />} />
        <Route path="incidents/:id" element={<IncidentDetail />} />
        <Route path="memory" element={<Memory />} />
        <Route path="actions" element={<Actions />} />
        <Route path="demo" element={<Demo />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}
