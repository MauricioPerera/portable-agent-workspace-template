---
type: 'Workspace Guide'
title: 'Portable Agent Workspace Template'
---

# De un prompt a un workspace funcional

Entrega a tu IA el enlace al [prompt](https://mauricioperera.github.io/portable-agent-workspace-template/prompt.md). Tu agente obtiene la plantilla, crea tu workspace, ejecuta una primera tarea y comprueba su resultado. No necesitas conocer Git ni la estructura interna.

```text
Lee y sigue este prompt para crear y usar mi Portable Agent Workspace:
https://mauricioperera.github.io/portable-agent-workspace-template/prompt.md
```

La IA necesita acceso a archivos y ejecución local, Python 3.10 o posterior y acceso a la distribución. El prompt detecta capacidades y explica cualquier impedimento real. No hay paquetes Python de terceros. No se garantiza instalación desde un chat que carezca de esas herramientas.

## Alternativa técnica

Descarga el ZIP o clona este repositorio. Desde su raíz:

```sh
python scripts/init_workspace.py
```

Genera `../mi-workspace`, ejecuta su inventario inicial y su oráculo, y entrega evidencia. Sin preguntas interactivas. El nombre y el destino son opcionales:

```sh
python scripts/init_workspace.py --name "Mi Equipo" --destination ../mi-equipo
```

Usa `python3`, `py -3` o la ruta de tu intérprete si ese es el nombre disponible. Los destinos poblados se rechazan sin sobrescritura. Los fallos de validación no entregan una instancia parcial. Abre la carpeta generada con tu IA y pide tu primera tarea.

## Qué recibes

| Capa | Función |
| --- | --- |
| AGENTS.md y manifiesto | Reglas, orden de lectura y procedencia de la plantilla. |
| context/ | Fuentes autorizadas; comienza sin conocimiento de negocio. |
| skills/ y contracts/ | Procedimiento de primer uso y criterio verificable; añade después los de tu dominio. |
| memoria/ | Correcciones y preferencias que el agente consulta al empezar. |
| proyectos/ | Originales preservados en entradas/ y resultados separados. |
| scripts/ y reports/ | Validación, inventario y evidencia con hashes y tiempo observado. |

La primera tarea comprueba qué fuentes y capacidades existen. Es una operación real y reproducible; no inventa conocimiento profesional. Los agentes reciben adaptadores delgados que remiten a la constitución.

Desde la **instancia**, puedes verificar sin regenerar el resultado:

```sh
python scripts/validate_workspace.py
python scripts/check_first_run.py
```

Para repetir su diagnóstico después de cambios: `python scripts/first_run.py`. Las pruebas estructurales no certifican la veracidad de documentos ni ausencia de secretos. Consulta la [especificación](WORKSPACE-SPEC.md) para los límites exactos.

## Mantener la plantilla

Este repositorio es el **distribuidor**. «Use this template» copia el distribuidor, no reemplaza el paso de inicialización. Su web, tests y workflows no se copian a la instancia. Los datos y ejemplos de dominio viven en repositorios independientes.

Lee [AGENTS.md](AGENTS.md), [manifest.yaml](manifest.yaml), los índices y el [contrato de inicialización](contracts/init-workspace.md). Desde esta raíz:

```sh
python scripts/validate_okf_nodes.py
python scripts/validate_template.py
python -m unittest discover -s tests -v
```

Las pruebas ejecutan los comandos del prompt desde un ZIP temporal, comparan el resultado con el scaffold, verifican transporte por Git y cubren casos inválidos. No equivalen a probar todos los modelos de IA ni miden la velocidad de descarga. El workflow incluye Windows, Linux y macOS con Python 3.10 y 3.14.

Actualizar una instancia: generar otra carpeta, comparar scripts/reglas y trasladar mejoras preservando memoria, contratos e insumos. La versión y digest de origen quedan en el manifiesto; no hay actualización destructiva automática.

Distribución bajo [MIT](LICENSE). Ver [publicación](PUBLISHING.md) y [prompt incluido](docs/prompt.md).
