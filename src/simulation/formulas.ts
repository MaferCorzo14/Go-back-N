/**
 * Fórmulas de rendimiento de los protocolos de ventana deslizante.
 *
 * Fuentes (ver también la sección «Teoría y fórmulas» de la interfaz):
 *
 *  [T]  A. S. Tanenbaum y D. J. Wetherall, *Redes de Computadoras*, 5.a ed.,
 *       Pearson, 2012. §3.4 «Protocolos de ventana deslizante»: eficiencia del
 *       canal con parada y espera, ventana necesaria para llenar la tubería
 *       («pipelining») y §3.4.2, restricción del espacio de secuencia en
 *       retroceso N.
 *  [S]  W. Stallings, *Comunicaciones y Redes de Computadores*, 7.a ed.,
 *       Pearson, 2004. §7.4 «Rendimiento de ARQ»: utilización de parada y
 *       espera y de retroceso N en presencia de errores.
 *  [KR] J. F. Kurose y K. W. Ross, *Redes de Computadoras: un enfoque
 *       descendente*, §3.4.3: autómata del emisor y del receptor de GBN.
 */

export interface LinkParams {
  /** Velocidad del enlace en bits por segundo. */
  bitrate: number
  /** Tamaño de la trama en bits. */
  frameBits: number
  /** Retardo de propagación de ida, en milisegundos. */
  oneWayDelayMs: number
}

export interface LinkMetrics {
  /** t_f: tiempo de transmisión de una trama (ms). */
  frameTimeMs: number
  /** t_f + 2·t_p: tiempo hasta poder enviar la siguiente en parada y espera (ms). */
  cycleMs: number
  /** a = t_p / t_f (parámetro adimensional de Stallings). */
  a: number
  /** Eficiencia de parada y espera sin errores: t_f / (t_f + 2·t_p). */
  stopAndWait: number
  /** Ventana mínima para saturar el enlace: w ≥ 1 + 2a. */
  optimalWindow: number
  /** Producto ancho de banda × retardo de ida y vuelta, en bits. */
  bandwidthDelayBits: number
}

/** Ejemplo clásico de [T] §3.4: canal satelital de 50 kbps, RTT 500 ms. */
export const TANENBAUM_EXAMPLE: LinkParams = {
  bitrate: 50_000,
  frameBits: 1_000,
  oneWayDelayMs: 250,
}

export function linkMetrics(p: LinkParams): LinkMetrics {
  const frameTimeMs = (p.frameBits / p.bitrate) * 1000
  const cycleMs = frameTimeMs + 2 * p.oneWayDelayMs
  const a = frameTimeMs > 0 ? p.oneWayDelayMs / frameTimeMs : Infinity
  return {
    frameTimeMs,
    cycleMs,
    a,
    stopAndWait: cycleMs > 0 ? frameTimeMs / cycleMs : 0,
    optimalWindow: Math.ceil(cycleMs / frameTimeMs),
    bandwidthDelayBits: p.bitrate * ((2 * p.oneWayDelayMs) / 1000),
  }
}

/**
 * Utilización de un canal con ventana N y tramas sin errores.
 * U = min(1, N / (1 + 2a))    —  [T] §3.4, [S] §7.4
 */
export function windowUtilization(n: number, a: number): number {
  return Math.min(1, n / (1 + 2 * a))
}

/**
 * Utilización de parada y espera con probabilidad de error P por trama.
 * U = (1 − P) / (1 + 2a)      —  [S] §7.4
 */
export function stopAndWaitUtilization(a: number, p: number): number {
  return (1 - p) / (1 + 2 * a)
}

/**
 * Utilización de retroceso N con probabilidad de error P por trama [S] §7.4:
 *
 *            N (1 − P)
 *   U = ───────────────────────   si N < 1 + 2a   (la ventana no llena la tubería)
 *       (1 + 2a)(1 − P + N·P)
 *
 *          1 − P
 *   U = ─────────────             si N ≥ 1 + 2a   (la ventana sí la llena)
 *       1 − P + N·P
 */
export function goBackNUtilization(n: number, a: number, p: number): number {
  const denom = 1 - p + n * p
  if (denom <= 0) return 0
  if (n < 1 + 2 * a) return (n * (1 - p)) / ((1 + 2 * a) * denom)
  return (1 - p) / denom
}

/**
 * Nº máximo de tramas de la ventana de envío para un espacio de secuencia de
 * m bits en retroceso N: N ≤ 2^m − 1  —  [T] §3.4.2.
 *
 * Con 2^m números no se puede usar una ventana de 2^m: el receptor no podría
 * distinguir una retransmisión de una trama nueva.
 */
export function maxWindowForBits(m: number): number {
  return 2 ** m - 1
}

/** Bits mínimos del campo de secuencia para una ventana de tamaño N. */
export function bitsForWindow(n: number): number {
  return Math.ceil(Math.log2(n + 1))
}

export const formatPercent = (v: number, digits = 1) => `${(v * 100).toFixed(digits)} %`

export const formatMs = (ms: number) =>
  ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10_000 ? 0 : 2)} s` : `${ms.toFixed(ms < 10 ? 1 : 0)} ms`

export function formatBits(bits: number): string {
  if (bits >= 1_000_000) return `${(bits / 1_000_000).toFixed(2)} Mb`
  if (bits >= 1_000) return `${(bits / 1_000).toFixed(1)} kb`
  return `${bits.toFixed(0)} b`
}
