---
type: 'Validation Evidence'
title: 'Portabilidad de la plantilla 0.4.2 con dos agentes'
date: '2026-09-25'
---

# Portabilidad con dos agentes

Se entregó el mismo brief y los mismos dos CSV ficticios a dos agentes en carpetas aisladas, cada una con una copia idéntica de la distribución 0.4.2. El brief y las entradas no se modificaron durante las pruebas. La tarea exigía generar una instancia, conservar originales, calcular un resumen mensual entre proyectos, añadir una venta, trasladar el resumen y su script, crear una skill con contrato y comprobar el resultado.

| Agente | Entorno | Resultado |
| --- | --- | --- |
| Codex (`gpt-6-sol`) | Agente independiente con contexto nuevo | Caso completo; validadores y test del contrato con código 0. |
| GLM (`glm-5.3-flash:cloud`) | Claude Code conectado a Ollama Cloud | Caso completo; validadores y test del contrato con código 0. |

Los hashes SHA-256 compartidos fueron: brief `07550b07f915e03ad122ffa46ea474c60f31880490c07e95eb257956531019ac`, ventas `9f37384d259484f9aa887607a024ed3db357c1e177006c24076da1782a21375d` y gastos `0681f96ce4425fdbb0ad9f90683167a235208b68c920436f9c1c4efe6a4cecb7`. Ambas copias de `distribution/` conservaron los mismos archivos y hashes que el árbol de trabajo usado para iniciar la prueba, excluyendo únicamente la caché Python.

## Comprobación independiente

Un script externo a ambas instancias leyó los CSV con `Decimal` y contrastó originales, copias de trabajo, JSON inicial y final, recálculo tras el traslado y ausencia de la ruta antigua. Estos fueron los totales observados en ambas instancias:

| Estado | Mes | Ventas | Gastos | Diferencia |
| --- | --- | ---: | ---: | ---: |
| Inicial | 2026-01 | 200.00 | 50.00 | 150.00 |
| Inicial | 2026-02 | 200.00 | 40.00 | 160.00 |
| Final | 2026-01 | 225.00 | 50.00 | 175.00 |
| Final | 2026-02 | 200.00 | 40.00 | 160.00 |

En ambos casos, `validate_workspace.py`, `validate_okf_nodes.py`, `check_first_run.py`, el script final de resumen y el `test_command` propio del contrato devolvieron código 0. Se cambió temporalmente el valor de ventas de enero en cada JSON final: ambos tests de contrato devolvieron código 1; tras restaurarlo devolvieron código 0. Los originales en `proyectos/entradas/` conservaron exactamente los bytes recibidos y la venta nueva apareció una sola vez en la copia de trabajo. Codex corrigió una ruta relativa errónea durante una comprobación diagnóstica antes del resultado final.

Esta prueba demuestra el recorrido concreto con dos modelos y dos entornos de ejecución. Usa datos ficticios y supervisión independiente; no certifica todos los agentes, tareas de negocio o fuentes externas. La descarga de la release y su checksum se comprueban por separado con la prueba automatizada del paquete.
