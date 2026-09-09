/**
 * Panel del receptor. En Go-Back-N la ventana de recepción vale siempre 1:
 * solo se acepta la trama `expectedSeqNum`; cualquier otra se descarta y se
 * reenvía el último ACK válido (Tanenbaum §3.4.2).
 */

import { motion } from 'framer-motion'
import type { SimState } from '../simulation/types'
import { Panel, Stat, Tag } from './ui'
import { cx } from '../lib/cx'

const CELL_W = 46
const GAP = 8
const STRIDE = CELL_W + GAP

export function ReceiverPanel({ state }: { state: SimState }) {
  const { expected, delivered, lastAckSent, lastRejected } = state.receiver
  const { totalPackets } = state.config
  const done = expected >= totalPackets

  return (
    <Panel
      accent="emerald"
      title="3 · Receptor"
      subtitle="Ventana de recepción de tamaño 1 · entrega en orden a la capa de red"
      aside={
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[11px] tracking-[0.12em] text-slate-600 uppercase">
              expectedSeqNum
            </div>
            <div className="text-[11px] text-slate-600">única trama aceptable</div>
          </div>
          <motion.div
            key={expected}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 22 }}
            className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-emerald-400 bg-emerald-100 font-mono text-xl font-bold text-emerald-700"
          >
            {done ? '✓' : expected}
          </motion.div>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat
          label="Entregadas"
          value={`${delivered.length} / ${totalPackets}`}
          hint="a la capa de red, en orden"
          tone="emerald"
        />
        <Stat
          label="Último ACK"
          value={lastAckSent === null ? '—' : lastAckSent}
          hint="confirmación acumulativa"
          tone="sky"
        />
        <Stat
          label="Descartadas"
          value={state.stats.discarded}
          hint="llegaron fuera de orden"
          tone={state.stats.discarded > 0 ? 'rose' : 'slate'}
        />
        <Stat
          label="ACK enviados"
          value={state.stats.acksSent}
          hint={`${state.stats.acksLost} perdidos en el canal`}
          tone="slate"
        />
      </div>

      <div className="mt-4 overflow-x-auto pb-1">
        <div className="relative" style={{ width: totalPackets * STRIDE + 46, height: 104 }}>
          {/* Ventana de recepción: una sola casilla. */}
          {!done && (
            <motion.div
              className="pointer-events-none absolute rounded-xl border-2 border-emerald-500 bg-emerald-100/70"
              style={{ top: 18, height: 74, width: CELL_W + 12 }}
              animate={{ x: expected * STRIDE - 6 }}
              transition={{ type: 'spring', stiffness: 260, damping: 28 }}
            >
              <span className="absolute -top-2.5 left-1 rounded bg-emerald-600 px-1 text-[11px] font-semibold tracking-wide text-white uppercase">
                W = 1
              </span>
            </motion.div>
          )}

          {Array.from({ length: totalPackets }, (_, seq) => {
            const isDelivered = seq < expected
            const isExpected = seq === expected
            const wasRejected = lastRejected === seq && !isDelivered
            return (
              <div
                key={seq}
                className="absolute top-6"
                style={{ left: seq * STRIDE, width: CELL_W, height: 58 }}
              >
                <div
                  className={cx(
                    'flex h-full w-full flex-col items-center justify-center rounded-lg border transition-colors duration-300',
                    isDelivered
                      ? 'border-emerald-400 bg-emerald-100 text-emerald-800'
                      : isExpected
                        ? 'border-emerald-500 bg-emerald-200 text-emerald-900'
                        : wasRejected
                          ? 'border-rose-400 bg-rose-100 text-rose-800'
                          : 'border-slate-200 bg-slate-50 text-slate-500',
                  )}
                >
                  <span className="font-mono text-base leading-none font-bold">{seq}</span>
                  <span className="mt-1 text-[10px] tracking-wide uppercase opacity-70">
                    {isDelivered ? 'ok' : isExpected ? 'espera' : wasRejected ? 'descarte' : '—'}
                  </span>
                </div>
              </div>
            )
          })}

          <div className="absolute top-[92px] left-0 text-[12px] text-slate-600">
            {done
              ? 'Todas las tramas fueron entregadas en orden a la capa de red.'
              : `Solo se aceptará la trama ${expected}. Cualquier otra se descarta y se reenvía ACK ${expected - 1 < 0 ? '(ninguno todavía)' : expected - 1}.`}
          </div>
        </div>
      </div>

      {lastRejected !== null && (
        <div className="mt-1">
          <Tag tone="rose">
            Última trama rechazada: {lastRejected} · llegó fuera de secuencia
          </Tag>
        </div>
      )}
    </Panel>
  )
}
