import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useWebSocket } from './hooks/useWebSocket'
import { useBackendSync } from './hooks/useBackendSync'
import { LandingPage } from './pages/LandingPage'
import { DashboardLayout } from './pages/dashboard/DashboardLayout'
import { OverviewPage } from './pages/dashboard/OverviewPage'
import { ServicesPage } from './pages/dashboard/ServicesPage'
import { IncidentsPage } from './pages/dashboard/IncidentsPage'
import { ActionLogPage } from './pages/dashboard/ActionLogPage'
import { SettingsPage } from './pages/dashboard/SettingsPage'
import { ContextPage } from './pages/dashboard/ContextPage'

// Initialises the WebSocket inside Router context so nav can react to live data
function WSBridge() {
  useWebSocket()
  useBackendSync()
  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <WSBridge />
      <Routes>
        {/* Landing */}
        <Route path="/" element={<LandingPage />} />

        {/* Dashboard */}
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<Navigate to="context" replace />} />
          <Route path="context"   element={<ContextPage />} />
          <Route path="overview"  element={<OverviewPage />} />
          <Route path="services"  element={<ServicesPage />} />
          <Route path="incidents" element={<IncidentsPage />} />
          <Route path="actions"   element={<ActionLogPage />} />
          <Route path="settings"  element={<SettingsPage />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
