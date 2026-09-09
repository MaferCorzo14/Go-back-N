/** Panel de control: envío manual, parámetros del protocolo y fallos provocados. */

import type { Derived, GoBackNActions } from '../hooks/useGoBackN'
import { DELAY_FACTOR } from '../simulation/engine'
import { bitsForWindow } from '../simulation/formulas'
import type { SimState } from '../simulation/types'
import { Button, Panel, Slider, Tag } from './ui'
import { cx } from '../lib/cx'

function reasonToBlock(state: SimState, derived: Derived): string | null {
  if (derived.complete) return 'Todos los paquetes han sido confirmados. Reinicia para volver a empezar.'
  if (state.sender.nextSeq >= state.config.totalPackets)
    return 'No quedan paquetes pendientes en la capa de red.'
  if (derived.windowFull)
    return `Ventana llena: ${derived.outstanding} trama(s) sin confirmar con N = ${state.config.windowSize}. El emisor debe esperar un ACK.`
  return null
}

export function ControlPanel({
  state,
  derived,
  actions,
}: {
  state: SimState
  derived: Derived
  actions: GoBackNActions
}) {
  const blocked = reasonToBlock(state, derived)
  const selected = derived.selectedFrame
  const rttTooLong = state.config.timeout < 2 * state.config.propagationDelay
  const seqBits = bitsForWindow(state.config.windowSize)

  return (
    <div className="space-y-4">
      <Panel accent="indigo" title="Panel de control" subtitle="Emisión y ejecución">
        <Button
          variant="primary"
          onClick={actions.send}
          disabled={!derived.canSend}
          className="w-full py-3 text-base"
          title="Atajo: barra espaciadora"
        >
          📨 Enviar nuevo paquete
          {derived.canSend && (
            <span className="ml-2 font-mono text-sm opacity-70">#{state.sender.nextSeq}</span>
          )}
        </Button>
        <p
          className={cx(
            'mt-2 text-[12px] leading-snug',
            blocked ? 'text-rose-600' : 'text-slate-600',
          )}
        >
          {blocked ?? 'La capa de red entrega un paquete nuevo al emisor y este lo transmite.'}
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button onClick={actions.toggleRunning} variant={state.running ? 'ghost' : 'success'}>
            {state.running ? '⏸ Pausar' : '▶ Reanudar'}
          </Button>
          <Button onClick={actions.restart}>↺ Reiniciar</Button>
        </div>

        {/* Paso a paso: recorrer el protocolo suceso a suceso en lugar de
            perseguir las tramas en movimiento. */}
        <Button
          onClick={actions.step}
          disabled={derived.next === null}
          className="mt-2 w-full text-left"
          title="Atajo: S o flecha derecha"
        >
          ⏭ Avanzar al próximo evento
          <span className="block text-[12px] font-normal opacity-70">
            {derived.next
              ? `en ${(derived.next.delay / 1000).toFixed(2)} s · ${derived.next.label}`
              : 'no hay nada pendiente en el canal'}
          </span>
        </Button>

        <label className="mt-3 flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <span className="text-sm text-slate-600">
            Envío automático
            <span className="block text-[12px] text-slate-600">
              el emisor mantiene la ventana llena
            </span>
          </span>
          <input
            type="checkbox"
            className="h-4 w-4 accent-indigo-500"
            checked={state.config.autoSend}
            onChange={(event) => actions.update({ autoSend: event.target.checked })}
          />
        </label>
      </Panel>

      <Panel title="Parámetros" subtitle="Configuración del protocolo y del canal">
        <div className="space-y-4">
          <Slider
            label="Tamaño de ventana N"
            value={state.config.windowSize}
            min={1}
            max={8}
            onChange={(windowSize) => actions.update({ windowSize })}
            format={(v) => `${v} trama${v === 1 ? '' : 's'}`}
            hint={
              state.config.windowSize === 1
                ? 'Con N = 1, Go-Back-N degenera en parada y espera (stop-and-wait).'
                : `Requiere ≥ ${seqBits} bits de secuencia, porque N ≤ 2^m − 1.`
            }
          />
          <Slider
            label="Tiempo de expiración (timeout)"
            value={state.config.timeout}
            min={1000}
            max={12000}
            step={250}
            onChange={(timeout) => actions.update({ timeout })}
            format={(v) => `${(v / 1000).toFixed(2)} s`}
            hint={
              rttTooLong
                ? '⚠ Menor que el RTT: habrá timeouts prematuros y retransmisiones inútiles.'
                : 'Debe superar al tiempo de ida y vuelta (RTT) más el proceso del receptor.'
            }
          />
          <Slider
            label="Velocidad de propagación"
            value={state.config.propagationDelay}
            min={400}
            max={3500}
            step={100}
            onChange={(propagationDelay) => actions.update({ propagationDelay })}
            format={(v) => `${(v / 1000).toFixed(1)} s de tránsito`}
            hint={`Tiempo que tarda una trama en cruzar el canal. RTT ≈ ${((state.config.propagationDelay * 2) / 1000).toFixed(1)} s.`}
          />
          <Slider
            label="Velocidad de la simulación"
            value={state.config.speed}
            min={0.25}
            max={3}
            step={0.25}
            onChange={(speed) => actions.update({ speed })}
            format={(v) => `×${v.toFixed(2)}`}
            hint="Acelera o ralentiza el reloj sin alterar la lógica del protocolo."
          />
        </div>
      </Panel>

      <Panel
        accent="rose"
        title="Provocar fallos"
        subtitle={
          state.running
            ? 'Actúan sobre la trama en tránsito'
            : 'En pausa se aplican al instante, sobre el punto exacto del canal'
        }
        aside={
          selected ? (
            <Tag tone="indigo">
              objetivo: {selected.kind} {selected.seq}
            </Tag>
          ) : null
        }
      >
        <div className="space-y-2">
          <Button variant="danger" onClick={actions.losePacket} className="w-full text-left">
            ✂ Provocar pérdida de paquete
            <span className="block text-[12px] font-normal opacity-70">
              El receptor nunca la verá: solo el timeout la recupera.
            </span>
          </Button>
          <Button variant="danger" onClick={actions.loseAck} className="w-full text-left">
            ✂ Provocar pérdida de ACK
            <span className="block text-[12px] font-normal opacity-70">
              Un ACK posterior puede confirmarla igual (acumulativo).
            </span>
          </Button>
          <Button variant="warning" onClick={actions.delayFrame} className="w-full text-left">
            🐢 Provocar retraso
            <span className="block text-[12px] font-normal opacity-70">
              Multiplica ×{DELAY_FACTOR} el tránsito y puede causar un timeout prematuro.
            </span>
          </Button>
        </div>
        <p className="mt-2 text-[12px] leading-snug text-slate-600">
          {selected ? (
            <>
              Se aplicarán a la trama seleccionada ({selected.kind} {selected.seq}).{' '}
            </>
          ) : (
            <>Se aplican a la última trama que salió al canal. </>
          )}
          Si no hay ninguna trama de ese tipo, el fallo queda <em>armado</em> y se aplicará a la
          siguiente.
          {!state.running && (
            <span className="mt-1 block text-amber-600">
              Con la simulación en pausa el efecto es inmediato: la trama se destruye en el punto en
              el que la ves, sin esperar a reanudar.
            </span>
          )}
        </p>
      </Panel>

      <Panel title="Atajos de teclado">
        <ul className="space-y-1 text-[12px] text-slate-600">
          {[
            ['Espacio', 'enviar paquete'],
            ['S  ·  →', 'avanzar al próximo evento'],
            ['X', 'perder paquete'],
            ['A', 'perder ACK'],
            ['D', 'retrasar trama'],
            ['P', 'pausar / reanudar'],
            ['R', 'reiniciar'],
          ].map(([key, description]) => (
            <li key={key} className="flex items-center gap-2">
              <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
                {key}
              </kbd>
              <span>{description}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}
