---
type: 'Workspace Constitution'
name: 'Portable Agent Workspace'
version: '1.1.0'
description: 'Workspace portable basado en archivos, skills y contratos deterministas.'
---

# Constitución del Workspace

Este directorio es una **plantilla de workspace portable**, no un agente ligado a un modelo. El agente que lo abra —Gemini, Codex, Claude u otro— es un ejecutor temporal; las reglas, el conocimiento, las skills, la memoria y la evidencia viven aquí.

## Protocolo de primera lectura

1. Leer este `AGENTS.md` antes de actuar.
2. Leer `manifest.yaml` para descubrir la estructura y el idioma del workspace.
3. Consultar `skills/index.md` y `context/index.md` antes de cargar documentos completos.
4. Si la tarea corresponde a una skill, leer su contrato en `contracts/` y ejecutar su `test_command`.
5. No declarar una tarea completada sin evidencia del comando determinista correspondiente.

## Reglas de operación

### Veracidad y fail-closed

No inventar datos, tarifas, políticas ni valores faltantes. Si un dato requerido no existe en el conocimiento del workspace, detenerse y pedir confirmación.

### Contratos y oráculos

Los contratos definen entradas, salidas, perímetro y pruebas. El razonamiento del agente no sustituye un oráculo determinista. Un resultado solo es válido si su prueba devuelve código 0.

### Soberanía y portabilidad

El workspace debe poder ser interpretado sin depender de una plataforma concreta. Las convenciones específicas de cada editor deben apuntar a este archivo y no duplicar sus reglas.

### Plantilla limpia

La plantilla no contiene conocimiento de dominio, datos de clientes, ejemplos operativos ni secretos. Los ejemplos se distribuyen como workspaces independientes y nunca forman parte del contexto por defecto.

### Memoria auditable

Las correcciones del usuario se registran en `memoria/log_sesiones.md`. Las preferencias repetidas o explícitamente consolidadas pasan a `memoria/preferencias_consolidadas.md`.

### Cambios controlados

Antes de modificar archivos, identificar el contrato aplicable. Preservar los archivos de entrada del usuario y registrar la evidencia de ejecución en `reports/` cuando exista un entregable.

## Capas del workspace

- `context/`: conocimiento estático y fuentes de verdad.
- `skills/`: procedimientos reutilizables.
- `contracts/`: contratos de tarea y criterios de aceptación.
- `memoria/`: memoria dinámica y preferencias.
- `proyectos/`: insumos y resultados de ejemplos o ejecuciones.
- `scripts/`: validadores y oráculos sin LLM.
- `reports/`: evidencia verificable de ejecuciones.
