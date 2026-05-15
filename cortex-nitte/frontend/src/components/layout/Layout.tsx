import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import useCortexStore from '../../store/cortex'

interface LayoutProps {}

export default function Layout({}: LayoutProps) {
  const dryRun = useCortexStore((state) => state.dryRun)

  return (
    <div className="min-h-screen">
      {dryRun ? (
        <div className="sticky top-0 z-50 flex items-center justify-center bg-ember px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white">
          Dry run mode is active. No remediations are executed.
        </div>
      ) : null}
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex min-h-screen flex-1 flex-col">
          <TopBar />
          <main className="flex-1 px-6 py-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
