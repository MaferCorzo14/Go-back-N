/**
 * Panel del emisor: búfer de paquetes 0..15, ventana deslizante de tamaño N,
 * punteros base / nextSeq y temporizador de la trama base.
 */

import { motion } from 'framer-motion'
import type { Derived, PacketState, PacketView } from '../hooks/useGoBackN'
import type { SimState } from '../simulation/types'
import { Panel, ProgressRing, Stat, Tag } from './ui'
import { cx } from '../lib/cx'

const CELL_W = 46
const GAP = 8
const STRIDE = CELL_W + GAP

const CELL_STYLE: Record<PacketState, string> = {
  ACKED: 'border-emerald-400 bg-emerald-100 text-emerald-800',
  OUTSTANDING: 'border-amber-400 bg-amber-100 text-amber-800',
  USABLE: 'border-indigo-400 bg-indigo-100 text-indigo-800',
  BLOCKED: 'border-slate-200 bg-slate-50 text-slate-500',
}

const CELL_HINT: Record<PacketState, string> = {
  ACKED: 'ACK',
  OUTSTANDING: 'espera',
  USABLE: 'listo',
  BLOCKED: '—',
}

function PacketCell({ packet }: { packet: PacketView }) {
  return (
    <div
      className="absolute top-6 flex flex-col items-center justify-center rounded-lg border transition-colors duration-300"
      style={{ left: packet.seq * STRIDE, width: CELL_W, height: 58 }}
    >
      <div
        className={cx(
          'flex h-full w-full flex-col items-center justify-center rounded-lg border transition-colors duration-300',
          CELL_STYLE[packet.state],
          packet.inFlight && 'ring-2 ring-sky-400 ring-offset-1 ring-offset-white',
        )}
      >
        <span className="font-mono text-base leading-none font-bold">{packet.seq}</span>
        <span className="mt-1 text-[10px] tracking-wide text-current/70 uppercase">
          {packet.retransmitting ? 'retx' : CELL_HINT[packet.state]}
        </span>
      </div>
    </div>
  )
}

function Pointer({ index, label, tone, top }: { index: number; label: string; tone: string; top: number }) {
  return (
    <motion.div
      className="absolute flex flex-col items-center"
      style={{ top, width: CELL_W }}
      animate={{ x: index * STRIDE }}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
    >
      <div className={cx('h-2 w-2 rotate-45 border-t border-l', tone)} />
      <span className={cx('mt-0.5 font-mono text-[11px] font-semibold', tone.split(' ').pop())}>
        {label}
      </span>
    </motion.div>
  )
}

export function SenderPanel({ state, derived }: { state: SimState; derived: Derived }) {
  const { base, nextSeq } = state.sender
  const { windowSize, totalPackets } = state.config
  const visibleWindow = Math.max(0, Math.min(windowSize, totalPackets - base))
  const timerRunning = state.sender.timerExpiry !== null
  const urgent = derived.timerFraction > 0.75

  return (
    <Panel
      accent="indigo"
      title="1 · Emisor"
      subtitle="Búfer de la capa de red y ventana de envío"
      aside={
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[11px] tracking-[0.12em] text-slate-600 uppercase">
              Temporizador
            </div>
            <div
              className={cx(
                'font-mono text-sm font-semibold',
                timerRunning ? (urgent ? 'text-rose-600' : 'text-amber-600') : 'text-slate-500',
              )}
            >
              {timerRunning ? `${(derived.timerRemaining / 1000).toFixed(1)} s` : 'detenido'}
            </div>
            <div className="text-[11px] text-slate-600">
              {timerRunning ? `trama base ${base}` : 'sin tramas pendientes'}
            </div>
          </div>
          <ProgressRing
            fraction={timerRunning ? 1 - derived.timerFraction : 0}
            color={urgent ? '#f43f5e' : timerRunning ? '#f59e0b' : '#cbd5e1'}
          >
            <span className="text-[14px]">{urgent ? '🔥' : '⏱'}</span>
          </ProgressRing>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="base" value={base >= totalPackets ? '—' : base} hint="1.ª sin confirmar" tone="emerald" />
        <Stat
          label="nextSeqNum"
          value={nextSeq >= totalPackets ? '—' : nextSeq}
          hint="siguiente a enviar"
          tone="indigo"
        />
        <Stat
          label="Sin confirmar"
          value={`${derived.outstanding} / ${windowSize}`}
          hint={derived.windowFull ? 'ventana LLENA' : 'huecos disponibles'}
          tone={derived.windowFull ? 'rose' : 'slate'}
        />
        <Stat
          label="Transmisiones"
          value={derived.totalTransmissions}
          hint={`${state.stats.retransmissions} retransmitidas`}
          tone="amber"
        />
      </div>

      <div className="mt-4 overflow-x-auto pb-1">
        <div className="relative" style={{ width: totalPackets * STRIDE + 46, height: 128 }}>
          {/* Ventana deslizante: se anima al desplazarse tras cada ACK. */}
          {visibleWindow > 0 && (
            <motion.div
              className="pointer-events-none absolute rounded-xl border-2 border-dashed border-indigo-500 bg-indigo-100/70"
              style={{ top: 18, height: 74 }}
              animate={{
                x: base * STRIDE - 6,
                width: visibleWindow * STRIDE - GAP + 12,
              }}
              transition={{ type: 'spring', stiffness: 260, damping: 28 }}
            >
              <span className="absolute -top-2.5 left-2 rounded bg-indigo-600 px-1.5 text-[11px] font-semibold tracking-wide text-white uppercase">
                Ventana N = {windowSize}
              </span>
            </motion.div>
          )}

          {derived.packets.map((packet) => (
            <PacketCell key={packet.seq} packet={packet} />
          ))}

          <Pointer index={Math.min(base, totalPackets)} label="base" tone="border-emerald-500 text-emerald-700" top={88} />
          <Pointer
            index={Math.min(nextSeq, totalPackets)}
            label="nextSeq"
            tone="border-indigo-500 text-indigo-700"
            top={106}
          />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-slate-600">
        <span className="flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-sm border border-emerald-400 bg-emerald-100" />
          confirmado (seq &lt; base)
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-sm border border-amber-400 bg-amber-100" />
          enviado sin confirmar
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-sm border border-indigo-400 bg-indigo-100" />
          utilizable en la ventana
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-sm border border-slate-200 bg-slate-100" />
          bloqueado
        </span>
        {derived.windowFull && !derived.complete && (
          <Tag tone="rose">La ventana está llena · el emisor debe esperar un ACK</Tag>
        )}
      </div>
    </Panel>
  )
}
