---
type: 'Validation Evidence'
title: 'Verificación de correcciones de la auditoría'
date: '2026-09-25'
---

# Verificación de correcciones de la auditoría

Versión de plantilla: 0.4.1. Versión de especificación: 0.2.0.

Se creó una instancia nueva con Python 3.14.6 en Windows y se importó el documento real de esta distribución, `PUBLISHING.md`, como fuente en `context/guia-publicacion.md`. Una copia byte a byte quedó en `proyectos/entradas/`. El SHA-256 del original fue `56e4746230213730ec762ab72dcbf024e10291c16000ddae91fc8b362a52436f`.

| Paso | Código observado | Resultado |
| --- | ---: | --- |
| Crear instancia | 0 | Generación y primer uso inicial correctos. |
| Repetir primer uso y verificar | 0 | Inventario y hash de la fuente coinciden; original preservado. |
| Modificar contenido de la fuente y verificar | 1 | Se detecta `Source content changed`. |
| Repetir primer uso y verificar | 0 | Evidencia actualizada y válida; original preservado. |
| Eliminar `elapsed_seconds` de la evidencia de inicialización y verificar | 1 | Se detecta `Missing measured initialization duration`. |
| Restaurar la evidencia y verificar | 0 | La instancia vuelve a pasar. |
| Añadir un contrato no autorizado a una copia de la distribución | 1 | `validate_template.py` rechaza el archivo. |

La suite conserva este recorrido con `test_real_publishing_guide_roundtrip`. Las demás pruebas de regresión cubren fuentes anidadas, archivos no autorizados y los campos obligatorios de la evidencia. La fuente usada es documentación real de la distribución; esta prueba no evalúa la veracidad de fuentes externas ni la calidad de tareas de dominio futuras.
