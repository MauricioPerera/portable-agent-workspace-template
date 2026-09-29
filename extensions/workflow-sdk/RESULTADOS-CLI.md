---
type: 'Evidence Report'
title: 'CLI local para agentes'
---

# CLI local para agentes — evidencia de implementación

Fecha: 2026-09-29. Proyecto: `portable-workflow-sdk` 0.1.0.

## Cambios

- Catálogo local de siete operaciones con términos de descubrimiento en español, inglés y portugués, contratos de argumentos, efectos y requisitos de plataforma.
- `search`, `schema` y `validate`; los comandos anteriores se conservan.
- `--dry-run` para validar, compilar, verificar, publicar y ejecutar. Expone pasos, referencias, hashes, permisos, presupuestos y destinos.
- El analizador usa los contratos del catálogo; rechaza flags desconocidos, duplicados y argumentos ausentes. Los errores son JSON en stderr.
- La lectura de artefactos ya no crea registros o directorios ausentes. Verificar y ejecutar mantiene el sandbox Linux y la política externa existente.
- `validatePolicy` se exporta para reutilizar el mismo validador en la CLI y la verificación funcional.

No se añadieron servicios, autenticación ni dependencia de Cloudflare. Los planes no prueban la corrección del código. El plan de ejecución comprueba evidencia previa y entrada; no reserva IDs ni comprueba recuperación de checkpoints.

## Pruebas ejecutadas

| Entorno | Comando | Exit | Resultado |
| --- | --- | --- | --- |
| Windows, Node 24.16.0 | `npm.cmd test` desde la extensión | 0 | 19 pruebas: 11 correctas, 8 operativas omitidas, 0 fallos; 5,95 s |
| VPS Linux, Node 22.22.2 | `npm --prefix /tmp/workflow-sdk-core-pr6 ci --ignore-scripts --no-audit --no-fund` | 0 | 60 paquetes instalados |
| VPS Linux, Node 22.22.2 | `npm --prefix /tmp/workflow-sdk-core-pr6 test` | 0 | 19 correctas, 0 omitidas, 0 fallos; 17,73 s |

La prueba Linux utilizó una copia nueva en `/tmp/workflow-sdk-core-pr6` y registros temporales eliminados por las pruebas. Las instalaciones anteriores del SDK y sus artefactos se conservaron. No se creó un servicio permanente. Esta distribución contiene el núcleo genérico: los casos de clasificación y sus evaluaciones permanecen fuera de la plantilla.

### Casos específicos de la nueva CLI

`test/cli.test.mjs` contiene cuatro pruebas:

1. Descubrir todas las operaciones, consultar sus contratos y comprobar rechazo de flags inventados; consultas en tres idiomas y operación inexistente.
2. Diferenciar contratos válidos de calidad funcional; rechazar entrada incorrecta, flags repetidos y política que permite menos recursos que los declarados.
3. Obtener planes de fuentes que lanzarían un error al ejecutarse, sin ejecutar dichas fuentes ni crear destinos de evidencia o registro.
4. En Linux, publicar tras verificar, planificar sin crear estado, rechazar un registro inexistente sin crearlo, ejecutar dos pasos, recuperar sin nuevas invocaciones y rechazar un artefacto alterado.

La suite del núcleo también pasó: aislamiento de archivos, credenciales, procesos y red; límites de memoria, tiempo y salida; aceptación funcional, recuperación tras caída y bloqueo concurrente.

La primera prueba de descubrimiento detectó que una coincidencia en la descripción podía desplazar el nombre exacto de la operación. Se corrigió su prioridad y se ejecutó de nuevo la suite completa en ambos entornos.

## Uso recomendado por una IA

1. `search` para descubrir una operación y `schema` para leer argumentos y efectos.
2. Definir el flujo y consultar los contratos de autoría del README. Los criterios de calidad pertenecen al usuario o evaluador; no modificarlos para aprobar el candidato.
3. `validate` con especificación, política y entrada de ejemplo.
4. `publish --dry-run` para inspeccionar el plan; un plan correcto aún necesita ejecución de fixtures.
5. `verify` para obtener diagnósticos; corregir fuentes manteniendo criterios externos.
6. `publish` para verificar de nuevo y registrar el artefacto aprobado.
7. `run --dry-run` y después `run` para una entrada real.

`verify` prueba fixtures del flujo, no audita un run histórico. La clasificación de textos sigue necesitando evaluación representativa de su aplicación: aprobar fixtures genéricos no acredita calidad con datos reales.

## Compatibilidad

El runtime identifica sus archivos por hash. Los cambios de `index.mjs` y `runtime.mjs` invalidan artefactos de versiones anteriores de forma deliberada. Volver a verificar y publicar para producir artefactos compatibles. No se migraron ni alteraron registros previos automáticamente.
