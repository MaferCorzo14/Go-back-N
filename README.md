# Simulador Go-Back-N

Simulador web interactivo del protocolo de ventana deslizante **Go-Back-N** (retroceso N),
pensado para docencia de redes de computadoras: muestra en todo momento el estado del
**emisor**, del **canal** y del **receptor**, con las tramas viajando en tiempo real.

React 19 · TypeScript · Vite · Tailwind CSS 4 · Framer Motion

## Puesta en marcha

```bash
npm install
npm run dev
```

| Script | Qué hace |
| --- | --- |
| `npm run dev` | servidor de desarrollo (http://localhost:5173) |
| `npm run build` | comprobación de tipos + compilación de producción |
| `npm run verify` | banco de pruebas de la máquina de estados (sin navegador) |
| `npm run lint` | oxlint |

## Funcionalidades de la interfaz

La pantalla se lee de arriba hacia abajo: encabezado con el resumen del estado global,
controles a la izquierda, y a la derecha el recorrido físico de una trama —emisor, canal,
receptor— seguido de dos vistas de análisis y la teoría de referencia.

### Encabezado

Resumen en vivo de toda la corrida: reloj de simulación, tramas entregadas (`X/16`),
eficiencia (% de transmisiones que fueron datos nuevos, no retransmisiones), timeouts
ocurridos y pérdidas acumuladas (datos + ACK). Además muestra una etiqueta ⏸ *en pausa* o
✓ *transferencia completa* según corresponda.

### Panel de control

- **Enviar nuevo paquete** (`Espacio`): entrega manualmente la siguiente trama pendiente al
  emisor. Se deshabilita solo cuando la ventana está llena o no quedan paquetes.
- **Pausar / Reanudar** (`P`) y **Reiniciar** (`R`): control de la ejecución.
- **Avanzar al próximo evento** (`S` o `→`): modo paso a paso — salta el reloj directamente
  hasta el siguiente suceso discreto (una llegada, una pérdida, un timeout) sin animación de
  por medio, y anuncia de antemano cuál será y cuánto falta.
- **Envío automático**: el emisor mantiene la ventana siempre llena por sí solo, sin pulsar
  «Enviar» cada vez.
- **Parámetros**: sliders de tamaño de ventana `N` (1–8, con el mínimo de bits de secuencia
  que exige), tiempo de expiración del temporizador, retardo de propagación del canal y
  velocidad de reproducción de la simulación (no altera la lógica, solo el reloj visual).
- **Provocar fallos**: tres botones para inyectar manualmente pérdida de una trama de datos,
  pérdida de un ACK, o un retraso (`×2,6` el tránsito). Actúan sobre la trama seleccionada
  en el canal o, si no hay ninguna, sobre la última en salir; si no hay ninguna trama de ese
  tipo en vuelo, el fallo queda «armado» y se aplica a la siguiente que salga.

### 1 · Emisor

Búfer de paquetes 0–15 con la ventana deslizante dibujada como un rectángulo que se mueve al
recibir ACK. Cada celda indica su estado con color: confirmada, enviada sin confirmar,
utilizable dentro de la ventana, o bloqueada (fuera de la ventana todavía). Los punteros
`base` y `nextSeq` se ven como marcadores independientes. El anillo de temporizador muestra
cuánto falta para que expire el de la trama `base` (el único que existe) y cambia de color al
acercarse al límite.

### 2 · Canal de comunicación

Las tramas de datos viajan de izquierda a derecha; los ACK, de derecha a izquierda. Al hacer
clic sobre cualquier trama en vuelo se abre su ficha de inspección: porcentaje recorrido,
tiempo que le falta, instante de salida y de llegada, y una **previsión** de lo que ocurrirá
al llegar (si el receptor la aceptará o la descartará, y con qué ACK responderá). Con la
simulación en pausa, el canal se vuelve un tablero manipulable: aparece un menú `✂ perder` /
`🐢 retrasar` sobre la propia trama y el efecto se aplica al instante, en el punto exacto del
canal donde se la ve, sin esperar a reanudar.

### 3 · Receptor

Su ventana de recepción es **siempre de tamaño 1**: solo `expectedSeqNum` es aceptable.
Muestra tramas entregadas a la capa de red, el último ACK enviado, cuántas tramas se
descartaron por llegar fuera de orden, y cuántos ACK se enviaron en total (y cuántos se
perdieron en el canal).

### Diagrama espacio-tiempo

Vista estilo Tanenbaum: el tiempo avanza hacia abajo y cada trama es una línea diagonal entre
el eje del emisor y el del receptor. Las líneas cortadas a mitad de camino marcan pérdidas;
las marcas rojas horizontales, los timeouts. Útil para ver de un vistazo el ritmo de
retransmisiones de toda la corrida, no solo el instante actual.

### Bitácora de eventos

Registro cronológico (más reciente primero) de cada transición de la máquina de estados:
transmisiones, retransmisiones, ACK enviados y recibidos, descartes, pérdidas y timeouts,
cada uno con su marca de tiempo y una explicación de por qué ocurrió.

### Teoría y fórmulas

Tres pestañas independientes de la animación:

- **Máquina de estados**: el pseudocódigo exacto que implementa `engine.ts`, para emisor y
  receptor.
- **Fórmulas**: las expresiones de rendimiento (tiempo de trama, eficiencia, ventana óptima,
  producto ancho de banda×retardo, restricción de bits de secuencia, utilización con
  errores) con su fuente bibliográfica.
- **Calculadora**: sliders para velocidad de enlace, tamaño de trama, retardo de propagación,
  ventana `N` y probabilidad de error `P`, con el ejemplo del satélite de Tanenbaum
  precargado. Calcula al vuelo la eficiencia de parada y espera vs. Go-Back-N, y si la
  ventana elegida alcanza a «llenar la tubería» del enlace. Es una herramienta de cálculo
  aparte, no está ligada a los parámetros de la simulación de arriba.

## Arquitectura

La lógica de red está **completamente separada** de la capa visual: los componentes no
calculan nada del protocolo, solo dibujan el estado que produce el motor.

```
src/
├── simulation/          ← lógica pura, sin React ni DOM
│   ├── types.ts             modelo de datos (tramas, emisor, receptor, estadísticas)
│   ├── engine.ts            máquina de estados y simulador de eventos discretos
│   └── formulas.ts          fórmulas de rendimiento y sus fuentes
├── hooks/
│   └── useGoBackN.ts    ← puente con React: reloj rAF, comandos y valores derivados
├── components/          ← capa visual
│   ├── SenderPanel.tsx      búfer 0..15, ventana deslizante, punteros base/nextSeq
│   ├── NetworkChannel.tsx   carriles de datos (→) y de ACK (←)
│   ├── ReceiverPanel.tsx    expectedSeqNum y ventana de recepción de tamaño 1
│   ├── ControlPanel.tsx     envío, parámetros y fallos provocados
│   ├── SequenceDiagram.tsx  diagrama espacio-tiempo
│   ├── EventLog.tsx         bitácora de transiciones
│   ├── TheoryPanel.tsx      teoría, fórmulas y calculadora de rendimiento
│   └── ui.tsx               primitivas visuales compartidas
└── App.tsx              ← composición
```

### Fidelidad temporal de la animación

El motor es un **simulador de eventos discretos**: en cada fotograma procesa, en orden
cronológico estricto, las salidas, llegadas, pérdidas y expiraciones que caen dentro del
intervalo transcurrido. La posición de una trama en pantalla **no** la interpola Framer
Motion, sino que se deriva del reloj de simulación:

```
progreso = (t_actual − t_salida) / (t_llegada − t_salida)
```

Así, el tiempo que una trama tarda en cruzar la pantalla es exactamente el retardo de
propagación configurado, y el resultado no depende de la tasa de refresco del navegador.
Framer Motion se ocupa solo de lo que es animación pura: entradas y salidas de tramas,
el efecto de destrucción al perderse y el deslizamiento de la ventana.

## Protocolo implementado

**Emisor** (ventana de tamaño N)

- `enviar`: transmite si `nextSeq < base + N`; si no, rechaza (el botón se deshabilita).
- Un **único temporizador**, el de la trama `base` (la más antigua sin confirmar).
- `ACK n`: **acumulativo**, `base = n + 1`. Si se pierde el ACK 1 pero llega el ACK 2, la
  ventana se desliza igualmente. Los ACK obsoletos se ignoran.
- `timeout`: reinicia el temporizador y **retransmite todas** las tramas `base..nextSeq−1`.

**Receptor** (ventana de tamaño 1)

- Acepta únicamente `expectedSeqNum`; la entrega a la capa de red y envía `ACK(seq)`.
- Cualquier otra trama se **descarta** (no hay búfer de reordenación) y se reenvía el
  último ACK válido, `ACK(expectedSeqNum − 1)`.

`npm run verify` comprueba estas reglas sin navegador: transferencia limpia, ACK perdido
recuperado por acumulación, pérdida de datos con descarte fuera de orden y retroceso N,
reenvío del último ACK válido, ACK duplicados, el caso `N = 1` (parada y espera), los
fallos aplicados en pausa y el modo paso a paso.

## Trabajo con la simulación en pausa

Perseguir tramas en movimiento es incómodo, así que la pausa es un modo de trabajo
completo, no una simple congelación:

- **El canal se vuelve manipulable.** Al pulsar una trama se abre su ficha: recorrido
  hecho, tiempo que le falta, instante de salida y de llegada, y la **previsión** de lo que
  ocurrirá cuando llegue (si el receptor la aceptará o la descartará y con qué ACK
  responderá). Sobre la propia trama aparece además un menú con `✂ perder` y `🐢 retrasar`.
- **Los fallos se aplican en el acto.** Con la simulación en pausa, «provocar pérdida»
  destruye la trama en el punto exacto del canal donde se la ve: aparece la ✕, se anota en
  la bitácora con la marca de tiempo actual, cuenta en las estadísticas y se dibuja en el
  diagrama espacio-tiempo. No queda pendiente de reanudar.
- **Paso a paso.** El botón «⏭ Avanzar al próximo evento» (atajo `S` o `→`) adelanta el
  reloj justo hasta el siguiente suceso discreto —una llegada, una pérdida, la expiración
  del temporizador— y anuncia de antemano cuál será y cuánto falta. Permite recorrer el
  protocolo suceso a suceso sin salir de la pausa.

El ciclo natural en clase es: **pausar → seleccionar una trama → provocar el fallo →
avanzar evento a evento** para ver la consecuencia.

## Escenarios didácticos sugeridos

1. **La ventana llena al emisor.** Con N = 4, pulsa «Enviar» cinco veces: el quinto envío
   se rechaza hasta que llegue un ACK.
2. **ACK acumulativo.** Envía dos tramas y pierde el ACK 0. El ACK 1 confirma las dos y la
   ventana se desliza sin retransmisiones.
3. **El coste del retroceso N.** Pierde la trama 0 con la ventana llena: las tres
   siguientes llegan, se descartan por estar fuera de orden y, tras el timeout, las cuatro
   se retransmiten.
4. **Timeout prematuro.** Provoca un retraso (×2,6) o baja el timeout por debajo del RTT:
   aparecen retransmisiones inútiles y tramas duplicadas que el receptor descarta.
5. **N = 1.** Go-Back-N degenera en parada y espera; compárala con la eficiencia que
   calcula la pestaña «Calculadora».

## Fórmulas y bibliografía

La pestaña «Fórmulas» y la «Calculadora» (precargada con el ejemplo del canal satelital de
50 kbps del libro de Tanenbaum: t_f = 20 ms, eficiencia 3,8 %, ventana necesaria de 26
tramas) implementan:

| Expresión | Fuente |
| --- | --- |
| `t_f = L / B` | Tanenbaum & Wetherall §3.4 |
| `U = t_f / (t_f + 2·t_p) = 1/(1+2a)` | Tanenbaum & Wetherall §3.4 |
| `w ≥ (t_f + 2·t_p)/t_f = 1 + 2a` | Tanenbaum & Wetherall §3.4 |
| `BD = B × RTT` | Tanenbaum & Wetherall §3.4 |
| `N ≤ 2^m − 1` | Tanenbaum & Wetherall §3.4.2 |
| `U = N(1−P)/[(1+2a)(1−P+N·P)]` | Stallings §7.4 |

- Tanenbaum, A. S. y Wetherall, D. J. (2012). *Redes de Computadoras* (5.ª ed.). Pearson.
  §3.4 «Protocolos de ventana deslizante»; §3.4.2 «Protocolo de ventana deslizante con
  retroceso N».
- Stallings, W. (2004). *Comunicaciones y Redes de Computadores* (7.ª ed.). Pearson.
  §7.4 «Rendimiento de ARQ».
- Kurose, J. F. y Ross, K. W. *Redes de Computadoras: un enfoque descendente*. §3.4.3
  «Retroceso N (GBN)».

## Atajos de teclado

`Espacio` enviar · `S` o `→` avanzar al próximo evento · `X` perder paquete ·
`A` perder ACK · `D` retrasar trama ·
`P` pausar/reanudar · `R` reiniciar
