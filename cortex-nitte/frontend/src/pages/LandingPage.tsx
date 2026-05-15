import React from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bell,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Cpu,
  Layers3,
  LineChart,
  Network,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react'

const logos = ['NOVA', 'ATLAS', 'LUMA', 'VERTEX', 'SIGNAL', 'ORBIT']

const stats = [
  { value: '2s', label: 'Graph cadence' },
  { value: '30m', label: 'Prediction window' },
  { value: '4-tier', label: 'Policy engine' },
  { value: '0-touch', label: 'Dry-run safety' },
]

const features = [
  {
    icon: Network,
    title: 'Topology-aware intelligence',
    desc: 'Model service dependencies as a living graph, so risk is understood across edges rather than isolated dashboards.',
  },
  {
    icon: Cpu,
    title: 'Temporal ML inference',
    desc: 'GNN and sequence modeling combine live telemetry history with service relationships to detect cascade patterns early.',
  },
  {
    icon: ShieldCheck,
    title: 'Guarded remediation',
    desc: 'Shadow mode, dry-run execution, confidence thresholds, and warmup suppression keep automation controlled.',
  },
  {
    icon: Bell,
    title: 'Executive incident context',
    desc: 'Turn predictions into clean summaries, routed notifications, and action plans your operators can trust.',
  },
  {
    icon: Layers3,
    title: 'Operational workspace',
    desc: 'Overview, services, incidents, actions, and settings stay connected to the same real-time backend state.',
  },
  {
    icon: LineChart,
    title: 'Live metrics baseline',
    desc: 'Latency, request rate, CPU, memory, and error signals flow into a simple interface for repeated triage.',
  },
]

const testimonials = [
  {
    quote: 'Cortex feels like an operations desk designed for prediction rather than panic.',
    name: 'Mira Patel',
    role: 'VP Infrastructure',
  },
  {
    quote: 'The interface makes complex graph behavior readable for engineers and executives.',
    name: 'Jon Bell',
    role: 'Platform Lead',
  },
]

function SectionReveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  )
}

function PrimaryButton({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <motion.button
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="inline-flex items-center justify-center gap-2 rounded-full bg-[#111111] px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_45px_rgba(17,17,17,0.18)] transition-shadow hover:shadow-[0_22px_55px_rgba(17,17,17,0.24)]"
    >
      {children}
    </motion.button>
  )
}

function SecondaryButton({ children, href }: { children: React.ReactNode; href: string }) {
  return (
    <motion.a
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      href={href}
      className="inline-flex items-center justify-center gap-2 rounded-full border border-[#D1D5DB] bg-[#F8F8F8] px-6 py-3 text-sm font-semibold text-[#111111] shadow-sm transition-colors hover:bg-white"
    >
      {children}
    </motion.a>
  )
}

function MiniChart() {
  const bars = [42, 62, 51, 76, 58, 88, 69, 96, 72, 84]
  return (
    <div className="flex h-28 items-end gap-2 rounded-[22px] border border-white/70 bg-white/40 p-4">
      {bars.map((bar, index) => (
        <motion.div
          key={index}
          initial={{ height: 12 }}
          animate={{ height: `${bar}%` }}
          transition={{ duration: 1.1, delay: index * 0.06, repeat: Infinity, repeatType: 'mirror', repeatDelay: 2.5 }}
          className="flex-1 rounded-full bg-[#1E0B4B]"
          style={{ opacity: 0.22 + index * 0.055 }}
        />
      ))}
    </div>
  )
}

function DashboardVisual() {
  return (
    <motion.div
      initial={{ opacity: 0, x: 36, rotate: -1 }}
      animate={{ opacity: 1, x: 0, rotate: 0 }}
      transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1], delay: 0.18 }}
      className="relative min-h-[560px] w-full"
    >
      <motion.div
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute right-0 top-8 w-[min(100%,620px)] rounded-[34px] border border-white/70 bg-[#F4F1EC]/95 p-5 shadow-[0_34px_90px_rgba(30,11,75,0.18)] backdrop-blur"
      >
        <div className="mb-5 flex items-center justify-between rounded-full border border-[#E5E7EB] bg-white/55 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_18px_rgba(16,185,129,0.55)]" />
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#4B5563]">Live operations</span>
          </div>
          <span className="rounded-full bg-[#111111] px-3 py-1 text-[11px] font-semibold text-white">2s tick</span>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[26px] border border-white/70 bg-white/45 p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9CA3AF]">Failure probability</p>
                <p className="mt-1 text-4xl font-extrabold tracking-tight text-[#111111]">34.9%</p>
              </div>
              <div className="rounded-full bg-[#C9E4FF] px-3 py-1 text-xs font-semibold text-[#1E0B4B]">Low risk</div>
            </div>
            <MiniChart />
          </div>

          <div className="space-y-4">
            {[
              { label: 'Auth', value: '22.9ms', tone: 'bg-emerald-500' },
              { label: 'Orders', value: '24.7ms', tone: 'bg-sky-500' },
              { label: 'Payments', value: '23.5ms', tone: 'bg-violet-500' },
            ].map((item) => (
              <motion.div
                key={item.label}
                whileHover={{ x: 4 }}
                className="rounded-[22px] border border-white/70 bg-white/55 p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${item.tone}`} />
                    <span className="text-sm font-semibold text-[#111111]">{item.label}</span>
                  </div>
                  <span className="text-sm font-bold text-[#4B5563]">{item.value}</span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#E5E7EB]">
                  <motion.div
                    initial={{ width: '20%' }}
                    animate={{ width: ['44%', '72%', '58%'] }}
                    transition={{ duration: 4, repeat: Infinity, repeatType: 'mirror' }}
                    className="h-full rounded-full bg-[#1E0B4B]"
                  />
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {[
            { label: 'Services', value: '4', icon: Layers3 },
            { label: 'RPS', value: '2.5', icon: Activity },
            { label: 'Memory', value: '15%', icon: BarChart3 },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-[22px] border border-white/70 bg-white/50 p-4">
              <Icon size={16} className="mb-3 text-[#1E0B4B]" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9CA3AF]">{label}</p>
              <p className="mt-1 text-2xl font-extrabold text-[#111111]">{value}</p>
            </div>
          ))}
        </div>
      </motion.div>

      <motion.div
        animate={{ y: [0, 12, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute left-0 top-20 hidden w-52 rounded-[26px] border border-white/70 bg-white/65 p-4 shadow-[0_24px_60px_rgba(17,17,17,0.12)] backdrop-blur md:block"
      >
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-[#4B5563]">
          <Sparkles size={14} className="text-[#1E0B4B]" />
          Signal quality
        </div>
        <p className="text-3xl font-extrabold text-[#111111]">98.4</p>
        <p className="mt-1 text-xs leading-5 text-[#4B5563]">Telemetry stable across graph nodes</p>
      </motion.div>

      <motion.div
        animate={{ y: [0, -14, 0] }}
        transition={{ duration: 5.8, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute bottom-12 left-12 hidden w-64 rounded-[28px] border border-white/70 bg-[#1E0B4B] p-5 text-white shadow-[0_24px_70px_rgba(30,11,75,0.28)] md:block"
      >
        <div className="mb-4 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">Action plan</p>
          <CheckCircle2 size={16} className="text-emerald-300" />
        </div>
        <p className="text-sm font-semibold">Payments risk trending low</p>
        <p className="mt-2 text-xs leading-5 text-white/62">Suppressed by shadow mode and retained for operator review.</p>
      </motion.div>
    </motion.div>
  )
}

export function LandingPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen overflow-hidden bg-[#C9E4FF] font-sans text-[#111111]">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.65),transparent_36%),radial-gradient(ellipse_at_78%_16%,rgba(30,11,75,0.16),transparent_34%),linear-gradient(135deg,#C9E4FF_0%,#D8EDFF_42%,#BFD9F8_100%)]" />
      <div className="pointer-events-none fixed inset-x-0 top-24 -z-10 h-[620px] bg-[conic-gradient(from_150deg_at_50%_50%,rgba(255,255,255,0.42),rgba(30,11,75,0.10),rgba(244,241,236,0.48),rgba(255,255,255,0.34))] opacity-80 blur-3xl" />

      <div className="bg-[#1E0B4B] text-white">
        <div className="mx-auto flex min-h-10 max-w-7xl flex-wrap items-center justify-center gap-x-4 gap-y-1 px-5 py-2 text-center text-xs font-medium sm:justify-between">
          <span className="inline-flex items-center gap-2"><Sparkles size={13} /> Predictive SRE workspace for modern service graphs</span>
          <div className="hidden items-center gap-3 text-white/70 sm:flex">
            <span>Shadow-safe</span>
            <span className="h-3 w-px bg-white/25" />
            <span>2s telemetry loop</span>
            <span className="h-3 w-px bg-white/25" />
            <span>Enterprise controls</span>
          </div>
        </div>
      </div>

      <header className="sticky top-4 z-50 px-4">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between rounded-full border border-[#E5E7EB]/90 bg-white/72 px-4 shadow-[0_18px_50px_rgba(17,17,17,0.08)] backdrop-blur-xl sm:px-6">
          <button onClick={() => navigate('/')} className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#111111] text-white shadow-sm">
              <Zap size={16} />
            </span>
            <span className="text-sm font-extrabold tracking-tight">Cortex</span>
          </button>

          <div className="hidden items-center gap-8 text-sm font-medium text-[#4B5563] md:flex">
            <a className="transition-colors hover:text-[#111111]" href="#proof">Proof</a>
            <a className="transition-colors hover:text-[#111111]" href="#features">Features</a>
            <a className="transition-colors hover:text-[#111111]" href="#cta">Deploy</a>
          </div>

          <button
            onClick={() => navigate('/dashboard/overview')}
            className="inline-flex items-center gap-2 rounded-full bg-[#111111] px-4 py-2.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
          >
            Open app
            <ChevronRight size={15} />
          </button>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-7xl items-center gap-10 px-5 pb-16 pt-16 lg:grid-cols-[0.92fr_1.08fr] lg:pb-24 lg:pt-20">
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-3xl"
          >
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/65 bg-white/50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#1E0B4B] shadow-sm backdrop-blur">
              <Clock3 size={14} />
              Built for proactive operations
            </div>

            <h1 className="text-[clamp(2.25rem,5vw,4.75rem)] font-extrabold leading-[1.02] tracking-normal text-[#111111]">
              Predictive SRE for{' '}
              <span className="inline-block bg-white px-3 pb-2 pt-1 text-[#111111] shadow-[0_14px_40px_rgba(255,255,255,0.38)]">
                serious
              </span>{' '}
              service teams.
            </h1>

            <p className="mt-7 max-w-2xl text-lg font-medium leading-8 text-[#4B5563]">
              Cortex turns live microservice telemetry into a calm enterprise workspace for prediction,
              incident planning, and controlled remediation before cascades become outages.
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <PrimaryButton onClick={() => navigate('/dashboard/overview')}>
                Launch dashboard
                <ArrowRight size={16} />
              </PrimaryButton>
              <SecondaryButton href="#features">
                Explore platform
                <ChevronRight size={16} />
              </SecondaryButton>
            </div>
          </motion.div>

          <DashboardVisual />
        </section>

        <section id="proof" className="border-y border-white/60 bg-white/34 px-5 py-16 backdrop-blur">
          <div className="mx-auto max-w-7xl">
            <SectionReveal>
              <p className="text-center text-xs font-semibold uppercase tracking-[0.22em] text-[#4B5563]">
                Trusted patterns for teams operating complex systems
              </p>
              <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                {logos.map((logo) => (
                  <div key={logo} className="flex h-16 items-center justify-center rounded-full border border-[#E5E7EB]/75 bg-white/35 text-sm font-extrabold tracking-[0.24em] text-[#9CA3AF]">
                    {logo}
                  </div>
                ))}
              </div>
            </SectionReveal>

            <div className="mt-14 grid gap-4 md:grid-cols-4">
              {stats.map((stat, index) => (
                <SectionReveal key={stat.label} delay={index * 0.04}>
                  <div className="rounded-[28px] border border-white/70 bg-[#F4F1EC]/82 p-6 text-center shadow-[0_18px_45px_rgba(17,17,17,0.06)]">
                    <p className="text-4xl font-extrabold text-[#111111]">{stat.value}</p>
                    <p className="mt-2 text-sm font-medium text-[#4B5563]">{stat.label}</p>
                  </div>
                </SectionReveal>
              ))}
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {testimonials.map((item, index) => (
                <SectionReveal key={item.name} delay={index * 0.06}>
                  <figure className="rounded-[28px] border border-white/70 bg-white/42 p-7 shadow-[0_18px_45px_rgba(17,17,17,0.06)] backdrop-blur">
                    <blockquote className="text-lg font-semibold leading-8 text-[#111111]">"{item.quote}"</blockquote>
                    <figcaption className="mt-5 text-sm font-medium text-[#4B5563]">
                      {item.name} <span className="text-[#9CA3AF]">/ {item.role}</span>
                    </figcaption>
                  </figure>
                </SectionReveal>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-7xl px-5 py-24">
          <SectionReveal>
            <div className="max-w-3xl">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#1E0B4B]">Platform capabilities</p>
              <h2 className="mt-4 text-[clamp(2.5rem,5vw,5rem)] font-extrabold leading-[1.02] tracking-normal">
                Quiet interfaces for high-stakes operations.
              </h2>
              <p className="mt-5 max-w-2xl text-lg font-medium leading-8 text-[#4B5563]">
                Minimal surfaces, high contrast signals, and automation controls designed for teams that need clarity under pressure.
              </p>
            </div>
          </SectionReveal>

          <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {features.map(({ icon: Icon, title, desc }, index) => (
              <SectionReveal key={title} delay={index * 0.04}>
                <motion.article
                  whileHover={{ y: -8 }}
                  className="group h-full rounded-[30px] border border-white/70 bg-[#F4F1EC]/90 p-7 shadow-[0_18px_48px_rgba(17,17,17,0.07)] transition-shadow hover:shadow-[0_26px_70px_rgba(17,17,17,0.12)]"
                >
                  <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-full bg-white text-[#1E0B4B] shadow-sm transition-transform group-hover:scale-105">
                    <Icon size={20} />
                  </div>
                  <h3 className="text-xl font-extrabold tracking-tight text-[#111111]">{title}</h3>
                  <p className="mt-3 text-sm font-medium leading-7 text-[#4B5563]">{desc}</p>
                </motion.article>
              </SectionReveal>
            ))}
          </div>
        </section>

        <section id="cta" className="px-5 pb-24">
          <SectionReveal>
            <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[42px] bg-[#1E0B4B] px-6 py-16 text-white shadow-[0_34px_95px_rgba(30,11,75,0.28)] sm:px-12 lg:px-16">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(201,228,255,0.32),transparent_38%),radial-gradient(ellipse_at_85%_80%,rgba(244,241,236,0.18),transparent_42%)]" />
              <div className="relative grid items-center gap-10 lg:grid-cols-[1fr_auto]">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-white/58">Production-ready preview</p>
                  <h2 className="mt-4 max-w-3xl text-[clamp(2.5rem,5vw,5.25rem)] font-extrabold leading-[1.02] tracking-normal">
                    Bring the operation room into focus.
                  </h2>
                  <p className="mt-5 max-w-2xl text-lg font-medium leading-8 text-white/68">
                    Open the dashboard to inspect live services, prediction output, suppressed plans, runtime controls, and notification status.
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                  <PrimaryButton onClick={() => navigate('/dashboard/overview')}>
                    Open dashboard
                    <ArrowRight size={16} />
                  </PrimaryButton>
                  <SecondaryButton href="#proof">
                    View trust signals
                    <ChevronRight size={16} />
                  </SecondaryButton>
                </div>
              </div>
            </div>
          </SectionReveal>
        </section>
      </main>

      <footer className="border-t border-white/60 bg-white/30 px-5 py-8 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 text-sm font-medium text-[#4B5563] sm:flex-row">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#111111] text-white">
              <Zap size={14} />
            </span>
            <span className="font-extrabold text-[#111111]">Cortex</span>
          </div>
          <span>FastAPI · PyTorch · React · WebSockets</span>
          <span>Dry-run safe by default</span>
        </div>
      </footer>
    </div>
  )
}
