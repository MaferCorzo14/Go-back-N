/**
 * Teoría, fórmulas y calculadora de rendimiento.
 *
 * Las expresiones y sus fuentes están documentadas en `simulation/formulas.ts`.
 */

import { useState } from 'react'
import {
  TANENBAUM_EXAMPLE,
  bitsForWindow,
  formatBits,
  formatMs,
  formatPercent,
  goBackNUtilization,
  linkMetrics,
  maxWindowForBits,
  stopAndWaitUtilization,
  windowUtilization,
} from '../simulation/formulas'
import type { LinkParams } from '../simulation/formulas'
import { Panel, Slider } from './ui'
import { cx } from '../lib/cx'

type Tab = 'protocolo' | 'formulas' | 'calculadora'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'protocolo', label: 'Máquina de estados' },
  { id: 'formulas', label: 'Fórmulas' },
  { id: 'calculadora', label: 'Calculadora' },
]

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-[12.5px] leading-relaxed text-slate-600">
      {children}
    </pre>
  )
}

function Formula({
  title,
  expression,
  description,
  source,
}: {
  title: string
  expression: string
  description: string
  source: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <h4 className="text-[13px] font-semibold text-slate-700">{title}</h4>
      <p className="my-2 rounded-lg bg-indigo-50 px-3 py-2 text-center font-mono text-[14px] text-indigo-700">
        {expression}
      </p>
      <p className="text-[12.5px] leading-snug text-slate-600">{description}</p>
      <p className="mt-1.5 text-[11.5px] text-slate-500 italic">{source}</p>
    </div>
  )
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-1.5 last:border-0">
      <span className="text-[13px] text-slate-600">
        {label}
        {hint && <span className="ml-1 text-[11px] text-slate-500">{hint}</span>}
      </span>
      <span className="font-mono text-[13.5px] font-semibold text-slate-800">{value}</span>
    </div>
  )
}

function Calculator() {
  const [params, setParams] = useState<LinkParams>(TANENBAUM_EXAMPLE)
  const [windowSize, setWindowSize] = useState(7)
  const [errorRate, setErrorRate] = useState(0)

  const metrics = linkMetrics(params)
  const idealWindowUse = windowUtilization(windowSize, metrics.a)
  const gbn = goBackNUtilization(windowSize, metrics.a, errorRate)
  const saw = stopAndWaitUtilization(metrics.a, errorRate)
  const bits = bitsForWindow(windowSize)

  const isTanenbaumExample =
    params.bitrate === TANENBAUM_EXAMPLE.bitrate &&
    params.frameBits === TANENBAUM_EXAMPLE.frameBits &&
    params.oneWayDelayMs === TANENBAUM_EXAMPLE.oneWayDelayMs

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Slider
          label="Velocidad del enlace"
          value={params.bitrate}
          min={10_000}
          max={10_000_000}
          step={10_000}
          onChange={(bitrate) => setParams((p) => ({ ...p, bitrate }))}
          format={(v) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(2)} Mbps` : `${v / 1000} kbps`)}
        />
        <Slider
          label="Tamaño de trama"
          value={params.frameBits}
          min={200}
          max={12_000}
          step={100}
          onChange={(frameBits) => setParams((p) => ({ ...p, frameBits }))}
          format={(v) => `${v} bits (${(v / 8).toFixed(0)} B)`}
        />
        <Slider
          label="Retardo de propagación (ida)"
          value={params.oneWayDelayMs}
          min={1}
          max={400}
          onChange={(oneWayDelayMs) => setParams((p) => ({ ...p, oneWayDelayMs }))}
          format={(v) => `${v} ms`}
        />
        <Slider
          label="Ventana N"
          value={windowSize}
          min={1}
          max={64}
          onChange={setWindowSize}
          format={(v) => `${v} tramas`}
          hint={`Necesita m = ${bits} bits de secuencia (N ≤ 2^${bits} − 1 = ${maxWindowForBits(bits)}).`}
        />
        <Slider
          label="Probabilidad de error por trama (P)"
          value={errorRate}
          min={0}
          max={0.5}
          step={0.01}
          onChange={setErrorRate}
          format={(v) => `${(v * 100).toFixed(0)} %`}
        />
        <button
          type="button"
          onClick={() => {
            setParams(TANENBAUM_EXAMPLE)
            setWindowSize(7)
            setErrorRate(0)
          }}
          className={cx(
            'w-full rounded-xl border px-3 py-2 text-[13px] transition-colors',
            isTanenbaumExample
              ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
          )}
        >
          Cargar el ejemplo del satélite de Tanenbaum (50 kbps, RTT 500 ms)
        </button>
      </div>

      <div className="space-y-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <Row label="t_f · tiempo de trama" value={formatMs(metrics.frameTimeMs)} hint="= L / B" />
          <Row label="2·t_p · ida y vuelta" value={formatMs(2 * params.oneWayDelayMs)} />
          <Row label="t_f + 2·t_p · ciclo" value={formatMs(metrics.cycleMs)} />
          <Row label="a = t_p / t_f" value={metrics.a.toFixed(2)} />
          <Row
            label="Producto ancho de banda × retardo"
            value={formatBits(metrics.bandwidthDelayBits)}
            hint="bits en vuelo"
          />
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <Row
            label="Eficiencia con parada y espera"
            value={formatPercent(metrics.stopAndWait)}
            hint="N = 1, sin errores"
          />
          <Row
            label="Ventana para llenar la tubería"
            value={`${metrics.optimalWindow} tramas`}
            hint="w ≥ 1 + 2a"
          />
          <Row
            label={`Utilización con N = ${windowSize} (sin errores)`}
            value={formatPercent(idealWindowUse)}
          />
          <Row
            label={`Utilización Go-Back-N (P = ${(errorRate * 100).toFixed(0)} %)`}
            value={formatPercent(gbn)}
          />
          <Row
            label={`Utilización parada y espera (P = ${(errorRate * 100).toFixed(0)} %)`}
            value={formatPercent(saw)}
          />
        </div>

        <p className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 text-[12.5px] leading-snug text-slate-600">
          {windowSize >= metrics.optimalWindow ? (
            <>
              Con N = {windowSize} ≥ {metrics.optimalWindow} la ventana <strong>llena la tubería</strong>:
              el emisor nunca queda ocioso esperando confirmaciones y la pérdida de eficiencia se debe
              solo a los errores.
            </>
          ) : (
            <>
              Con N = {windowSize} &lt; {metrics.optimalWindow} el emisor <strong>se queda bloqueado</strong>{' '}
              esperando el primer ACK: usa apenas el {formatPercent(idealWindowUse, 0)} del enlace.
              Súbela a {metrics.optimalWindow} para saturarlo.
            </>
          )}
        </p>
      </div>
    </div>
  )
}

export function TheoryPanel() {
  const [tab, setTab] = useState<Tab>('protocolo')

  return (
    <Panel
      title="Teoría y fórmulas"
      subtitle="Fundamentos del protocolo y cálculo de rendimiento"
      aside={
        <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cx(
                'rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors',
                tab === item.id
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-800',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      }
    >
      {tab === 'protocolo' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-[13px] font-semibold tracking-wide text-indigo-700 uppercase">
              Emisor · ventana de tamaño N
            </h3>
            <Code>{`enviar(datos):
    si nextSeq < base + N:
        transmitir(trama[nextSeq])
        si base == nextSeq:
            arrancar_temporizador()
        nextSeq = nextSeq + 1
    si no:
        rechazar        // ventana llena

al recibir ACK n:      // ACK ACUMULATIVO
    base = n + 1
    si base == nextSeq:
        detener_temporizador()
    si no:
        arrancar_temporizador()

al expirar el temporizador:
    arrancar_temporizador()
    para i = base hasta nextSeq - 1:
        retransmitir(trama[i])     // «retroceso N»`}</Code>
          </div>
          <div>
            <h3 className="mb-2 text-[13px] font-semibold tracking-wide text-emerald-700 uppercase">
              Receptor · ventana de tamaño 1
            </h3>
            <Code>{`al recibir trama con nº de secuencia seq:
    si seq == expectedSeqNum:
        entregar_a_capa_de_red(trama)
        enviar(ACK expectedSeqNum)
        expectedSeqNum = expectedSeqNum + 1
    si no:
        descartar(trama)                  // fuera de orden
        enviar(ACK expectedSeqNum - 1)    // último ACK válido`}</Code>
            <ul className="mt-3 space-y-2 text-[13px] leading-snug text-slate-600">
              <li>
                <strong className="text-slate-800">Sin búfer de reordenación.</strong> El receptor no
                guarda tramas fuera de orden; por eso una sola pérdida obliga a retransmitir toda la
                ventana. Ese es el precio de su simplicidad frente a la repetición selectiva.
              </li>
              <li>
                <strong className="text-slate-800">ACK acumulativo.</strong> ACK n confirma todas las
                tramas hasta la n. Si se pierde ACK 1 pero llega ACK 2, la ventana se desliza igual y
                la pérdida pasa inadvertida.
              </li>
              <li>
                <strong className="text-slate-800">Un solo temporizador.</strong> Corresponde a la
                trama <em>base</em>: es la más antigua sin confirmar.
              </li>
            </ul>
          </div>
        </div>
      )}

      {tab === 'formulas' && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Formula
            title="Tiempo de transmisión de una trama"
            expression="t_f = L / B"
            description="L es la longitud de la trama en bits y B la velocidad del enlace en bits/s. Es el tiempo que tarda el emisor en poner la trama en el cable, distinto del tiempo de propagación t_p."
            source="Tanenbaum & Wetherall, Redes de Computadoras, 5.ª ed., §3.4"
          />
          <Formula
            title="Eficiencia con parada y espera"
            expression="U = t_f / (t_f + 2·t_p) = 1 / (1 + 2a)"
            description="Con una sola trama en vuelo el emisor queda ocioso durante todo el viaje de ida y vuelta. En el canal satelital del libro (50 kbps, 1000 bits, RTT 500 ms) da 20/520 ≈ 3,8 %."
            source="Tanenbaum & Wetherall §3.4 · parámetro a = t_p / t_f de Stallings"
          />
          <Formula
            title="Ventana que llena la tubería"
            expression="w ≥ (t_f + 2·t_p) / t_f = 1 + 2a"
            description="Nº de tramas que el emisor debe poder tener sin confirmar para no quedarse nunca parado. En el ejemplo del satélite: 520/20 = 26 tramas."
            source="Tanenbaum & Wetherall §3.4 («pipelining»)"
          />
          <Formula
            title="Producto ancho de banda–retardo"
            expression="BD = B × RTT"
            description="Bits que caben simultáneamente en el canal. Es la capacidad de almacenamiento del propio enlace y fija el tamaño mínimo útil de la ventana."
            source="Tanenbaum & Wetherall §3.4"
          />
          <Formula
            title="Espacio de números de secuencia"
            expression="N ≤ 2^m − 1"
            description="Con m bits de secuencia la ventana de envío no puede llegar a 2^m: el receptor no podría distinguir una retransmisión de una trama nueva. Con m = 3 bits, N ≤ 7."
            source="Tanenbaum & Wetherall §3.4.2 (protocolo de retroceso N)"
          />
          <Formula
            title="Utilización de Go-Back-N con errores"
            expression="U = N(1−P) / [(1+2a)(1−P+N·P)]"
            description="Válida cuando N < 1 + 2a; si N ≥ 1 + 2a se reduce a U = (1−P)/(1−P+N·P). P es la probabilidad de que una trama se pierda o llegue dañada. Nótese cómo una N grande penaliza más al aumentar P: cada error cuesta N retransmisiones."
            source="Stallings, Comunicaciones y Redes de Computadores, 7.ª ed., §7.4"
          />
        </div>
      )}

      {tab === 'calculadora' && <Calculator />}

      <div className="mt-4 border-t border-slate-200 pt-3 text-[12px] leading-relaxed text-slate-600">
        <strong className="text-slate-600">Bibliografía:</strong> Tanenbaum, A. S. y Wetherall, D. J.
        (2012). <em>Redes de Computadoras</em> (5.ª ed.), Pearson — §3.4 «Protocolos de ventana
        deslizante» y §3.4.2 «Protocolo de ventana deslizante con retroceso N». · Stallings, W.
        (2004). <em>Comunicaciones y Redes de Computadores</em> (7.ª ed.), Pearson — §7.4
        «Rendimiento de ARQ». · Kurose, J. F. y Ross, K. W. <em>Redes de Computadoras: un enfoque
        descendente</em> — §3.4.3 «Retroceso N (GBN)», autómatas del emisor y del receptor.
      </div>
    </Panel>
  )
}
