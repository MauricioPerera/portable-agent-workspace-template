---
type: 'Validation Evidence'
title: 'Publicación del caso de uso con GLM'
---

# Validación del cambio documental

Fecha: 2026-09-21. Cambio: sección de caso de uso en la landing, enlace en README y documentación con evidencia independiente en docs/casos/. No cambia el runtime ni añade datos al contexto por defecto de las instancias.

| Comando | Código | Resultado |
| --- | ---: | --- |
| `python scripts/validate_okf_nodes.py` | 0 | Metadatos y destinos locales válidos. |
| `python scripts/validate_template.py` | 0 | Estructura, manifiesto y rutas del núcleo válidos. |
| `python -m unittest discover -s tests -v` | 0 | 18 pruebas; OK en 10,291 s. |
| `git diff --check` | 0 | Sin errores de espacios. |

El [caso documentado](../docs/casos/negocio-glm.md) distingue resultados observados, declaraciones del delegado y límites. La evidencia JSON publicada contiene comandos y comprobaciones sin rutas personales ni credenciales.
