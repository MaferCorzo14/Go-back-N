/**
 * Puente entre el motor de simulación (lógica pura) y React.
 *
 * El hook posee tres responsabilidades y ninguna más:
 *   1. mantener el estado del protocolo,
 *   2. avanzar el reloj de simulación con requestAnimationFrame,
 *   3. exponer comandos y valores derivados a la capa visual.
 *
 * Los componentes no calculan nada del protocolo: solo dibujan este estado.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  advance,
  canSend as engineCanSend,
  causeAckLoss,
  causeDelay,
  causePacketLoss,
  createState,
  isWindowFull,
  reset,
  selectFrame,
  sendPacket,
  setConfig,
  setRunning,
  stepToNextEvent,
  timerProgress,
  upcomingEvent,
} from '../simulation/engine'
import type { UpcomingEvent } from '../simulation/engine'
import type { Frame, SimConfig, SimState } from '../simulation/types'

/** Situación de un paquete dentro del búfer del emisor. */
export type PacketState =
  /** Confirmado: seq < base. Ya salió de la ventana. */
  | 'ACKED'
  /** Enviado y sin confirmar: base ≤ seq < nextSeq. */
  | 'OUTSTANDING'
  /** Dentro de la ventana y todavía sin enviar: nextSeq ≤ seq < base + N. */
  | 'USABLE'
  /** Fuera de la ventana: no se puede transmitir todavía. */
  | 'BLOCKED'

export interface PacketView {
  seq: number
  state: PacketState
  inWindow: boolean
  inFlight: boolean
  retransmitting: boolean
}

export interface Derived {
  packets: PacketView[]
  canSend: boolean
  windowFull: boolean
  outstanding: number
  windowEnd: number
  complete: boolean
  timerFraction: number
  timerRemaining: number
  totalTransmissions: number
  efficiency: number
  inFlightData: number
  inFlightAcks: number
  /** Trama seleccionada en el canal, si sigue existiendo. */
  selectedFrame: Frame | null
  /** Próximo suceso del protocolo; alimenta el modo paso a paso. */
  next: UpcomingEvent | null
}

export interface GoBackNActions {
  send: () => void
  losePacket: () => void
  loseAck: () => void
  delayFrame: () => void
  update: (patch: Partial<SimConfig>) => void
  toggleRunning: () => void
  /** Adelanta el reloj hasta el próximo evento, incluso en pausa. */
  step: () => void
  restart: () => void
  select: (id: number | null) => void
}

export interface UseGoBackN {
  state: SimState
  derived: Derived
  actions: GoBackNActions
}

export function useGoBackN(initialConfig?: Partial<SimConfig>): UseGoBackN {
  const [state, setState] = useState<SimState>(() => createState(initialConfig))
  const frameRef = useRef(0)

  // Reloj de simulación: un único bucle rAF alimenta al motor con el delta
  // real transcurrido, así el tiempo de tránsito en pantalla es exactamente
  // el retardo de propagación configurado.
  useEffect(() => {
    let last = performance.now()
    const loop = (now: number) => {
      const dt = now - last
      last = now
      setState((prev) => advance(prev, dt))
      frameRef.current = requestAnimationFrame(loop)
    }
    frameRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frameRef.current)
  }, [])

  const actions = useMemo<GoBackNActions>(
    () => ({
      send: () => setState(sendPacket),
      losePacket: () => setState(causePacketLoss),
      loseAck: () => setState(causeAckLoss),
      delayFrame: () => setState(causeDelay),
      update: (patch) => setState((prev) => setConfig(prev, patch)),
      toggleRunning: () => setState((prev) => setRunning(prev, !prev.running)),
      step: () => setState(stepToNextEvent),
      restart: () => setState(reset),
      select: (id) => setState((prev) => selectFrame(prev, id)),
    }),
    [],
  )

  const derived = useMemo<Derived>(() => {
    const { base, nextSeq } = state.sender
    const { windowSize, totalPackets } = state.config
    const windowEnd = Math.min(base + windowSize, totalPackets)

    const flying = state.frames.filter((f) => f.kind === 'DATA' && f.status === 'IN_FLIGHT')

    const packets: PacketView[] = Array.from({ length: totalPackets }, (_, seq) => {
      const flight = flying.find((f) => f.seq === seq)
      let packetState: PacketState = 'BLOCKED'
      if (seq < base) packetState = 'ACKED'
      else if (seq < nextSeq) packetState = 'OUTSTANDING'
      else if (seq < base + windowSize) packetState = 'USABLE'
      return {
        seq,
        state: packetState,
        inWindow: seq >= base && seq < base + windowSize,
        inFlight: flight !== undefined,
        retransmitting: flight?.isRetransmission ?? false,
      }
    })

    const totalTransmissions = state.stats.dataSent + state.stats.retransmissions
    const timerFraction = timerProgress(state)

    return {
      packets,
      canSend: engineCanSend(state),
      windowFull: isWindowFull(state),
      outstanding: nextSeq - base,
      windowEnd,
      complete: base >= totalPackets,
      timerFraction,
      timerRemaining:
        state.sender.timerExpiry === null ? 0 : Math.max(0, state.sender.timerExpiry - state.time),
      totalTransmissions,
      efficiency: totalTransmissions === 0 ? 0 : state.receiver.delivered.length / totalTransmissions,
      inFlightData: flying.length,
      inFlightAcks: state.frames.filter((f) => f.kind === 'ACK' && f.status === 'IN_FLIGHT').length,
      selectedFrame: state.frames.find((f) => f.id === state.selectedFrameId) ?? null,
      next: upcomingEvent(state),
    }
  }, [state])

  return { state, derived, actions }
}

/** Atajos de teclado del simulador (barra espaciadora = enviar, etc.). */
export function useKeyboardShortcuts(actions: GoBackNActions): void {
  const handler = useCallback(
    (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      // La barra espaciadora llega como ' ' o como 'Space' según el navegador.
      const key = event.key === ' ' || event.code === 'Space' ? 'space' : event.key.toLowerCase()
      switch (key) {
        case 'space':
        case 'enter':
          event.preventDefault()
          actions.send()
          break
        case 'p':
          actions.toggleRunning()
          break
        case 's':
        case 'arrowright':
          event.preventDefault()
          actions.step()
          break
        case 'x':
          actions.losePacket()
          break
        case 'a':
          actions.loseAck()
          break
        case 'd':
          actions.delayFrame()
          break
        case 'r':
          actions.restart()
          break
      }
    },
    [actions],
  )

  useEffect(() => {
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handler])
}
