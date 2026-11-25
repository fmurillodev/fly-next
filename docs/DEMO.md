# FlyNext — Guía de demostración (10 minutos)

FlyNext es un demo. Esta guía es el guion de la presentación; no hay diapositivas. Se apoya directamente en los entregables del repositorio.

**Enlaces públicos:** [aplicación](https://flynext-api-production.up.railway.app) · [Swagger](https://flynext-api-production.up.railway.app/docs) · [repositorio](https://github.com/fmurillodev/fly-next) · [README](../README.md) · [evidencia técnica](TECHNICAL-EVIDENCE.md) · [AI Usage](AI-USAGE.md) · [diagramas](diagrams/README.md) · [diagramas interactivos](https://fmurillodev.github.io/fly-next/)

## Preparación (antes de empezar)

- Abrir en pestañas: la aplicación, `/docs`, el README y la [galería de diagramas](diagrams/README.md).
- Comprobar `https://flynext-api-production.up.railway.app/health` (debe responder `{"status":"ok"}`).
- Recordar que la API limita a 60 solicitudes por minuto por IP: no repetir consultas en bucle.

## Guion

| Minuto | Etapa | Qué mostrar | Mensaje principal |
| --- | --- | --- | --- |
| 0–1 | Problema y resultado | README, sección 1 | Un pasajero con un retraso recibe datos contradictorios. FlyNext los reúne y dice qué se sabe, qué no y qué se recomienda. Es un demo con datos sintéticos. |
| 1–3 | Arquitectura y decisiones | [Diagrama 1](diagrams/README.md#1-arquitectura-del-sistema) y la tabla de decisiones del README | Un solo servicio; el dominio no depende de Fastify ni de React; contratos Zod compartidos. Cada decisión tiene un trade-off declarado. |
| 3–5 | Motor y evidencia | [Diagrama 2](diagrams/README.md#2-secuencia-de-evaluación) y [3](diagrams/README.md#3-flujo-de-decisiones); luego `/docs` | El motor es determinista: reconcilia fuentes, mide frescura, evalúa la conexión, aplica políticas y alternativas, y recomienda. Ante la duda, declara incertidumbre. |
| 5–7 | Escenarios en vivo | La aplicación con ABC123, DEMO01 y DEMO02 (ver abajo) | Una conexión en riesgo no es una conexión perdida; un beneficio aplicable no es un cambio hecho; una alternativa no es una reserva. |
| 7–9 | Límites de IA, riesgos y trade-offs | [Diagrama 4](diagrams/README.md#4-límites-de-ia-y-decisiones); tabla de clasificación y riesgos del README | Hoy no hay LLM. La IA interpretaría y explicaría; el motor conserva la autoridad; las acciones sensibles siguen en manos humanas. |
| 9–10 | Validación y próximos pasos | [Evidencia técnica](TECHNICAL-EVIDENCE.md), secciones 5 y 6; próximos pasos del README | 340 tests, CI, pruebas de funcionamiento en producción. Limitaciones declaradas. Siguiente: validar reglas con Operaciones y autenticar reservas. |

## Escenarios (minuto 5–7)

Ingresar el código en el formulario o elegir el escenario de ejemplo de la página de inicio.

| Reserva | Qué se debe ver | Qué explicar |
| --- | --- | --- |
| **ABC123** | Evaluación parcial, severidad crítica; vuelo LA500 con retraso confirmado de 160 min y puerta 24; conexión en riesgo; recomendación de revisión humana con prioridad alta; ninguna acción ejecutada | La llegada de 20:35 es una proyección, no una llegada confirmada; por eso no se declara la conexión perdida. La alternativa LA2412 está pendiente de validar y LA2450 no tiene asientos para el grupo. |
| **DEMO01** | Evaluación completa, sin alteraciones, ninguna acción requerida | Que no haya disrupción también es un resultado verificable. |
| **DEMO02** | Evaluación completa; retraso confirmado de 190 min; política R1 (cambio sin costo) aplicable; recomendación de revisar opciones de cambio | "Aplicable" significa que el beneficio podría corresponder; el cambio no se hizo y la opción no está reservada. |

Equivalente por línea de comandos (también contra la URL pública):

```bash
curl -s -X POST https://flynext-api-production.up.railway.app/api/v1/disruptions/assessment \
  -H 'content-type: application/json' -d '{"bookingId":"ABC123"}'
```

DEMO03–DEMO06 son fixtures internos de pruebas; la API pública responde 404 para ellos. No presentarlos como reservas disponibles.

## Si Railway falla: demostración local

```bash
nvm use                          # Node 24.15.0
pnpm install --frozen-lockfile
pnpm build
pnpm start                       # http://localhost:3000 (interfaz, /docs y API)
```

Los diagramas y el README funcionan sin red. Capturas de respaldo en `docs/evidence/screenshots/`: [inicio en escritorio](evidence/screenshots/1440-home.jpg), [ABC123 en escritorio](evidence/screenshots/1440-ABC123.jpg), [inicio en móvil](evidence/screenshots/375-home.jpg) y [ABC123 en móvil](evidence/screenshots/375-ABC123.jpg).

## Preguntas probables

- **¿Por qué no un modelo de lenguaje?** Las decisiones de negocio deben ser reproducibles y auditables; un modelo podría inventar políticas u horarios. Se propone para interpretar y explicar, no para decidir ([diagrama 4](diagrams/README.md#4-límites-de-ia-y-decisiones)).
- **¿Qué falta para producción?** Sistemas reales, autenticación, validación de reglas con Operaciones, límite de solicitudes por cliente, accesibilidad y pruebas de carga (README, sección 6).
- **¿Cuánto tiempo tomó?** No hay una medición activa consistente; no se afirma el cumplimiento del límite de tres horas.
