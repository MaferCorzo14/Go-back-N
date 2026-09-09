/**
 * Simulador visual del protocolo de ventana deslizante Go-Back-N.
 *
 * Composición de la interfaz: la lógica del protocolo vive por completo en
 * `simulation/engine.ts` y llega aquí a través del hook `useGoBackN`.
 */

import { ControlPanel } from './components/ControlPanel'
import { EventLog } from './components/EventLog'
import { NetworkChannel } from './components/NetworkChannel'
import { ReceiverPanel } from './components/ReceiverPanel'
import { SenderPanel } from './components/SenderPanel'
import { SequenceDiagram } from './components/SequenceDiagram'
import { TheoryPanel } from './components/TheoryPanel'
import { Tag } from './components/ui'
import { cx } from './lib/cx'
import { useGoBackN, useKeyboardShortcuts } from './hooks/useGoBackN'
import { formatPercent } from './simulation/formulas'

function HeaderStat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="min-w-[86px] rounded-xl border border-slate-300 bg-slate-50 px-3 py-1.5 shadow-sm shadow-slate-300/20">
      <div className="text-[10.5px] font-semibold tracking-[0.12em] text-slate-600 uppercase">{label}</div>
      <div className={cx('font-mono text-base font-bold', tone)}>{value}</div>
    </div>
  )
}

export default function App() {
  const { state, derived, actions } = useGoBackN()
  useKeyboardShortcuts(actions)

  const losses = state.stats.dataLost + state.stats.acksLost

  return (
    <div className="min-h-screen pb-12">
      <header className="border-b border-slate-300 bg-white shadow-sm shadow-slate-300/20">
        <div className="mx-auto flex max-w-[1680px] flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Simulador <span className="text-indigo-600">Go-Back-N</span>
            </h1>
            <p className="mt-0.5 text-[13.5px] text-slate-600">
              Protocolo de ventana deslizante con retroceso N · retransmisión por temporizador y ACK
              acumulativos
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <HeaderStat
              label="Reloj"
              value={`${(state.time / 1000).toFixed(1)} s`}
              tone="text-slate-700"
            />
            <HeaderStat
              label="Entregadas"
              value={`${state.receiver.delivered.length}/${state.config.totalPackets}`}
              tone="text-emerald-600"
            />
            <HeaderStat
              label="Eficiencia"
              value={derived.totalTransmissions === 0 ? '—' : formatPercent(derived.efficiency, 0)}
              tone="text-sky-600"
            />
            <HeaderStat
              label="Timeouts"
              value={String(state.stats.timeouts)}
              tone={state.stats.timeouts > 0 ? 'text-amber-600' : 'text-slate-500'}
            />
            <HeaderStat
              label="Pérdidas"
              value={String(losses)}
              tone={losses > 0 ? 'text-rose-600' : 'text-slate-500'}
            />
            {!state.running && <Tag tone="amber">⏸ en pausa</Tag>}
            {derived.complete && <Tag tone="emerald">✓ transferencia completa</Tag>}
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1680px] gap-4 px-4 pt-4 xl:grid-cols-[336px_minmax(0,1fr)]">
        <ControlPanel state={state} derived={derived} actions={actions} />

        <div className="min-w-0 space-y-4">
          <SenderPanel state={state} derived={derived} />
          <NetworkChannel state={state} derived={derived} actions={actions} />
          <ReceiverPanel state={state} />
          <div className="grid gap-4 2xl:grid-cols-2">
            <SequenceDiagram state={state} />
            <EventLog state={state} />
          </div>
          <TheoryPanel />
        </div>
      </main>
    </div>
  )
}
