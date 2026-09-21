---
type: 'Workspace Specification'
title: 'Portable Agent Workspace Specification'
description: 'Especificación mínima para workspaces portables, agnósticos de modelo y verificables.'
version: '0.1.0'
---

# Portable Agent Workspace Specification

## Propósito

Un workspace es la unidad persistente de conocimiento y operación. El modelo que lo usa es intercambiable: el workspace debe poder ser leído por cualquier agente que respete `AGENTS.md`.

## Lectura obligatoria

`AGENTS.md` es el punto de entrada normativo. Debe indicar el orden de descubrimiento, las reglas de veracidad, el uso de contratos y el tratamiento de memoria.

## Estructura mínima

| Ruta | Requisito |
| --- | --- |
| `AGENTS.md` | Obligatorio; primera lectura. |
| `manifest.yaml` | Obligatorio; identifica versión, metodología y rutas. |
| `context/index.md` | Obligatorio; índice de fuentes de verdad. |
| `skills/index.md` | Obligatorio; índice de procedimientos. |
| `contracts/index.md` | Obligatorio; índice de contratos de tarea. |
| `memoria/` | Obligatorio; bitácora y preferencias consolidadas. |
| `proyectos/` | Obligatorio; insumos y resultados de trabajo. |
| `reports/` | Obligatorio; evidencia de ejecución. |
| `scripts/validate_okf_nodes.py` | Obligatorio; gate determinista sin dependencias externas. |

## Nodos OKF

Todo archivo Markdown del workspace debe incluir frontmatter YAML delimitado por `---` y el campo `type`. Los enlaces Markdown relativos deben resolver dentro del workspace.

## Skills y contratos

Una skill documenta el procedimiento. Un contrato declara entradas, salidas, perímetro y `test_command`. Ningún entregable se declara aceptado sin ejecutar con éxito el comando del contrato.

## Portabilidad

El núcleo no debe contener conocimiento de un dominio, datos personales, secretos ni ejemplos operativos. Las convenciones de herramientas concretas deben ser punteros delgados hacia `AGENTS.md`.

## Versionado

`manifest.yaml` debe contener `methodology` y `spec_version`. Cada workspace, skill y contrato versiona sus cambios de forma independiente.
