/* Banco de pruebas del motor Go-Back-N (node --experimental-strip-types). */
import {
  DELAY_FACTOR,
  advance,
  causeAckLoss,
  causeDelay,
  causePacketLoss,
  createState,
  frameProgress,
  selectFrame,
  sendPacket,
  setConfig,
  setRunning,
  stepToNextEvent,
  upcomingEvent,
} from './src/simulation/engine.ts'
import type { SimState } from './src/simulation/types.ts'

let failures = 0
function check(name: string, condition: boolean, extra = '') {
  if (condition) console.log(`  ok   ${name}`)
  else {
    failures++
    console.log(`  FAIL ${name} ${extra}`)
  }
}

const run = (s: SimState, ms: number) => {
  let out = s
  for (let i = 0; i < Math.round(ms / 20); i++) out = advance(out, 20)
  return out
}

const base = (config: Partial<Parameters<typeof createState>[0]> = {}) =>
  setConfig(createState({ windowSize: 4, propagationDelay: 1000, timeout: 4000, ...config }), {})

/* --- A. Flujo sin errores --------------------------------------------- */
console.log('A. Transferencia limpia (N=4)')
{
  let s = base()
  for (let i = 0; i < 4; i++) s = sendPacket(s)
  check('la ventana se llena a 4', s.sender.nextSeq === 4)
  s = sendPacket(s)
  check('el 5.º envío se rechaza (ventana llena)', s.sender.nextSeq === 4)
  check('temporizador activo para base=0', s.sender.timerExpiry !== null)

  s = run(s, 1100)
  check('receptor entregó 0..3 en orden', s.receiver.delivered.join(',') === '0,1,2,3')
  check('expectedSeqNum = 4', s.receiver.expected === 4)

  s = run(s, 1100)
  check('base avanzó a 4 tras los ACK', s.sender.base === 4, `base=${s.sender.base}`)
  check('temporizador detenido', s.sender.timerExpiry === null)
  check('sin retransmisiones', s.stats.retransmissions === 0)
}

/* --- B. ACK acumulativo: se pierde ACK 0 pero llega ACK 1 -------------- */
console.log('B. Pérdida de ACK 0, llega ACK 1 (confirmación acumulativa)')
{
  let s = base()
  s = sendPacket(s) // trama 0 en t=0
  s = run(s, 400)
  s = sendPacket(s) // trama 1 en t=400
  s = run(s, 700) // t=1100: la trama 0 llegó, el ACK 0 viaja

  const ack0 = s.frames.find((f) => f.kind === 'ACK' && f.seq === 0)
  check('ACK 0 está en vuelo', ack0 !== undefined)
  s = selectFrame(s, ack0!.id)
  s = causeAckLoss(s)
  s = run(s, 1500) // el ACK 0 muere; el ACK 1 llega

  check('el ACK 0 se perdió', s.stats.acksLost === 1)
  check('base saltó a 2 con el ACK 1', s.sender.base === 2, `base=${s.sender.base}`)
  check('no hubo timeout', s.stats.timeouts === 0)
  check('no hubo retransmisiones', s.stats.retransmissions === 0)
}

/* --- C. Pérdida de datos, descarte fuera de orden y retroceso N -------- */
console.log('C. Se pierde la trama 0; 1,2,3 se descartan; timeout retransmite todas')
{
  let s = base()
  s = causePacketLoss(s) // no hay nada en vuelo -> queda armado
  check('el fallo queda armado', s.traps.dataLoss)
  for (let i = 0; i < 4; i++) s = sendPacket(s)
  s = run(s, 1200)

  check('la trama 0 se perdió', s.stats.dataLost === 1)
  check('el receptor sigue esperando la 0', s.receiver.expected === 0)
  check('descartó 3 tramas fuera de orden', s.stats.discarded === 3, `d=${s.stats.discarded}`)
  check('no envió ningún ACK (no hay ACK previo válido)', s.stats.acksSent === 0)

  s = run(s, 3200) // t≈4400 > timeout 4000
  check('se produjo un timeout', s.stats.timeouts === 1)
  check('retransmitió las 4 tramas de la ventana', s.stats.retransmissions === 4, `r=${s.stats.retransmissions}`)

  s = run(s, 3000)
  check('receptor entregó 0..3 tras el retroceso N', s.receiver.delivered.join(',') === '0,1,2,3')
  s = run(s, 1600)
  check('base llegó a 4', s.sender.base === 4, `base=${s.sender.base}`)
}

/* --- D. Reenvío del último ACK válido y ACK duplicados ----------------- */
console.log('D. Reenvío de ACK(expected-1) y descarte de ACK duplicados')
{
  let s = base()
  s = sendPacket(s)
  s = run(s, 2100) // trama 0 entregada y ACK 0 recibido
  check('base = 1', s.sender.base === 1)

  s = causePacketLoss(s) // arma la pérdida de la próxima trama
  s = sendPacket(s) // trama 1 -> se pierde
  s = sendPacket(s) // trama 2
  s = sendPacket(s) // trama 3
  s = run(s, 1200)

  check('el receptor reenvió el último ACK válido dos veces', s.stats.acksSent === 3, `acks=${s.stats.acksSent}`)
  const resent = s.frames.filter((f) => f.kind === 'ACK' && f.seq === 0)
  check('los ACK reenviados son ACK 0', resent.length >= 1)

  s = run(s, 1200)
  check('los ACK 0 se ignoran por duplicados', s.stats.duplicateAcks >= 2, `dup=${s.stats.duplicateAcks}`)
  check('la ventana no se movió', s.sender.base === 1, `base=${s.sender.base}`)
}

/* --- E. N = 1 equivale a parada y espera ------------------------------- */
console.log('E. N = 1 degenera en parada y espera')
{
  let s = base({ windowSize: 1 })
  s = sendPacket(s)
  s = sendPacket(s)
  check('solo hay una trama sin confirmar', s.sender.nextSeq === 1)
  s = run(s, 2100)
  check('base = 1 tras el ACK', s.sender.base === 1)
  s = sendPacket(s)
  check('ahora sí admite la siguiente', s.sender.nextSeq === 2)
}

/* --- F. Los fallos provocados en pausa se aplican al instante ---------- */
console.log('F. En pausa, la pérdida se refleja sin avanzar el reloj')
{
  let s = setRunning(base(), false)
  s = sendPacket(s)
  check('la trama sale al canal aunque esté en pausa', s.frames.length === 1)

  s = selectFrame(s, s.frames[0].id)
  s = causePacketLoss(s)
  check('la trama queda destruida en el acto', s.frames[0].status === 'LOST')
  check('el reloj no se ha movido', s.time === 0)
  check('la estadística de pérdidas ya está actualizada', s.stats.dataLost === 1)
  check('no quedó ninguna trampa armada', !s.traps.dataLoss)
  check('el diagrama la marca como perdida', s.trace[0].lost)

  const frozen = run(s, 600)
  check('en pausa el reloj sigue detenido', frozen.time === 0)
}

/* --- G. Paso a paso: avanzar exactamente hasta el próximo evento ------- */
console.log('G. Modo paso a paso')
{
  let s = setRunning(base(), false)
  s = sendPacket(s)

  const first = upcomingEvent(s)
  check('anuncia la llegada de la trama 0', first?.label.includes('llega la trama DATA 0') === true, first?.label)
  check('faltan 1000 ms para ella', Math.round(first?.delay ?? -1) === 1000)

  s = stepToNextEvent(s)
  check('el reloj salta justo a la llegada', Math.round(s.time) === 1000, `t=${s.time}`)
  check('el receptor la entregó', s.receiver.delivered.join(',') === '0')
  check('la simulación sigue en pausa', !s.running)
  check('el ACK ya viaja de vuelta', s.frames.some((f) => f.kind === 'ACK' && f.status === 'IN_FLIGHT'))

  const second = upcomingEvent(s)
  check('el próximo evento es el ACK', second?.label.includes('llega el ACK 0') === true, second?.label)

  s = stepToNextEvent(s)
  check('tras el segundo paso la ventana se deslizó', s.sender.base === 1, `base=${s.sender.base}`)
  check('sin eventos pendientes el anuncio es nulo', upcomingEvent(s) === null)
}

/* --- H. El retraso no hace retroceder la trama ------------------------- */
console.log('H. Retraso sin salto hacia atrás')
{
  let s = base()
  s = sendPacket(s)
  s = run(s, 500)

  const before = frameProgress(s.frames[0], s.time)
  const remainingBefore = s.frames[0].arrival - s.time
  s = causeDelay(s)
  const after = frameProgress(s.frames[0], s.time)

  check('la trama no se mueve de sitio al retrasarla', Math.abs(after - before) < 1e-9, `${before} -> ${after}`)
  check('iba por la mitad del canal', Math.abs(before - 0.5) < 0.02, `p=${before}`)
  check(
    'solo se alarga el tramo pendiente',
    Math.abs((s.frames[0].arrival - s.time) - remainingBefore * DELAY_FACTOR) < 1e-6,
  )
  check('queda marcada como retrasada', s.frames[0].delayed)
}

console.log(failures === 0 ? '\nTODAS LAS PRUEBAS PASAN' : `\n${failures} PRUEBA(S) FALLIDA(S)`)
process.exit(failures === 0 ? 0 : 1)
