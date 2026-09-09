/**
 * Diagrama espacio-tiempo (estilo Tanenbaum, fig. 3-x de §3.4): el tiempo
 * avanza hacia abajo y cada trama es una línea diagonal entre el eje del
 * emisor y el del receptor. Las tramas perdidas se cortan a mitad de camino.
 */

import { Panel, Tag } from './ui'
import type { SimState } from '../simulation/types'

const HEIGHT = 300
const SENDER_X = 14
const RECEIVER_X = 86
const SPAN = RECEIVER_X - SENDER_X

export function SequenceDiagram({ state }: { state: SimState }) {
  const viewMs = Math.min(40_000, Math.max(7_000, state.config.propagationDelay * 8))
  // «Ahora» se mantiene cerca del borde inferior; el eje nunca muestra tiempos
  // negativos y se desplaza solo cuando la simulación supera la ventana visible.
  const tStart = Math.max(0, state.time - viewMs * 0.92)
  const tEnd = tStart + viewMs
  const y = (t: number) => ((t - tStart) / viewMs) * HEIGHT

  const records = state.trace.filter((r) => r.t1 >= tStart && r.t0 <= state.time)
  const marks = state.timeoutMarks.filter((m) => m.time >= tStart && m.time <= tEnd)

  // Rejilla de segundos.
  const gridStep = viewMs > 20_000 ? 5_000 : viewMs > 12_000 ? 2_000 : 1_000
  const firstGrid = Math.ceil(tStart / gridStep) * gridStep
  const gridLines: number[] = []
  for (let t = firstGrid; t <= tEnd; t += gridStep) gridLines.push(t)

  return (
    <Panel
      accent="violet"
      title="Diagrama espacio-tiempo"
      subtitle={`Ventana visible: últimos ${(viewMs / 1000).toFixed(0)} s de simulación`}
      aside={
        <div className="flex gap-1.5">
          <Tag tone="sky">datos</Tag>
          <Tag tone="emerald">ACK</Tag>
          <Tag tone="amber">retransmisión</Tag>
          <Tag tone="rose">pérdida</Tag>
        </div>
      }
      bodyClassName="p-2"
    >
      <svg width="100%" height={HEIGHT} className="overflow-visible">
        <defs>
          <clipPath id="plot-clip">
            <rect x="0" y="0" width="100%" height={HEIGHT} />
          </clipPath>
        </defs>

        <g clipPath="url(#plot-clip)">
          {gridLines.map((t) => (
            <g key={t}>
              <line
                x1="0%"
                x2="100%"
                y1={y(t)}
                y2={y(t)}
                stroke="rgba(100,116,139,0.16)"
                strokeDasharray="3 5"
              />
              <text x="2" y={y(t) - 3} fill="rgba(100,116,139,0.75)" fontSize="9" fontFamily="monospace">
                {(t / 1000).toFixed(0)}s
              </text>
            </g>
          ))}

          {/* Ejes verticales de emisor y receptor. */}
          <line x1={`${SENDER_X}%`} x2={`${SENDER_X}%`} y1="0" y2={HEIGHT} stroke="rgba(99,102,241,0.6)" strokeWidth="2" />
          <line x1={`${RECEIVER_X}%`} x2={`${RECEIVER_X}%`} y1="0" y2={HEIGHT} stroke="rgba(16,185,129,0.6)" strokeWidth="2" />

          {marks.map((mark) => (
            <g key={mark.id}>
              <line
                x1={`${SENDER_X - 8}%`}
                x2={`${SENDER_X + 8}%`}
                y1={y(mark.time)}
                y2={y(mark.time)}
                stroke="#f43f5e"
                strokeWidth="2"
                strokeDasharray="4 3"
              />
              <text
                x={`${SENDER_X - 8}%`}
                y={y(mark.time) - 4}
                fill="#f43f5e"
                fontSize="9"
                fontFamily="monospace"
              >
                timeout {mark.base}
              </text>
            </g>
          ))}

          {records.map((record) => {
            const isData = record.kind === 'DATA'
            const x0 = isData ? SENDER_X : RECEIVER_X
            const direction = isData ? 1 : -1
            // La línea crece con el reloj: nunca se dibuja el tramo que la
            // trama todavía no ha recorrido.
            const span = record.t1 - record.t0
            const drawn = span <= 0 ? 1 : Math.min(1, Math.max(0, (state.time - record.t0) / span))
            const reach = (record.lost ? record.lossProgress : 1) * drawn
            const tDrawn = Math.min(record.t1, state.time)
            const x1 = x0 + direction * SPAN * reach
            const color = record.lost
              ? '#f43f5e'
              : record.isRetransmission
                ? '#f59e0b'
                : isData
                  ? '#0ea5e9'
                  : '#10b981'
            return (
              <g key={record.frameId}>
                <line
                  x1={`${x0}%`}
                  x2={`${x1}%`}
                  y1={y(record.t0)}
                  y2={y(tDrawn)}
                  stroke={color}
                  strokeWidth="1.8"
                  strokeDasharray={record.lost ? '5 3' : undefined}
                  opacity={0.95}
                />
                <text
                  x={`${x0 + direction * 2}%`}
                  y={y(record.t0) - 3}
                  fill={color}
                  fontSize="10"
                  fontFamily="monospace"
                  textAnchor={isData ? 'start' : 'end'}
                >
                  {isData ? '' : 'ACK '}
                  {record.seq}
                  {record.isRetransmission ? ' ↻' : ''}
                </text>
                {record.lost && state.time >= record.t1 && (
                  <text
                    x={`${x1}%`}
                    y={y(record.t1) + 4}
                    fill="#f43f5e"
                    fontSize="12"
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    ✕
                  </text>
                )}
              </g>
            )
          })}
        </g>

        <text x={`${SENDER_X}%`} y="10" fill="#4f46e5" fontSize="10" textAnchor="middle">
          EMISOR
        </text>
        <text x={`${RECEIVER_X}%`} y="10" fill="#059669" fontSize="10" textAnchor="middle">
          RECEPTOR
        </text>
      </svg>
      <p className="mt-1 px-1 text-[12px] text-slate-600">
        El tiempo avanza hacia abajo. La pendiente de cada línea es el retardo de propagación: a
        mayor pendiente, canal más lento.
      </p>
    </Panel>
  )
}
