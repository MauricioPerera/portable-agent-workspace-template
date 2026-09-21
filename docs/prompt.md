---
type: 'Agent Prompt'
title: 'Prompt para implementar y usar Portable Agent Workspace'
description: 'Instrucciones portables para que un agente implemente y opere un workspace basado en archivos.'
---

# Prompt para implementar y usar Portable Agent Workspace

Usa estas instrucciones para crear o continuar un workspace portable de agentes de IA. Este prompt es agnóstico del modelo: puede aplicarse en Codex, Claude, Gemini u otro agente capaz de leer archivos locales.

## Objetivo

Crear un workspace donde el conocimiento, las reglas, las skills, la memoria y la evidencia sean archivos portables; el LLM es un ejecutor intercambiable, no el lugar donde vive el sistema.

## Implementación

1. Crea un repositorio desde la plantilla de GitHub o descarga la plantilla como ZIP.
2. Si tienes Python estándar, inicializa un workspace con:

   ```powershell
   python scripts/init_workspace.py --name "Nombre del Workspace" --destination ..\mi-workspace
   ```

   También puedes copiar la estructura de la plantilla manualmente; no requiere paquetes de terceros.
3. En el workspace resultante, lee primero `AGENTS.md` y después `WORKSPACE-SPEC.md`, `manifest.yaml`, `skills/index.md` y `context/index.md`.
4. Añade fuentes de verdad del dominio en `context/`. No inventes datos ni conviertas suposiciones en políticas.
5. Añade procedimientos reutilizables en `skills/` y un contrato correspondiente en `contracts/`.
6. Para cada contrato, define entradas, salidas, perímetro y un `test_command` determinista. No declares una tarea terminada sin ejecutar con éxito esa prueba.
7. Guarda insumos y resultados específicos en `proyectos/`, evidencia de ejecución en `reports/` y correcciones del usuario en `memoria/`.

## Reglas operativas para el agente

- `AGENTS.md` es la constitución del workspace y se lee antes de actuar.
- Si falta un dato necesario, detente y solicita confirmación: no inventes valores.
- Consulta los índices antes de cargar documentos completos para aplicar carga progresiva.
- Trata `context/` como fuente de verdad y `proyectos/` como insumos dinámicos.
- Las skills describen cómo hacer algo; los contratos prueban cuándo está aceptado.
- Conserva las reglas de cada herramienta como punteros delgados a `AGENTS.md`; no dupliques la constitución.
- No coloques secretos, credenciales o datos privados en prompts, contratos, reportes o repositorios públicos.

## Validación

Ejecuta estos gates antes de publicar o declarar listo un workspace:

```powershell
python scripts/validate_okf_nodes.py
python scripts/validate_template.py
python -m unittest tests.test_init_workspace
```

Para un workspace de dominio, ejecuta además el `test_command` de cada contrato aplicable.

## Distribución

La plantilla debe permanecer limpia: no incluyas datos de clientes, tarifas, políticas de negocio ni ejemplos operativos en el repositorio que usarás como GitHub Template. Publica los ejemplos como workspaces o repositorios independientes.

Repositorio: <https://github.com/MauricioPerera/portable-agent-workspace-template>

Especificación: <https://github.com/MauricioPerera/portable-agent-workspace-template/blob/main/WORKSPACE-SPEC.md>
