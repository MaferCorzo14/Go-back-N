/** Bitácora de eventos del protocolo, en orden cronológico inverso. */

import { AnimatePresence, motion } from 'framer-motion'
import type { LogSource, SimState } from '../simulation/types'
import { Panel } from './ui'
import { cx } from '../lib/cx'

const SOURCE_STYLE: Record<LogSource, { label: string; dot: string; text: string }> = {
  sender: { label: 'EMISOR', dot: 'bg-indigo-500', text: 'text-indigo-600' },
  receiver: { label: 'RECEPTOR', dot: 'bg-emerald-500', text: 'text-emerald-600' },
  channel: { label: 'CANAL', dot: 'bg-rose-500', text: 'text-rose-600' },
  timer: { label: 'TIMER', dot: 'bg-amber-500', text: 'text-amber-600' },
  system: { label: 'SISTEMA', dot: 'bg-slate-400', text: 'text-slate-600' },
}

export function EventLog({ state }: { state: SimState }) {
  return (
    <Panel
      title="Bitácora de eventos"
      subtitle="Cada transición de la máquina de estados"
      bodyClassName="p-0"
    >
      <ul className="max-h-[300px] divide-y divide-slate-100 overflow-y-auto">
        <AnimatePresence initial={false}>
          {state.log.map((entry) => {
            const style = SOURCE_STYLE[entry.source]
            return (
              <motion.li
                key={entry.id}
                layout
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="flex gap-2.5 px-3 py-2"
              >
                <span className="mt-1 flex flex-col items-center gap-1">
                  <span className={cx('h-2 w-2 shrink-0 rounded-full', style.dot)} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[11px] text-slate-600">
                      {(entry.time / 1000).toFixed(2)}s
                    </span>
                    <span className={cx('text-[11px] font-semibold tracking-wider', style.text)}>
                      {style.label}
                    </span>
                  </div>
                  <p className="text-[14px] leading-snug text-slate-700">{entry.title}</p>
                  {entry.detail && (
                    <p className="mt-0.5 text-[12px] leading-snug text-slate-600">{entry.detail}</p>
                  )}
                </div>
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ul>
    </Panel>
  )
}
