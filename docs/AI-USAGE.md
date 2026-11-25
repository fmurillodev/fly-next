# AI Usage & Decision Note

**FlyNext es un demo.** La IA fue una herramienta dirigida por el mantenedor; no decidió producto, arquitectura ni seguridad. Ver [registro de decisiones](evidence/AI-DECISION-LOG.md).

## 1. Herramientas

- **ChatGPT:** análisis, arquitectura, revisión, decisiones y referencias visuales previas al repositorio. Declarado por el mantenedor; conversaciones no almacenadas (log #1), modelo no registrado.
- **Agente de desarrollo en Gentle Shell** (5.0.0 / Pi 1.6.0): implementación, pruebas y validación. Modelo no registrado.
- **Auxiliares, no modelos:** Gentle Shell, Engram (memoria), ODD (flujo), RDD (revisión por recibos, desactivada en este clon), skills de ingeniería y Archify 3.3.2 (Apache-2.0, solo en el proyecto, sin versionar; diagramas locales).

## 2. Outputs aceptados, rechazados o modificados

| Tema | Resultado | Validación |
| --- | --- | --- |
| Ports & Adapters, motor determinista | Aceptados (log #15) | Tests sin HTTP |
| Conexión: "todo margen reducido es `AT_RISK`" | **Rechazado**; regla por evidencia (log #17) | 7 aserciones rojo → verde |
| R5: "un menor activa revisión" | **Modificado**: exige disrupción (log #16) | Test por caso |
| LLM en ejecución; base de datos | Diferido; excluida (decisión del mantenedor) | Ninguno en el código |
| Revisión RDD | **Modificada**: el harness consumía demasiado tiempo; se desactivó | ODD L24 |
| Mockups visuales | Adaptados a la implementación (declarado por el mantenedor) | Capturas 375 y 1440 px |
| Despliegue | La IA agregó `railway.json` y lo retiró (log #11) | Humo público |
| Escenarios públicos | Solo ABC123, DEMO01, DEMO02 | API responde 404 al resto |

**Validación:** revisión humana por PR, contratos Zod, 340 tests, CI, humo, revisión visual y verificación pública; un verificador independiente halló brechas corregidas (log #13).

## 3. Decisiones del mantenedor

Track Backend/Integración; arquitectura y stack; alcance V1 de solo lectura; reglas de dominio (D01–D10, A01–A08, P5, P6, P10); Railway manual; gates G0–G5 con autorización por PR; riesgos aceptados (revisión nativa parcial, 404 sin ID, límite de ritmo); límites de automatización (sin LLM ni escrituras; push, merge y despliegue solo con permiso).

## 4. Información que nunca se entregaría a un modelo

Datos personales de pasajeros, reservas reales, credenciales y tokens, datos de pago, información comercial confidencial, documentación interna no autorizada e información operacional sensible (en el repositorio solo hay fixtures sintéticos). *Limitación:* las conversaciones previas al repositorio no se conservan, así que no se puede demostrar qué se compartió entonces; desde PR-00 el registro lo prohíbe.
