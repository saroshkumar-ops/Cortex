import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Settings, Zap, Trash2, FlaskConical, Bell,
  RefreshCw, CheckCircle, XCircle, Activity, ToggleLeft, ToggleRight,
  Github, Slack, FileText,
} from 'lucide-react'
import { useCortexStore, BackendConfig, BackendHealth, NotificationStatus } from '../../store/cortex'
import { API_BASE } from '../../lib/api'

const SERVICES = ['auth', 'orders', 'payments', 'ledger']
const FAULT_TYPES = [
  { value: 'latency',       label: 'Latency Spike' },
  { value: 'error_rate',    label: 'Error Storm' },
  { value: 'cpu',           label: 'CPU Saturation' },
  { value: 'traffic_spike', label: 'Traffic Spike' },
]

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-indigo-500">{icon}</span>
        <h2 className="font-semibold text-slate-800 text-sm">{title}</h2>
      </div>
      {children}
    </div>
  )
}

export function SettingsPage() {
  const { config, health, notificationStatus, setConfig, setHealth, setNotificationStatus } = useCortexStore()

  const [faultService, setFaultService] = useState('auth')
  const [faultType, setFaultType] = useState('latency')
  const [faultMag, setFaultMag] = useState(0.8)
  const [faultResult, setFaultResult] = useState('')
  const [notifyResult, setNotifyResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [healthLoading, setHealthLoading] = useState(false)

  async function fetchAll() {
    const [cfgRes, hRes, nRes] = await Promise.allSettled([
      fetch(`${API_BASE}/api/config`).then(r => r.json()),
      fetch(`${API_BASE}/health`).then(r => r.json()),
      fetch(`${API_BASE}/api/notifications/status`).then(r => r.json()),
    ])
    if (cfgRes.status === 'fulfilled') setConfig(cfgRes.value as BackendConfig)
    if (hRes.status === 'fulfilled') setHealth(hRes.value as BackendHealth)
    if (nRes.status === 'fulfilled') setNotificationStatus(nRes.value as NotificationStatus)
  }

  useEffect(() => { fetchAll() }, [])

  async function toggleDryRun() {
    if (!config) return
    const res = await fetch(`${API_BASE}/api/config`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dry_run: !config.dry_run }),
    })
    setConfig(await res.json())
  }

  async function updateThreshold(v: number) {
    const res = await fetch(`${API_BASE}/api/config`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confidence_threshold: v }),
    })
    setConfig(await res.json())
  }

  async function injectFault() {
    setLoading(true)
    setFaultResult('')
    try {
      const res = await fetch(`${API_BASE}/api/inject/${faultService}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: faultType, magnitude: faultMag }),
      })
      const data = await res.json()
      setFaultResult(`✓ Injected ${data.type} into ${data.service} (magnitude ${data.magnitude})`)
    } catch {
      setFaultResult('✗ Injection failed — is backend running?')
    } finally {
      setLoading(false)
    }
  }

  async function clearFault() {
    setLoading(true)
    setFaultResult('')
    try {
      const res = await fetch(`${API_BASE}/api/inject/${faultService}`, { method: 'DELETE' })
      const data = await res.json()
      setFaultResult(`✓ Cleared fault on ${data.service}`)
    } catch {
      setFaultResult('✗ Clear failed')
    } finally {
      setLoading(false)
    }
  }

  async function testNotifications() {
    setNotifyResult('')
    try {
      const res = await fetch(`${API_BASE}/api/notifications/test`, { method: 'POST' })
      const data = await res.json()
      setNotifyResult(`✓ Fired to [${data.integrations_tried.join(', ')}] — pred ${data.prediction_id}`)
    } catch {
      setNotifyResult('✗ Notification test failed')
    }
  }

  async function refreshHealth() {
    setHealthLoading(true)
    try {
      const res = await fetch(`${API_BASE}/health`)
      setHealth(await res.json())
    } finally {
      setHealthLoading(false)
    }
  }

  const selectCls = "w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 text-slate-700"
  const btnCls = "flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl transition-colors"

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">Runtime config, fault injection, integrations, and backend health</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* ── Runtime Config ── */}
        <Card title="Runtime Config" icon={<Settings size={16} />}>
          {config ? (
            <div className="space-y-4">
              {/* Dry-run toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-700">Dry-run mode</p>
                  <p className="text-xs text-slate-400">No real K8s / Istio actions executed</p>
                </div>
                <button onClick={toggleDryRun} className="text-indigo-600 hover:text-indigo-800 transition-colors">
                  {config.dry_run
                    ? <ToggleRight size={28} className="text-indigo-500" />
                    : <ToggleLeft size={28} className="text-slate-300" />}
                </button>
              </div>

              {/* Confidence threshold */}
              <div>
                <div className="flex justify-between mb-1">
                  <p className="text-sm font-medium text-slate-700">Confidence Threshold</p>
                  <p className="text-sm font-bold text-indigo-600">{(config.confidence_threshold * 100).toFixed(0)}%</p>
                </div>
                <input
                  type="range" min={0} max={1} step={0.05}
                  value={config.confidence_threshold}
                  onChange={e => updateThreshold(Number(e.target.value))}
                  className="w-full accent-indigo-600"
                />
                <p className="text-[10px] text-slate-400 mt-1">Lower = more sensitive, Higher = fewer false positives</p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs text-slate-500 pt-2 border-t border-slate-100">
                <div>Prediction horizon<br /><span className="font-semibold text-slate-700">{config.prediction_horizon_minutes} min</span></div>
                <div>Graph interval<br /><span className="font-semibold text-slate-700">{config.graph_update_interval_seconds}s</span></div>
                <div>K8s namespace<br /><span className="font-semibold text-slate-700 font-mono">{config.k8s_namespace}</span></div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Loading config…</p>
          )}
        </Card>

        {/* ── Backend Health ── */}
        <Card title="Backend Health" icon={<Activity size={16} />}>
          <div className="flex justify-end mb-3">
            <button
              onClick={refreshHealth}
              className={`${btnCls} text-xs text-slate-500 hover:text-indigo-600 bg-slate-50 border border-slate-200 px-3 py-1.5`}
            >
              <RefreshCw size={12} className={healthLoading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
          {health ? (
            <div className="grid grid-cols-2 gap-3 text-xs">
              {[
                { label: 'Status', value: health.status, ok: health.status === 'ok' },
                { label: 'Tick ID', value: `#${health.tick_id}` },
                { label: 'Warmup Remaining', value: health.warmup_remaining },
                { label: 'Cache Age', value: `${health.cache_age_ms.toFixed(0)}ms`, ok: !health.is_stale },
                { label: 'Consecutive Errors', value: health.consecutive_errors, ok: health.consecutive_errors === 0 },
                { label: 'WS Clients', value: health.ws_clients },
                { label: 'Shadow Mode', value: health.shadow_mode ? 'ON' : 'OFF' },
                { label: 'Services', value: health.services.join(', ') },
              ].map(({ label, value, ok }) => (
                <div key={label} className="bg-slate-50 rounded-xl px-3 py-2">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider">{label}</p>
                  <p className={`font-semibold mt-0.5 ${ok === false ? 'text-red-600' : ok === true ? 'text-green-600' : 'text-slate-700'}`}>
                    {String(value)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">Loading health…</p>
          )}
        </Card>

        {/* ── Fault Injection ── */}
        <Card title="Fault Injection" icon={<FlaskConical size={16} />}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500 font-medium block mb-1">Service</label>
                <select className={selectCls} value={faultService} onChange={e => setFaultService(e.target.value)}>
                  {SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 font-medium block mb-1">Fault Type</label>
                <select className={selectCls} value={faultType} onChange={e => setFaultType(e.target.value)}>
                  {FAULT_TYPES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <label className="text-xs text-slate-500 font-medium">Magnitude</label>
                <span className="text-xs font-bold text-indigo-600">{(faultMag * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range" min={0.1} max={1} step={0.05}
                value={faultMag}
                onChange={e => setFaultMag(Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={injectFault}
                disabled={loading}
                className={`${btnCls} bg-indigo-600 hover:bg-indigo-700 text-white flex-1`}
              >
                <Zap size={14} />
                Inject
              </button>
              <button
                onClick={clearFault}
                disabled={loading}
                className={`${btnCls} bg-slate-100 hover:bg-slate-200 text-slate-700`}
              >
                <Trash2 size={14} />
                Clear
              </button>
            </div>

            {faultResult && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`text-xs px-3 py-2 rounded-lg ${faultResult.startsWith('✓') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}
              >
                {faultResult}
              </motion.p>
            )}
          </div>
        </Card>

        {/* ── Integrations ── */}
        <Card title="Integrations" icon={<Bell size={16} />}>
          {notificationStatus ? (
            <div className="space-y-3">
              {[
                { label: 'Slack', icon: <Slack size={14} />, cfg: notificationStatus.slack, detail: notificationStatus.slack.webhook_preview ? `…${notificationStatus.slack.webhook_preview}` : null },
                { label: 'Notion', icon: <FileText size={14} />, cfg: notificationStatus.notion, detail: notificationStatus.notion.database_id_preview ? `DB: ${notificationStatus.notion.database_id_preview}…` : null },
                { label: 'GitHub', icon: <Github size={14} />, cfg: notificationStatus.github, detail: notificationStatus.github.repo ?? null },
              ].map(({ label, icon, cfg, detail }) => (
                <div key={label} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                  <div className="flex items-center gap-2 text-sm text-slate-700">
                    <span className="text-slate-400">{icon}</span>
                    <span className="font-medium">{label}</span>
                    {detail && <span className="text-[10px] text-slate-400 font-mono">{detail}</span>}
                  </div>
                  {cfg.configured ? (
                    <span className="flex items-center gap-1 text-green-600 text-xs font-medium">
                      <CheckCircle size={12} /> Configured
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-slate-400 text-xs">
                      <XCircle size={12} /> Not set
                    </span>
                  )}
                </div>
              ))}

              <p className="text-[10px] text-slate-400">Cooldown: {notificationStatus.cooldown_seconds}s between notifications</p>

              <button
                onClick={testNotifications}
                className={`${btnCls} w-full justify-center bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200`}
              >
                <Bell size={14} />
                Send Test Notification
              </button>

              {notifyResult && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`text-xs px-3 py-2 rounded-lg ${notifyResult.startsWith('✓') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}
                >
                  {notifyResult}
                </motion.p>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-400">Loading integration status…</p>
          )}
        </Card>

      </div>
    </div>
  )
}
