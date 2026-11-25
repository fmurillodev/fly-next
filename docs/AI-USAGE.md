# AI Usage & Decision Note

**FlyNext es un demo.** La IA participó en el análisis y la generación de propuestas. Las decisiones finales de producto, arquitectura y seguridad fueron responsabilidad del mantenedor. Detalle: [registro de decisiones de IA](evidence/AI-DECISION-LOG.md).

## 1. Herramientas

- **ChatGPT:** análisis, arquitectura, revisión, decisiones y referencias visuales previas al repositorio. Sus conversaciones no forman parte de la evidencia versionada del repositorio.
- **Agente de desarrollo en Gentle Shell:** implementación asistida, pruebas y validación (modelo no registrado).
- **Auxiliares, no modelos:** Gentle Shell, Engram (memoria), ODD (flujo), RDD (revisión por recibos, desactivada), skills y Archify (diagramas locales).

## 2. Outputs aceptados, rechazados o modificados

| Tema | Resultado | Validación |
| --- | --- | --- |
| Ports & Adapters, motor determinista | Aceptados | Tests sin HTTP |
| Conexión: "todo margen reducido es riesgo" | **Rechazado**; regla basada en evidencia | Tests en rojo y luego verdes |
| Regla del menor: "un menor activa revisión" | **Modificado**: exige una disrupción | Test por caso |
| Modelo de lenguaje en ejecución; base de datos | Diferido; excluida | Ninguno en el código |
| Revisión por recibos (RDD) | **Modificada**: consumía demasiado tiempo; se desactivó | Registro ODD |
| Mockups visuales | Adaptados a la implementación | Capturas a 375 y 1440 px |
| Escenarios públicos | Limitados a tres reservas | La API responde 404 al resto |

**Validación:** revisión humana por PR, contratos Zod, 340 tests, CI, pruebas de funcionamiento y revisión visual.

## 3. Decisiones del mantenedor

Track; arquitectura y stack; alcance de solo lectura; reglas de dominio; infraestructura; aprobación de cada fase; riesgos aceptados (revisión automatizada parcial, límite de solicitudes); sin modelo de lenguaje ni operaciones que modifiquen reservas.

## 4. Información que nunca se entregaría a un modelo

Datos personales de pasajeros, reservas reales, credenciales y tokens, datos de pago, información comercial confidencial, documentación interna no autorizada e información operacional sensible. *Limitación:* no hay evidencia versionada de lo compartido antes del repositorio.
