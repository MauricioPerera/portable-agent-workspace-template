---
type: 'Acceptance Report'
title: 'Aceptación local de la plantilla 0.4.0'
---

# Resultado y alcance

Esta revisión convierte el prompt en la vía principal y el scaffold sin parámetros en una alternativa equivalente. La instancia entrega una tarea de inventario ejecutada, su contrato, oráculo y evidencia. La distribución queda separada del workspace operativo.

## Evidencia reproducible

- [Ejecución de gates](validation-0.4.0.json): comandos, salidas, códigos, entorno y hashes del código revisado.
- [Mediciones de ambos recorridos](acceptance-metrics.json): tiempo local observado, número de comandos y ausencia de solicitudes interactivas durante esos comandos.
- [Suite de aceptación](../tests/test_workspace_acceptance.py) y [tests originales](../tests/test_init_workspace.py).

Ejecutar desde el distribuidor:

```sh
python scripts/validate_okf_nodes.py
python scripts/validate_template.py
python -m unittest discover -s tests -v
```

La suite ejecuta el comando marcado en el prompt extraído de un ZIP sin metadatos Git. Ejecuta también el scaffold sin parámetros en otra distribución temporal y compara todos los archivos estables, incluido el inventario. Las diferencias esperadas son los tiempos, las marcas de ejecución y la etiqueta de procedencia de los reportes.

## Requisitos contrastados

| Requisito | Evidencia |
| --- | --- |
| Inicio sin conocimientos de estructura ni decisiones obligatorias | Prompt con detección de capacidades y valores predeterminados; comando por defecto cubierto por test. |
| Prompt y scaffold equivalentes | Test que extrae y ejecuta literalmente los bloques de creación/verificación del prompt, y compara con el scaffold. |
| Primera tarea funcional | Inventario de identidad, fuentes y skills; oráculo independiente compara filesystem y hashes. |
| Datos de dominio no inventados | Contexto y preferencias iniciales vacíos; inventario sin fuentes de negocio. |
| Fallos reales impiden éxito | Tests de runtime averiado, recursos ausentes, evidencia ausente/alterada y resultado incorrecto. |
| Metadatos y contratos verificables | Casos de YAML inválido, claves duplicadas, contrato incompleto y referencias rotas rechazados. |
| Preservación y transporte | Rechazo de destinos poblados; checkout Git con conversión de líneas; originales conservados byte a byte. |
| Recuperación tras cambios | Un cambio de entrada invalida evidencia; repetir primer uso la actualiza. Resultados borrados pueden regenerarse. |
| Distribuidor separado | La instancia no contiene web, workflows de publicación ni validador de plantilla. |
| Procedencia y memoria | Versión y digest del generador en manifiesto; lectura de preferencias y tratamiento de contradicciones en constitución. |

## Límites de la evidencia

La ejecución local documentada usa Windows y el Python indicado en el JSON. La matriz de CI está configurada para Windows, Linux y macOS con Python 3.10 y 3.14; no se presenta su configuración como prueba de ejecuciones remotas aún no realizadas.

La equivalencia probada es la de los comandos y sus artefactos. No es un benchmark de todos los modelos de IA, del razonamiento de un agente ni de redes. Los tiempos medidos excluyen la descarga, preparación del ZIP y razonamiento; no son una promesa universal de instalación.

La validación de Markdown cubre el subconjunto declarado, no CommonMark/YAML completos. No certifica veracidad de fuentes, ausencia de secretos ni autenticidad contra un actor que pueda cambiar código y evidencia conjuntamente. Los tests de dominio siguen siendo responsabilidad de cada contrato futuro.

## Estado de entrega

Cambios preparados en una rama local y revisables. La publicación de la revisión es una acción separada: mientras no se integre en la rama publicada, el enlace remoto conserva la versión anterior. No se migraron ni sobrescribieron instancias existentes.
