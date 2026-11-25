# FlyNext — Evidencia técnica (Entregable 1)

FlyNext es un demo. Esta página explica qué se construyó, cómo revisarlo y qué se verificó. Todos los datos son sintéticos.

## 1. Track elegido y por qué

**Track: Backend/Integración.** El problema central del caso es convertir información operacional heterogénea, incompleta y a veces contradictoria en decisiones confiables, trazables y seguras para el pasajero. Eso se resuelve en el servidor: reconciliar fuentes, medir su frescura, evaluar el riesgo de una conexión, aplicar políticas y decidir qué se recomienda y qué no se puede afirmar.

El frontend React es una **capa complementaria**: muestra el resultado del backend, no contiene reglas de negocio y no cambia el track elegido. Las capas de IA (consultas ambiguas, agentes) están **diseñadas, no implementadas**: ver `README.md` y `docs/diagrams/README.md`.

## 2. Alcance realmente implementado

| Capacidad | Qué hace | Dónde está | Cómo se verifica |
| --- | --- | --- | --- |
| Integración de fuentes sintéticas | Cuatro puertos de lectura (viaje, eventos, políticas, alternativas) con adaptadores simulados. Cada carga se valida con Zod y un mapper descarta datos personales. | `apps/api/src/disruption/infrastructure/` | `mappers.test.ts`, `assess-disruption.test.ts` |
| Reconciliación | La autoridad depende del tipo de dato (estado y horas, puertas, fuente secundaria). Una fuente degradada no fundamenta una decisión definitiva; una contradicción sin resolver queda como incertidumbre. | `domain/reconciliation.ts` | `reconciliation.test.ts` |
| Frescura | Viaje 5 min, eventos 30 min, puertas 15 min (supuestos configurables). Un viaje obsoleto se rechaza; eventos obsoletos no se usan. Reloj inyectable. | `domain/time.ts`, `domain/config.ts` | `time.test.ts` |
| Riesgo de conexión | `SAFE`, `AT_RISK`, `MISSED` o `UNKNOWN`. Sin Minimum Connection Time inventado: margen ≤ 0 o evidencia operacional es `AT_RISK`; margen positivo sin evidencia es `UNKNOWN`; `MISSED` solo con confirmación. | `domain/connection.ts` | `connection.test.ts` (19 tests) |
| Clasificación | Cancelación y conexión en riesgo son críticas; retraso ≥ 30 min es relevante; menos es informativo. | `domain/classification.ts` | `classification.test.ts` |
| Políticas | Reglas R1–R5 de la política `POL-DELAY-2026-03`, con estados `APPLICABLE`, `NOT_APPLICABLE`, `REQUIRES_HUMAN_APPROVAL` e `INSUFFICIENT_EVIDENCE`. | `domain/policies.ts` | `policies.test.ts` (incluye límites 179/180/239/240) |
| Alternativas | Valida asientos para todo el grupo, frescura, política y condiciones de tarifa. Nunca separa pasajeros ni trata una diferencia de tarifa cero como ausencia de penalización. | `domain/alternatives.ts` | `alternatives.test.ts` |
| Recomendación | `NO_ACTION_REQUIRED`, `MONITOR_FLIGHT`, `REVIEW_REBOOKING_OPTIONS` o `HUMAN_REVIEW`, con prioridad. Siempre `actions.executed: []`. | `domain/recommendation.ts` | `recommendation.test.ts` |
| Manejo de incertidumbre | Estados `COMPLETE`, `PARTIAL`, `INDETERMINATE`. Si fallan eventos, el resultado es indeterminado; si fallan políticas o alternativas, es parcial. Que falte información no implica que no haya disrupción. | `application/assess-disruption.ts` | `assess-disruption.test.ts` |
| API REST | `POST /api/v1/disruptions/assessment`, `GET /health`, Swagger en `/docs`. Valida la entrada, limita el cuerpo (1 024 bytes) y el ritmo (60 solicitudes por minuto por IP directa), y devuelve errores sanitizados. | `apps/api/src/http/` | `app.test.ts` (Fastify `inject`) |
| Contratos compartidos | Esquemas Zod del contrato público; los usan la API (salida) y el frontend (respuesta). | `packages/contracts/` | `assessment.test.ts` (50 tests) |
| Mensajes al pasajero | Se generan con plantillas deterministas a partir de los hechos; el frontend no interpreta enums para armar mensajes. | `presentation/` | `present-assessment.test.ts` |
| Frontend responsive | React 19, Vite y Tailwind v4. Estados de carga, error y vacío, etiqueta de modo demo. | `apps/web/` | 10 tests; capturas en `docs/evidence/screenshots/` |
| Observabilidad | Logs Pino por categoría (`METRIC`, `DATA`, `BUSINESS`, `ERROR`, `ALERT`), sin datos personales. `LOG_LEVEL=silent` por defecto. | `apps/api/src/shared/observability.ts`, `docs/engineering/OBSERVABILITY.md` | tests de logs en `app.test.ts` |
| Despliegue único | Un servicio Railway, un proceso Node.js: Fastify entrega la API, Swagger y los archivos estáticos de React. Sin base de datos. | `docs/engineering/ARCHITECTURE.md` | pruebas de funcionamiento en producción (sección 5) |

## 3. Cómo revisarlo o ejecutarlo

Requisitos: Node **24.15.0** (archivo `.nvmrc`) y pnpm **12.16.1** (campo `packageManager`; la instalación falla si las versiones no coinciden). Por ejemplo: `nvm use` y `npm install -g pnpm@12.16.1`.

**Desarrollo** (`pnpm dev` mantiene procesos activos —la API y Vite— hasta que los detengas con Ctrl+C; no usarlo para pruebas automáticas):

```bash
git clone https://github.com/fmurillodev/fly-next.git
cd fly-next
nvm use                          # Node 24.15.0
pnpm install --frozen-lockfile   # dependencias exactas del lockfile
pnpm dev                         # API en :3000 y Vite (imprime su puerto); /api se reenvía a la API
```

**Pruebas, compilación y ejecución compilada** (comandos que terminan, salvo `pnpm start`, que queda sirviendo en http://localhost:3000, interfaz incluida):

```bash
pnpm test                        # 340 tests
pnpm build                       # contratos, API y web
pnpm start                       # API compilada, en primer plano hasta Ctrl+C
```

Atajos del `package.json`: `pnpm dev:api`, `pnpm dev:web`, `pnpm check` (lint, typecheck, tests y build, igual que la CI). Variables opcionales de la API (`apps/api/src/config.ts`): `HOST` (por defecto `0.0.0.0`), `PORT` (3000), `LOG_LEVEL` y `RATE_LIMIT_MAX` (60). No hay otras. `LOG_LEVEL` es `silent` por defecto, por lo que en local no se ven logs; en Railway está configurado en `info`.

Con la aplicación en marcha: interfaz en `http://localhost:3000/`, Swagger en `http://localhost:3000/docs`, salud en `/health`.

**Probar el assessment** (también contra la aplicación pública, cambiando el host por `https://flynext-api-production.up.railway.app`):

```bash
curl -s -X POST http://localhost:3000/api/v1/disruptions/assessment \
  -H 'content-type: application/json' \
  -d '{"bookingId":"ABC123"}'
```

Para revisar solo la decisión de conexión: `pnpm --filter @flynext/api exec vitest run connection`.

## 4. Escenarios verificables (resultados reales de la API)

Solo hay tres reservas públicas. DEMO03–DEMO06 son fixtures internos de pruebas (contradicción sin resolver, eventos obsoletos, retraso internacional, conexión perdida confirmada): se ejercitan en los tests y la API pública responde `404 BOOKING_NOT_FOUND`.

**ABC123 — conexión en riesgo.** `assessmentStatus: PARTIAL`, severidad `CRITICAL`. Vuelo LA500 con retraso confirmado de 160 min y puerta 24. Conexión `AT_RISK` con `lossConfirmation: NOT_CONFIRMED`: el itinerario preveía 70 min, la llegada proyectada (20:35, hora de Lima) deja un margen de −90 min y esa llegada no está confirmada. Recomendación `HUMAN_REVIEW`, prioridad `HIGH` (motivos `CONNECTION_AT_RISK`, `PRIORITY_REVIEW_REQUIRED`, `INCOMPLETE_FARE_CONDITIONS`). `actions.executed` está vacío.

- *Por qué no se confirma una conexión perdida:* una estimación no es un hecho. `MISSED` exige confirmación y el sistema no inventa umbrales; por eso el mensaje dice que la pérdida "no se ha confirmado".
- *Por qué una alternativa disponible no es una reserva:* la opción LA2412 queda `PENDING_VALIDATION` (alcance no confirmado, condiciones de tarifa incompletas, cambio sin costo no autorizado); LA2450 es `NOT_ELIGIBLE` por asientos insuficientes para el grupo; el reembolso exige revisión. Ninguna está reservada.
- Políticas: R1 (retraso ≥ 180 min) y R2 (retraso ≥ 240 min y vuelo internacional) no aplican: 160 min no alcanza el umbral de 180, R3 tiene evidencia insuficiente, R5 requiere aprobación humana.

**DEMO01 — viaje sin disrupciones.** `COMPLETE`, severidad `NONE`, recomendación `NO_ACTION_REQUIRED` (prioridad `LOW`), alternativas `NOT_REQUIRED`.

**DEMO02 — retraso con beneficio aplicable.** Retraso confirmado de 190 min, `COMPLETE`, severidad `WARNING`. La política **R1 `REBOOK_NO_FEE` es `APPLICABLE`** y la recomendación es `REVIEW_REBOOKING_OPTIONS`. Aplicable significa que el cliente podría tener derecho al beneficio; no significa que el cambio se haya hecho. La opción LA1001 es `ELIGIBLE` pero "no está reservada: un agente debe confirmar que sigue disponible".

Todas las respuestas incluyen `metadata.mode: SIMULATION` y un aviso de que los datos son sintéticos e históricos (reloj simulado en `2026-09-15T11:02:40Z`).

## 5. Tests y validaciones disponibles

- **340 tests aprobados**: 50 de contratos, 280 de API y 10 de frontend (`pnpm check`, repetido el 2026-11-25 con Node 24.15.0 y pnpm 12.16.1).
- **CI** en GitHub Actions (`.github/workflows/ci.yml`): `pnpm install --frozen-lockfile` y `pnpm check`, en cada pull request y en `main`.
- **Pruebas de funcionamiento en producción, acotadas** (2026-11-25): `/health` y `/docs` responden 200; ABC123, DEMO01 y DEMO02 devuelven los resultados de la sección 4; DEMO03 devuelve 404. Despliegue funcional `8ee89764-9b8e-4a2e-a157-19c86cc42b58` (commit `f1155b8`).
- **Pruebas de privacidad**: los tests rechazan campos inesperados (por ejemplo un correo) en la entrada y en el contrato de salida, y comprueban que el presenter no copia datos crudos del proveedor al DTO público.
- **Revisión visual**: capturas de inicio y ABC123 a 375 y 1440 px, sin desbordes (`docs/evidence/screenshots/`).

## 6. Limitaciones conocidas

Datos sintéticos y reloj simulado; sin integración con sistemas reales, sin autenticación de reservas, sin operaciones que modifiquen reservas y sin modelo de lenguaje durante la ejecución. Las reglas de dominio (umbral de 30 min, ventanas de frescura, jerarquía de fuentes, mantener unido al grupo) son supuestos pendientes de validación operacional. El límite de solicitudes se calcula sobre la IP directa y detrás del proxy de Railway no se demostró aislamiento por cliente. El `X-Request-Id` no existe en el 404 de rutas desconocidas. La revisión automatizada de código fue parcial, los tests de la interfaz se escribieron después del código, no hay auditoría de accesibilidad completa ni pruebas de carga. Próximos pasos priorizados en `README.md`.

## 7. Diagramas y verificación de la extensión de los entregables

Los cuatro diagramas (arquitectura, secuencia, flujo de decisiones y límites de IA) están en [`docs/diagrams/`](diagrams/README.md), con SVG, HTML interactivo y fuente regenerable.

Markdown no tiene paginación propia, así que la extensión se comprobó con una impresión A4: cada documento se convirtió a HTML con un conversor mínimo temporal (fuera del repositorio) y se imprimió a PDF con Google Chrome 158 sin interfaz, con márgenes de 15 mm, texto de 11 pt (14,67 px) y tablas compactas. Resultado final: `README.md` ocupa **2 páginas** y `docs/AI-USAGE.md` ocupa **1 página**. Es una medición aproximada: GitHub muestra estos archivos con otro estilo y, con su tipografía de pantalla, el texto ocupa más espacio.
