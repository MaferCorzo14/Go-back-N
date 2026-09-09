/**
 * Tipos del modelo de simulación Go-Back-N.
 *
 * El vocabulario sigue a Tanenbaum & Wetherall, "Redes de Computadoras"
 * (5.a ed., §3.4 "Protocolos de ventana deslizante"): el emisor mantiene una
 * ventana de envío de tamaño N, el receptor una ventana de recepción de
 * tamaño 1, y los ACK son acumulativos.
 */

/** Una trama viaja por el canal o bien como dato o bien como confirmación. */
export type FrameKind = 'DATA' | 'ACK'

/** Ciclo de vida de una trama dentro del canal. */
export type FrameStatus = 'IN_FLIGHT' | 'ARRIVED' | 'LOST'

/** Quién origina una entrada de la bitácora (define el color en la UI). */
export type LogSource = 'sender' | 'receiver' | 'channel' | 'timer' | 'system'

/** Trama en tránsito por el canal de comunicación. */
export interface Frame {
  id: number
  kind: FrameKind
  /** Nº de secuencia (DATA) o nº de trama confirmada (ACK acumulativo). */
  seq: number
  /** Instante de simulación en que la trama entró al canal (ms). */
  departure: number
  /** Instante de simulación en que llegaría al otro extremo (ms). */
  arrival: number
  isRetransmission: boolean
  /** true si se le aplicó un retraso artificial en el canal. */
  delayed: boolean
  status: FrameStatus
  /** Fracción del trayecto [0,1] en la que la trama se pierde, si aplica. */
  lossProgress: number | null
  /** Instante en que la trama se destruye en el canal (ms), si aplica. */
  deathTime: number | null
  /** Instante en que llegó o murió; se usa para el barrido y la animación. */
  settledAt: number | null
}

/** Trama programada para entrar al canal en el instante `at`. */
export interface OutboxItem {
  id: number
  kind: FrameKind
  seq: number
  at: number
  isRetransmission: boolean
}

export interface LogEntry {
  id: number
  time: number
  source: LogSource
  title: string
  detail?: string
}

/** Registro histórico para el diagrama espacio-tiempo (estilo Tanenbaum). */
export interface TraceRecord {
  frameId: number
  kind: FrameKind
  seq: number
  t0: number
  t1: number
  lost: boolean
  lossProgress: number
  isRetransmission: boolean
}

/** Marca de expiración del temporizador, dibujada sobre el eje del emisor. */
export interface TimeoutMark {
  id: number
  time: number
  base: number
  count: number
}

export interface SimConfig {
  /** Tamaño N de la ventana del emisor. */
  windowSize: number
  /** Retardo de propagación de ida, en ms de simulación. */
  propagationDelay: number
  /** Tiempo de expiración del temporizador, en ms de simulación. */
  timeout: number
  /** Nº total de paquetes que la capa de red entrega al emisor. */
  totalPackets: number
  /** Envío automático de paquetes mientras la ventana tenga hueco. */
  autoSend: boolean
  /** Separación entre envíos automáticos (ms). */
  autoInterval: number
  /** Multiplicador del reloj de simulación. */
  speed: number
}

export interface SenderState {
  /** Primera trama enviada y aún no confirmada. */
  base: number
  /** Siguiente nº de secuencia libre. */
  nextSeq: number
  /** Instante en que arrancó el temporizador de `base` (null = detenido). */
  timerStart: number | null
  /** Instante de expiración del temporizador (null = detenido). */
  timerExpiry: number | null
}

export interface ReceiverState {
  /** expectedSeqNum: única trama que el receptor aceptará. */
  expected: number
  /** Tramas entregadas a la capa de red, en orden. */
  delivered: number[]
  /** Último ACK emitido (null si aún no emitió ninguno). */
  lastAckSent: number | null
  /** Nº de secuencia de la última trama rechazada (para resaltarla). */
  lastRejected: number | null
}

/** Fallos "armados" que se aplicarán a la próxima trama de cada tipo. */
export interface Traps {
  dataLoss: boolean
  ackLoss: boolean
  delay: boolean
}

export interface Stats {
  dataSent: number
  retransmissions: number
  timeouts: number
  dataLost: number
  acksSent: number
  acksLost: number
  discarded: number
  duplicateAcks: number
}

export interface SimState {
  /** Reloj de simulación en ms. */
  time: number
  running: boolean
  config: SimConfig
  sender: SenderState
  receiver: ReceiverState
  frames: Frame[]
  outbox: OutboxItem[]
  log: LogEntry[]
  trace: TraceRecord[]
  timeoutMarks: TimeoutMark[]
  stats: Stats
  traps: Traps
  /** Trama seleccionada en el canal, objetivo preferente de los fallos. */
  selectedFrameId: number | null
  /** Próximo envío automático (null si el modo automático está apagado). */
  nextAutoSend: number | null
  nextFrameId: number
  nextLogId: number
}
