/**
 * Motor de simulación por eventos discretos del protocolo Go-Back-N.
 *
 * Este módulo es *puro*: no conoce React ni el DOM. Recibe un estado y
 * devuelve un estado nuevo. Toda la capa visual se construye leyendo este
 * estado, de modo que la animación no puede "inventar" comportamiento que el
 * protocolo no tenga.
 *
 * Máquina de estados implementada (Tanenbaum & Wetherall, "Redes de
 * Computadoras", 5.a ed., §3.4.2 "Protocolo de ventana deslizante con
 * retroceso N"; equivalente al AFD de Kurose & Ross §3.4.3):
 *
 *   EMISOR
 *     enviar(datos)   : si nextSeq < base + N -> transmite, arranca el
 *                       temporizador si base == nextSeq, nextSeq++
 *                       si no -> rechaza (ventana llena)
 *     recibe ACK n    : base = n + 1  (confirmación ACUMULATIVA)
 *                       si base == nextSeq -> detiene el temporizador
 *                       si no              -> lo reinicia
 *     timeout         : reinicia el temporizador y RETRANSMITE todas las
 *                       tramas de base .. nextSeq-1
 *
 *   RECEPTOR (ventana de recepción = 1)
 *     trama seq == expected : la entrega, expected++, envía ACK(seq)
 *     en otro caso          : la DESCARTA y reenvía el último ACK válido,
 *                             es decir ACK(expected - 1)
 */

import type {
  Frame,
  FrameKind,
  LogSource,
  OutboxItem,
  SimConfig,
  SimState,
  TraceRecord,
} from './types'

/** Nº de paquetes que la capa de red entrega al emisor (0..15). */
export const TOTAL_PACKETS = 16

/** Separación entre tramas de una misma ráfaga de retransmisión (ms sim.). */
const RETRANSMISSION_STAGGER = 110

/** Factor por el que se multiplica el trayecto restante al "provocar retraso". */
export const DELAY_FACTOR = 2.6

/** Tiempo que una trama permanece visible tras llegar / perderse (ms sim.). */
const ARRIVED_LINGER = 260
const LOST_LINGER = 900

/** Tope de entradas conservadas en la bitácora y en el diagrama temporal. */
const LOG_LIMIT = 220
const TRACE_LIMIT = 160

export const DEFAULT_CONFIG: SimConfig = {
  windowSize: 4,
  propagationDelay: 1400,
  timeout: 4000,
  totalPackets: TOTAL_PACKETS,
  autoSend: false,
  autoInterval: 900,
  speed: 1,
}

export function createState(config: Partial<SimConfig> = {}): SimState {
  const merged = { ...DEFAULT_CONFIG, ...config }
  return {
    time: 0,
    running: true,
    config: merged,
    sender: { base: 0, nextSeq: 0, timerStart: null, timerExpiry: null },
    receiver: { expected: 0, delivered: [], lastAckSent: null, lastRejected: null },
    frames: [],
    outbox: [],
    log: [
      {
        id: 0,
        time: 0,
        source: 'system',
        title: 'Simulación lista',
        detail: `Ventana N = ${merged.windowSize}. Pulsa «Enviar nuevo paquete» para transmitir la trama 0.`,
      },
    ],
    trace: [],
    timeoutMarks: [],
    stats: {
      dataSent: 0,
      retransmissions: 0,
      timeouts: 0,
      dataLost: 0,
      acksSent: 0,
      acksLost: 0,
      discarded: 0,
      duplicateAcks: 0,
    },
    traps: { dataLoss: false, ackLoss: false, delay: false },
    selectedFrameId: null,
    nextAutoSend: null,
    nextFrameId: 1,
    nextLogId: 1,
  }
}

/* ------------------------------------------------------------------ *
 * Utilidades                                                          *
 * ------------------------------------------------------------------ */

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** Progreso [0,1] de una trama sobre el canal en el instante `time`. */
export function frameProgress(frame: Frame, time: number): number {
  if (frame.status === 'ARRIVED') return 1
  const span = frame.arrival - frame.departure
  const raw = span <= 0 ? 1 : (time - frame.departure) / span
  if (frame.status === 'LOST' && frame.lossProgress !== null) {
    return Math.min(frame.lossProgress, clamp01(raw))
  }
  return clamp01(raw)
}

/** Fracción transcurrida del temporizador [0,1]; 0 si está detenido. */
export function timerProgress(state: SimState): number {
  const { timerStart, timerExpiry } = state.sender
  if (timerStart === null || timerExpiry === null) return 0
  return clamp01((state.time - timerStart) / (timerExpiry - timerStart))
}

/** ¿Hay hueco en la ventana y paquetes pendientes por enviar? */
export function canSend(state: SimState): boolean {
  const { base, nextSeq } = state.sender
  return nextSeq < base + state.config.windowSize && nextSeq < state.config.totalPackets
}

export function isWindowFull(state: SimState): boolean {
  return state.sender.nextSeq >= state.sender.base + state.config.windowSize
}

/** Copia superficial pero segura para React: nuevas referencias por rama. */
function clone(state: SimState): SimState {
  return {
    ...state,
    config: { ...state.config },
    sender: { ...state.sender },
    receiver: { ...state.receiver, delivered: state.receiver.delivered.slice() },
    frames: state.frames.map((f) => ({ ...f })),
    outbox: state.outbox.slice(),
    log: state.log.slice(),
    trace: state.trace.slice(),
    timeoutMarks: state.timeoutMarks.slice(),
    stats: { ...state.stats },
    traps: { ...state.traps },
  }
}

function log(state: SimState, source: LogSource, title: string, detail?: string): void {
  state.log = [{ id: state.nextLogId++, time: state.time, source, title, detail }, ...state.log]
  if (state.log.length > LOG_LIMIT) state.log.length = LOG_LIMIT
}

function windowLabel(state: SimState): string {
  const { base } = state.sender
  const last = Math.min(base + state.config.windowSize - 1, state.config.totalPackets - 1)
  return base >= state.config.totalPackets ? '[—]' : `[${base}..${last}]`
}

function startTimer(state: SimState): void {
  state.sender.timerStart = state.time
  state.sender.timerExpiry = state.time + state.config.timeout
}

function stopTimer(state: SimState): void {
  state.sender.timerStart = null
  state.sender.timerExpiry = null
}

function enqueue(
  state: SimState,
  kind: FrameKind,
  seq: number,
  at: number,
  isRetransmission = false,
): void {
  const item: OutboxItem = { id: state.nextFrameId++, kind, seq, at, isRetransmission }
  state.outbox = [...state.outbox, item]
}

function pushTrace(state: SimState, record: TraceRecord): void {
  state.trace = [...state.trace, record]
  if (state.trace.length > TRACE_LIMIT) state.trace = state.trace.slice(-TRACE_LIMIT)
}

function updateTrace(state: SimState, frameId: number, patch: Partial<TraceRecord>): void {
  state.trace = state.trace.map((r) => (r.frameId === frameId ? { ...r, ...patch } : r))
}

/* ------------------------------------------------------------------ *
 * Eventos discretos                                                   *
 * ------------------------------------------------------------------ */

/** Materializa una trama del outbox: entra al canal y empieza a propagarse. */
function launch(state: SimState, item: OutboxItem): void {
  let duration = state.config.propagationDelay
  let delayed = false

  // Trampa de retraso armada: se aplica a la próxima trama de datos.
  if (item.kind === 'DATA' && state.traps.delay) {
    duration *= DELAY_FACTOR
    delayed = true
    state.traps.delay = false
  }

  const frame: Frame = {
    id: item.id,
    kind: item.kind,
    seq: item.seq,
    departure: state.time,
    arrival: state.time + duration,
    isRetransmission: item.isRetransmission,
    delayed,
    status: 'IN_FLIGHT',
    lossProgress: null,
    deathTime: null,
    settledAt: null,
  }

  // Trampa de pérdida armada para este tipo de trama.
  const trapped = item.kind === 'DATA' ? state.traps.dataLoss : state.traps.ackLoss
  if (trapped) {
    const p = 0.32 + Math.random() * 0.3
    frame.lossProgress = p
    frame.deathTime = frame.departure + duration * p
    if (item.kind === 'DATA') state.traps.dataLoss = false
    else state.traps.ackLoss = false
  }

  state.frames = [...state.frames, frame]
  pushTrace(state, {
    frameId: frame.id,
    kind: frame.kind,
    seq: frame.seq,
    t0: frame.departure,
    t1: frame.deathTime ?? frame.arrival,
    lost: frame.deathTime !== null,
    lossProgress: frame.lossProgress ?? 1,
    isRetransmission: frame.isRetransmission,
  })

  if (item.kind === 'DATA') {
    if (item.isRetransmission) state.stats.retransmissions++
    else state.stats.dataSent++
    log(
      state,
      'sender',
      `${item.isRetransmission ? 'Retransmite' : 'Transmite'} trama DATA ${item.seq}`,
      `Ventana ${windowLabel(state)} · base = ${state.sender.base} · nextSeq = ${state.sender.nextSeq}` +
        (delayed ? ' · el canal la retrasará' : ''),
    )
  } else {
    state.stats.acksSent++
    log(
      state,
      'receiver',
      `Envía ACK ${item.seq}`,
      `Confirmación acumulativa: reconoce todas las tramas 0..${item.seq}.`,
    )
  }
}

/** Una trama muere en mitad del canal. */
function die(state: SimState, frame: Frame): void {
  frame.status = 'LOST'
  frame.settledAt = state.time
  if (frame.kind === 'DATA') state.stats.dataLost++
  else state.stats.acksLost++
  log(
    state,
    'channel',
    `${frame.kind === 'DATA' ? 'Trama DATA' : 'ACK'} ${frame.seq} PERDIDA en el canal`,
    frame.kind === 'DATA'
      ? 'El receptor nunca la verá: solo el temporizador del emisor podrá recuperarla.'
      : 'El emisor no se entera de que la trama sí llegó; un ACK posterior puede confirmarla igualmente.',
  )
}

/** Llegada de una trama de datos al receptor. */
function receiveData(state: SimState, frame: Frame): void {
  const { expected } = state.receiver

  if (frame.seq === expected) {
    state.receiver.delivered = [...state.receiver.delivered, frame.seq]
    state.receiver.expected = expected + 1
    state.receiver.lastAckSent = frame.seq
    state.receiver.lastRejected = null
    log(
      state,
      'receiver',
      `Acepta la trama ${frame.seq}`,
      `Coincide con expectedSeqNum = ${expected}: se entrega a la capa de red y expectedSeqNum pasa a ${expected + 1}.`,
    )
    enqueue(state, 'ACK', frame.seq, state.time)
    return
  }

  state.stats.discarded++
  state.receiver.lastRejected = frame.seq
  if (expected === 0) {
    log(
      state,
      'receiver',
      `Descarta la trama ${frame.seq} (fuera de orden)`,
      'Esperaba la trama 0 y todavía no hay ningún ACK previo que reenviar.',
    )
    return
  }

  const lastValid = expected - 1
  state.receiver.lastAckSent = lastValid
  log(
    state,
    'receiver',
    `Descarta la trama ${frame.seq} (fuera de orden)`,
    `Su ventana de recepción es de tamaño 1 y esperaba ${expected}. Reenvía el último ACK válido: ACK ${lastValid}.`,
  )
  enqueue(state, 'ACK', lastValid, state.time)
}

/** Llegada de un ACK al emisor: confirmación acumulativa. */
function receiveAck(state: SimState, frame: Frame): void {
  const n = frame.seq
  const { base, nextSeq } = state.sender

  if (n >= base && n < nextSeq) {
    const confirmed = n + 1 - base
    state.sender.base = n + 1
    log(
      state,
      'sender',
      `Recibe ACK ${n} · la ventana se desliza`,
      `ACK acumulativo: confirma ${confirmed} trama(s) (${base}..${n}). base = ${n + 1}, ventana ${windowLabel(state)}.`,
    )
    if (state.sender.base === state.sender.nextSeq) {
      stopTimer(state)
      log(state, 'timer', 'Temporizador detenido', 'No quedan tramas pendientes de confirmación.')
    } else {
      startTimer(state)
      log(
        state,
        'timer',
        `Temporizador reiniciado para la trama ${state.sender.base}`,
        `Expira dentro de ${(state.config.timeout / 1000).toFixed(1)} s si no llega su ACK.`,
      )
    }
    return
  }

  state.stats.duplicateAcks++
  log(
    state,
    'sender',
    `ACK ${n} duplicado / obsoleto`,
    `base ya vale ${base}: este ACK no aporta información nueva y se ignora. La ventana no se mueve.`,
  )
}

/** Expira el temporizador de la trama base: retroceso N. */
function fireTimeout(state: SimState): void {
  const { base, nextSeq } = state.sender
  const pending = nextSeq - base
  if (pending <= 0) {
    stopTimer(state)
    return
  }

  state.stats.timeouts++
  state.timeoutMarks = [
    ...state.timeoutMarks,
    { id: state.nextFrameId++, time: state.time, base, count: pending },
  ].slice(-40)

  log(
    state,
    'timer',
    `TIMEOUT de la trama ${base}`,
    `Retroceso N: se retransmiten las ${pending} trama(s) no confirmadas ${base}..${nextSeq - 1}.`,
  )

  for (let i = 0; i < pending; i++) {
    enqueue(state, 'DATA', base + i, state.time + i * RETRANSMISSION_STAGGER, true)
  }
  startTimer(state)
}

/* ------------------------------------------------------------------ *
 * Avance del reloj                                                    *
 * ------------------------------------------------------------------ */

type PendingEvent =
  | { t: number; kind: 'launch'; item: OutboxItem }
  | { t: number; kind: 'arrival'; frame: Frame }
  | { t: number; kind: 'death'; frame: Frame }
  | { t: number; kind: 'timeout' }
  | { t: number; kind: 'autosend' }

/** Próximo evento discreto que ocurre en el intervalo (—, `end`]. */
function findNextEvent(state: SimState, end: number): PendingEvent | null {
  let next: PendingEvent | null = null
  const consider = (event: PendingEvent) => {
    if (event.t <= end && (next === null || event.t < next.t)) next = event
  }

  for (const item of state.outbox) consider({ t: item.at, kind: 'launch', item })
  for (const frame of state.frames) {
    if (frame.status !== 'IN_FLIGHT') continue
    if (frame.deathTime !== null) consider({ t: frame.deathTime, kind: 'death', frame })
    else consider({ t: frame.arrival, kind: 'arrival', frame })
  }
  if (state.sender.timerExpiry !== null) consider({ t: state.sender.timerExpiry, kind: 'timeout' })
  if (state.config.autoSend && state.nextAutoSend !== null) {
    consider({ t: state.nextAutoSend, kind: 'autosend' })
  }

  return next
}

/**
 * Ejecuta `dtSim` milisegundos de tiempo simulado sobre un borrador ya clonado,
 * procesando los eventos en orden cronológico estricto.
 */
function run(state: SimState, dtSim: number): SimState {
  const end = state.time + dtSim

  for (let guard = 0; guard < 500; guard++) {
    const event = findNextEvent(state, end)
    if (event === null) break
    state.time = Math.max(state.time, event.t)

    switch (event.kind) {
      case 'launch': {
        state.outbox = state.outbox.filter((o) => o.id !== event.item.id)
        launch(state, event.item)
        break
      }
      case 'death': {
        die(state, event.frame)
        break
      }
      case 'arrival': {
        event.frame.status = 'ARRIVED'
        event.frame.settledAt = state.time
        if (event.frame.kind === 'DATA') receiveData(state, event.frame)
        else receiveAck(state, event.frame)
        break
      }
      case 'timeout': {
        fireTimeout(state)
        break
      }
      case 'autosend': {
        state.nextAutoSend = state.time + state.config.autoInterval
        if (canSend(state)) transmitNext(state)
        break
      }
    }
  }

  state.time = end

  // Barrido de tramas ya asentadas (permanecen un instante para la animación).
  state.frames = state.frames.filter((f) => {
    if (f.settledAt === null) return true
    const linger = f.status === 'LOST' ? LOST_LINGER : ARRIVED_LINGER
    return state.time - f.settledAt < linger
  })
  if (state.selectedFrameId !== null && !state.frames.some((f) => f.id === state.selectedFrameId)) {
    state.selectedFrameId = null
  }

  return state
}

/**
 * Avanza la simulación `dtReal` ms de reloj de pared. El resultado no depende
 * de la tasa de refresco: la animación y la lógica comparten el mismo reloj.
 */
export function advance(prev: SimState, dtReal: number): SimState {
  if (!prev.running) return prev
  // Un cambio de pestaña puede producir un dt enorme; se acota.
  const dt = Math.min(Math.max(dtReal, 0), 120) * prev.config.speed
  if (dt <= 0) return prev
  return run(clone(prev), dt)
}

/** Anuncio del próximo evento, para el modo paso a paso. */
export interface UpcomingEvent {
  /** Instante de simulación en que ocurrirá (ms). */
  time: number
  /** Tiempo que falta desde ahora (ms). */
  delay: number
  label: string
}

function describeEvent(state: SimState, event: PendingEvent): string {
  switch (event.kind) {
    case 'launch':
      return event.item.kind === 'DATA'
        ? `sale al canal la trama DATA ${event.item.seq}`
        : `sale al canal el ACK ${event.item.seq}`
    case 'arrival':
      return event.frame.kind === 'DATA'
        ? `llega la trama DATA ${event.frame.seq} al receptor`
        : `llega el ACK ${event.frame.seq} al emisor`
    case 'death':
      return event.frame.kind === 'DATA'
        ? `se destruye la trama DATA ${event.frame.seq} en el canal`
        : `se destruye el ACK ${event.frame.seq} en el canal`
    case 'timeout':
      return `expira el temporizador de la trama ${state.sender.base}`
    default:
      return `envío automático de la trama ${state.sender.nextSeq}`
  }
}

/** Qué ocurrirá a continuación, o null si la simulación está a la espera. */
export function upcomingEvent(state: SimState): UpcomingEvent | null {
  const event = findNextEvent(state, Number.POSITIVE_INFINITY)
  if (event === null) return null
  return {
    time: event.t,
    delay: Math.max(0, event.t - state.time),
    label: describeEvent(state, event),
  }
}

/**
 * Modo paso a paso: adelanta el reloj justo hasta el próximo evento discreto,
 * aunque la simulación esté en pausa. Permite recorrer el protocolo suceso a
 * suceso en lugar de perseguir las tramas en movimiento.
 */
export function stepToNextEvent(prev: SimState): SimState {
  const event = findNextEvent(prev, Number.POSITIVE_INFINITY)
  if (event === null) {
    const state = clone(prev)
    log(
      state,
      'system',
      'No hay ningún evento pendiente',
      'El canal está vacío y ningún temporizador corre: envía un paquete para que ocurra algo.',
    )
    return state
  }
  return run(clone(prev), Math.max(0, event.t - prev.time))
}

/**
 * Qué le ocurrirá a una trama cuando alcance su destino, suponiendo que nada
 * más cambie. Proyecta el estado del receptor (o del emisor, para los ACK)
 * teniendo en cuenta las tramas que llegarán antes que ella.
 *
 * Es una predicción, no una certeza: un timeout intermedio o un retraso
 * posterior pueden alterar el orden de llegada.
 */
export function predictOutcome(state: SimState, frame: Frame): string {
  if (frame.status === 'LOST') return 'Destruida en el canal: nunca llegó a su destino.'
  if (frame.status === 'ARRIVED') return 'Ya ha llegado a su destino.'
  if (frame.deathTime !== null) {
    return `Se destruirá en el canal, al ${Math.round((frame.lossProgress ?? 0) * 100)} % del trayecto.`
  }

  /** Tramas del mismo tipo que llegarán antes que esta y no se van a perder. */
  const arrivingBefore = state.frames.filter(
    (f) =>
      f.id !== frame.id &&
      f.kind === frame.kind &&
      f.status === 'IN_FLIGHT' &&
      f.deathTime === null &&
      f.arrival < frame.arrival,
  )

  if (frame.kind === 'DATA') {
    let expected = state.receiver.expected
    for (const other of arrivingBefore) if (other.seq === expected) expected++

    if (frame.seq === expected) {
      return `Será ACEPTADA: el receptor estará esperando la ${expected}. La entregará a la capa de red y responderá con ACK ${frame.seq}.`
    }
    return expected === 0
      ? 'Será DESCARTADA por estar fuera de orden: el receptor espera la trama 0 y todavía no tiene ningún ACK previo que reenviar.'
      : `Será DESCARTADA por estar fuera de orden (el receptor estará esperando la ${expected}) y reenviará el último ACK válido, ACK ${expected - 1}.`
  }

  let base = state.sender.base
  for (const other of arrivingBefore) {
    if (other.seq >= base && other.seq < state.sender.nextSeq) base = other.seq + 1
  }
  if (frame.seq >= base && frame.seq < state.sender.nextSeq) {
    const confirmed = frame.seq + 1 - base
    return `Confirmará ${confirmed} trama(s) (${base}..${frame.seq}): base pasará a ${frame.seq + 1} y la ventana se deslizará.`
  }
  return `Llegará como ACK duplicado (base ya valdrá ${base}): el emisor lo ignorará y la ventana no se moverá.`
}

/* ------------------------------------------------------------------ *
 * Comandos (acciones del usuario)                                     *
 * ------------------------------------------------------------------ */

/** Envía la siguiente trama disponible. Muta el borrador recibido. */
function transmitNext(state: SimState): void {
  const seq = state.sender.nextSeq
  const startsTimer = state.sender.base === state.sender.nextSeq
  state.sender.nextSeq = seq + 1
  // Se lanza al canal en el acto (y no por el outbox) para que la trama sea
  // un objetivo válido de los botones de fallo inmediatamente después.
  launch(state, {
    id: state.nextFrameId++,
    kind: 'DATA',
    seq,
    at: state.time,
    isRetransmission: false,
  })
  if (startsTimer) {
    startTimer(state)
    log(
      state,
      'timer',
      `Temporizador arrancado para la trama ${seq}`,
      `Expira en ${(state.config.timeout / 1000).toFixed(1)} s. Solo la trama base lleva temporizador.`,
    )
  }
}

export function sendPacket(prev: SimState): SimState {
  const state = clone(prev)
  if (!canSend(prev)) {
    log(
      state,
      'sender',
      'Envío rechazado',
      isWindowFull(prev)
        ? `Ventana llena: hay ${prev.sender.nextSeq - prev.sender.base} trama(s) sin confirmar y N = ${prev.config.windowSize}.`
        : 'No quedan paquetes pendientes en la capa de red.',
    )
    return state
  }
  transmitNext(state)
  return state
}

/** Elige la trama sobre la que actuará un fallo provocado. */
function pickTarget(state: SimState, kind: FrameKind | 'ANY'): Frame | null {
  const inFlight = state.frames.filter(
    (f) => f.status === 'IN_FLIGHT' && f.deathTime === null && (kind === 'ANY' || f.kind === kind),
  )
  if (inFlight.length === 0) return null

  // Una selección explícita manda siempre: si el usuario ha pinchado una trama
  // (algo cómodo de hacer con la simulación en pausa), el fallo va sobre ella.
  const selected = inFlight.find((f) => f.id === state.selectedFrameId)
  if (selected) return selected

  // Si no, la más reciente de las que aún tienen recorrido por delante.
  const eligible = inFlight.filter((f) => frameProgress(f, state.time) < 0.88)
  if (eligible.length === 0) return null
  return eligible.reduce((a, b) => (b.departure >= a.departure ? b : a))
}

/** Nombre legible de una trama para la bitácora. */
const frameLabel = (frame: Frame) =>
  frame.kind === 'DATA' ? `la trama DATA ${frame.seq}` : `el ACK ${frame.seq}`

function injectLoss(prev: SimState, kind: FrameKind): SimState {
  const state = clone(prev)
  const target = pickTarget(state, kind)
  const label = kind === 'DATA' ? 'trama de datos' : 'confirmación (ACK)'

  if (!target) {
    if (kind === 'DATA') state.traps.dataLoss = true
    else state.traps.ackLoss = true
    log(
      state,
      'channel',
      `Fallo armado: se perderá la próxima ${label}`,
      'Ahora mismo no viaja ninguna trama de ese tipo, así que el fallo queda preparado en el canal.',
    )
    return state
  }

  const progress = frameProgress(target, state.time)

  // Con la simulación en pausa el fallo se aplica en el acto, sobre el punto
  // exacto del canal donde el estudiante ve la trama; no queda pendiente de
  // que el reloj avance.
  if (!state.running) {
    const lossProgress = Math.min(0.97, Math.max(progress, 0.04))
    target.lossProgress = lossProgress
    target.deathTime = state.time
    updateTrace(state, target.id, { lost: true, lossProgress, t1: state.time })
    log(
      state,
      'channel',
      `Se provoca la pérdida de ${frameLabel(target)}`,
      `Simulación en pausa: la trama se destruye aquí mismo, al ${Math.round(lossProgress * 100)} % del trayecto.`,
    )
    die(state, target)
    return state
  }

  const lossProgress = Math.min(0.9, Math.max(progress + 0.1, 0.22))
  target.lossProgress = lossProgress
  target.deathTime = target.departure + (target.arrival - target.departure) * lossProgress
  updateTrace(state, target.id, { lost: true, lossProgress, t1: target.deathTime })
  log(
    state,
    'channel',
    `Se provoca la pérdida de ${frameLabel(target)}`,
    'La trama se destruirá antes de alcanzar el otro extremo.',
  )
  return state
}

export const causePacketLoss = (state: SimState) => injectLoss(state, 'DATA')
export const causeAckLoss = (state: SimState) => injectLoss(state, 'ACK')

/**
 * Alarga el trayecto que le queda a una trama SIN moverla de sitio.
 *
 * La posición se interpola entre `departure` y `arrival`, así que alargar solo
 * `arrival` haría retroceder la trama en pantalla. Se recalcula por eso una
 * salida virtual que mantiene intacto el progreso actual y ralentiza únicamente
 * el tramo pendiente. Devuelve el retraso añadido en ms.
 */
function stretchRemaining(frame: Frame, now: number, factor: number): number {
  const progress = frameProgress(frame, now)
  const extra = Math.max(0, frame.arrival - now) * (factor - 1)
  const arrival = frame.arrival + extra
  if (progress > 0 && progress < 1) {
    frame.departure = (now - progress * arrival) / (1 - progress)
  }
  frame.arrival = arrival
  return extra
}

export function causeDelay(prev: SimState): SimState {
  const state = clone(prev)
  const target = pickTarget(state, 'ANY')

  if (!target) {
    state.traps.delay = true
    log(
      state,
      'channel',
      'Fallo armado: la próxima trama de datos sufrirá un retraso',
      `Su tiempo de propagación se multiplicará por ${DELAY_FACTOR}.`,
    )
    return state
  }

  const extra = stretchRemaining(target, state.time, DELAY_FACTOR)
  target.delayed = true
  updateTrace(state, target.id, { t1: target.arrival })
  log(
    state,
    'channel',
    `Se retrasa ${frameLabel(target)}`,
    `Llegará ${(extra / 1000).toFixed(1)} s más tarde (a los ${(target.arrival / 1000).toFixed(1)} s). ` +
      'Si el retraso supera al temporizador habrá un timeout prematuro y tramas duplicadas.',
  )
  return state
}

export function setConfig(prev: SimState, patch: Partial<SimConfig>): SimState {
  const state = clone(prev)
  state.config = { ...state.config, ...patch }

  // El temporizador en curso se recalcula sobre el nuevo timeout.
  if (patch.timeout !== undefined && state.sender.timerStart !== null) {
    state.sender.timerExpiry = state.sender.timerStart + patch.timeout
  }
  if (patch.autoSend !== undefined) {
    state.nextAutoSend = patch.autoSend ? state.time : null
    log(
      state,
      'system',
      patch.autoSend ? 'Modo automático activado' : 'Modo automático desactivado',
      patch.autoSend ? 'El emisor llenará la ventana por sí mismo.' : undefined,
    )
  }
  if (patch.windowSize !== undefined && patch.windowSize !== prev.config.windowSize) {
    log(
      state,
      'system',
      `Tamaño de ventana N = ${patch.windowSize}`,
      `Ventana de envío ${windowLabel(state)}. El receptor mantiene siempre una ventana de tamaño 1.`,
    )
  }
  return state
}

export function setRunning(prev: SimState, running: boolean): SimState {
  const state = clone(prev)
  state.running = running
  log(state, 'system', running ? 'Simulación reanudada' : 'Simulación en pausa')
  return state
}

export function selectFrame(prev: SimState, id: number | null): SimState {
  return { ...prev, selectedFrameId: prev.selectedFrameId === id ? null : id }
}

export function reset(prev: SimState): SimState {
  return createState(prev.config)
}
