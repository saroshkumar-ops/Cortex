import FaultInjector from '../components/demo/FaultInjector'
import ServiceGraph from '../components/graph/ServiceGraph'
import PredictionPanel from '../components/predictions/PredictionPanel'

interface DemoProps {}

export default function Demo({}: DemoProps) {
  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
      <FaultInjector />
      <div className="space-y-6">
        <ServiceGraph className="h-[420px]" />
        <PredictionPanel />
      </div>
    </div>
  )
}
