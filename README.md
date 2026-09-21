---
type: 'Workspace Guide'
title: 'Portable Agent Workspace'
description: 'Guía de uso del workspace portable basado en archivos, skills y contratos.'
---

# Portable Agent Workspace Template

Plantilla limpia para crear workspaces mínimos, portables y agnósticos del modelo. La carpeta conserva las reglas y los artefactos; Gemini, Codex, Claude u otro agente actúa como ejecutor temporal.

## Inicio rápido para un agente

Lee primero [AGENTS.md](AGENTS.md), después [WORKSPACE-SPEC.md](WORKSPACE-SPEC.md), [manifest.yaml](manifest.yaml), los índices de `skills/` y `context/`, y finalmente el contrato de la tarea aplicable.

## Capas

| Carpeta | Propósito |
| --- | --- |
| `context/` | Conocimiento y fuentes de verdad |
| `skills/` | Procedimientos reutilizables |
| `contracts/` | Entradas, perímetro y pruebas de aceptación |
| `memoria/` | Correcciones y preferencias consolidadas |
| `proyectos/` | Ejemplos e insumos de ejecución |
| `scripts/` | Validadores y oráculos deterministas |
| `reports/` | Evidencia de ejecución |

Esta plantilla no incluye ejemplos de dominio, políticas, tarifas ni datos de clientes. Cada ejemplo debe vivir en un workspace independiente.

## Gates actuales

```powershell
python scripts/validate_okf_nodes.py
python scripts/validate_template.py
python -m unittest tests.test_init_workspace
```

Un entregable no se considera válido si el oráculo aplicable no devuelve código 0.

## Crear un workspace nuevo

Desde esta carpeta:

```powershell
python scripts/init_workspace.py --name "Mi Workspace" --destination ..\mi-workspace
python ..\mi-workspace\scripts\validate_okf_nodes.py
```

El scaffold falla si el destino no está vacío; no sobrescribe workspaces existentes.

## Publicación

Consulta [PUBLISHING.md](PUBLISHING.md) para convertir este directorio en una plantilla de GitHub. La distribución directa es libre bajo la licencia [MIT](LICENSE).

## Prompt remoto para agentes

La GitHub Page publica un prompt Markdown autocontenido en [prompt.md](https://mauricioperera.github.io/portable-agent-workspace-template/prompt.md). Un agente puede recuperarlo con `fetch(...)` y seguir sus instrucciones.
