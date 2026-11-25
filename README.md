# FlyNext

*Your journey. Your next step.*

Asistente de disrupciones de viaje que transforma información operacional en recomendaciones claras, verificables y seguras para el pasajero. **FlyNext es un demo con datos sintéticos.** [Repositorio](https://github.com/fmurillodev/fly-next) · [Aplicación](https://flynext-api-production.up.railway.app) · [Swagger](https://flynext-api-production.up.railway.app/docs) · [Diagramas interactivos](https://fmurillodev.github.io/fly-next/)

## 1. Problema, resultado y alcance

Ante un retraso, el pasajero recibe datos que no coinciden y no sabe qué es seguro y qué es estimación. FlyNext reúne reserva, eventos, políticas y alternativas y devuelve una **evaluación verificable**: qué pasó, qué se sabe y qué no, riesgo de la conexión y recomendación. Reduce la incertidumbre (impacto no medido). **Nunca presenta una recomendación como acción ejecutada.**

**Track Backend/Integración:** el reto es convertir información incompleta y contradictoria en decisiones seguras, y eso ocurre en el servidor; React es complementario y sin reglas de negocio. **Implementado:** `POST /api/v1/disruptions/assessment`, motor de decisiones, interfaz responsive, despliegue único. **No implementado:** operaciones que modifican reservas, modelo de lenguaje, autenticación, sistemas reales, base de datos. **Supuestos** sin validar: umbral de 30 min, frescura 5/30/15 min, jerarquía de fuentes.

## 2. Arquitectura

<img src="docs/diagrams/svg/01-arquitectura-compacta.svg" alt="Arquitectura compacta: el navegador ejecuta React; un único proceso Fastify en Railway valida, evalúa con el motor de dominio, lee fuentes sintéticas y sirve los archivos estáticos." width="400" height="153">

React corre en el navegador; Fastify entrega la web y la API desde un solo proceso.

## 3. Decisiones y alternativas

*Alternativas tomadas de exclusiones de la especificación; repositorios y servicios separados no se evaluaron formalmente.*

| Decisión | Alternativa no elegida | Trade-off aceptado |
| --- | --- | --- |
| Motor determinista | Modelo de lenguaje durante la ejecución | Menos flexible; reproducible y sin políticas inventadas |
| Ports & Adapters pragmático | Arquitectura distribuida | Más estructura; dominio probado sin HTTP |
| Monorepo pnpm, contratos Zod compartidos | Repositorios separados, esquemas duplicados | Acopla apps; evita contratos divergentes |
| Fuentes sintéticas, evaluación sin persistencia | Sistemas reales, base de datos | Sin integración real ni historial; sin datos personales |
| Un servicio Railway, Fetch API | Despliegues separados, Axios | Web y API escalan juntas |
| Revisión humana recomendada | Ejecución automática | Más lento; ninguna acción sensible sin una persona |

## 4. Clasificación de decisiones

| Paso | Clasificación | Razón | Riesgo | Control / fallback |
| --- | --- | --- | --- | --- |
| Validación, fuentes y frescura | Determinístico (implementado) | Reglas exactas | Entrada abusiva | Zod, 1 KB, límite de solicitudes |
| Conexión | Determinístico (implementado) | `MISSED` exige confirmación | Declarar sin evidencia | `UNKNOWN`; sin tiempo mínimo de conexión no verificado |
| Políticas, alternativas, recomendaciones y mensajes | Determinístico (implementado) | Reglas R1–R5, plantillas | Prometer un beneficio | "Aplicable" ≠ ejecutado |
| Consultas ambiguas | AI-assisted (propuesto) | Lenguaje natural | Intención mal entendida | Salida validada; decide el motor |
| Orquestación de herramientas | Agentic (propuesto) | Consultas compuestas | Llamadas fuera de alcance | Solo lectura, allowlist |
| Acciones sensibles | Human-controlled (ejecución no implementada) | Impacto económico | Acción duplicada | Autorización (futuro) |

La revisión humana es una recomendación, no un escalamiento ejecutado; no hay rebooking real. Diseño futuro y ejemplo de consulta compuesta: [límites de IA](docs/diagrams/README.md#ejemplo-del-diseño-futuro).

## 5. Ejecución y validación

Node 24.15.0 y pnpm 12.16.1: `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm build`, `pnpm start` (puerto 3000; `pnpm dev` es solo para desarrollo). Reservas públicas: **ABC123**, **DEMO01**, **DEMO02**; `curl` en la evidencia técnica. **Validación:** 340 tests (50 contratos, 280 API, 10 frontend), CI en cada pull request, pruebas de funcionamiento en producción y capturas a 375 y 1440 px.

## 6. Riesgos y próximos pasos

**Riesgos:** reglas sin validar; límite de solicitudes sin aislamiento por cliente demostrado; revisión automatizada de código parcial; tests de interfaz posteriores al código; sin auditoría de accesibilidad ni pruebas de carga.
**Próximos pasos:** validar reglas con Operaciones; autenticación; límite de solicitudes por cliente; accesibilidad y carga; piloto AI-assisted de solo lectura.

[Evidencia técnica](docs/TECHNICAL-EVIDENCE.md) · [AI Usage](docs/AI-USAGE.md) · [Demostración](docs/DEMO.md) · [Diagramas](docs/diagrams/README.md) · [Ingeniería](docs/engineering/ARCHITECTURE.md) · [Registro de IA](docs/evidence/AI-DECISION-LOG.md)
