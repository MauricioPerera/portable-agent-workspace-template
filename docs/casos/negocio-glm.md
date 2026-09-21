---
type: 'Use Case'
title: 'Un negocio, varios proyectos y una misma IA'
---

# Un negocio, varios proyectos y una misma IA

Un usuario puede organizar ventas, gastos y seguimiento como proyectos dentro de su workspace y pedir a su IA que combine información entre ellos. Probamos este caso con datos ficticios y GLM: creó los proyectos, calculó un resumen y retomó el trabajo en una sesión nueva para actualizar y trasladar el informe.

Este es un caso de uso documentado de la plantilla existente. Las herramientas y los datos del ejemplo se crearon en una instancia independiente; no vienen incluidos en el scaffold ni se cargan como contexto por defecto.

## Qué pidió el usuario de prueba

> Quiero tener ventas y gastos como proyectos separados, y otro proyecto con un resumen mensual que use la información de ambos y muestre ventas, gastos y diferencia. Guarda los datos recibidos para conservarlos. Deja el resumen actualizado y una forma de volver a calcularlo cuando cambien los datos.

Después, en una sesión nueva:

> Añade una nueva venta de 25 EUR del 25 de enero de 2026. Conserva los originales. Mueve el informe mensual a un proyecto llamado seguimiento y deja funcionando el recálculo en esa nueva ubicación, actualizando las referencias necesarias.

Estos extractos resumen las peticiones utilizadas. La prueba no entregó al modelo una solución ni las cifras esperadas del resumen.

## Qué hizo GLM

1. Creó una instancia limpia con el scaffold y verificó su primer uso.
2. Conservó los CSV recibidos en `proyectos/entradas/` y creó copias de trabajo en los proyectos de ventas y gastos.
3. Creó un proyecto de resumen con un script Python que lee ambos CSV, agrupa por mes y calcula ventas menos gastos. Añadió una skill, su contrato y las referencias correspondientes.
4. En otra sesión, incorporó la nueva venta, movió el informe y su script al proyecto de seguimiento y actualizó las rutas del contrato y la skill.

Estructura relevante al finalizar:

```text
proyectos/
  entradas/       originales conservados
  ventas/         ventas.csv, actualizado con la nueva venta
  gastos/         gastos.csv
  seguimiento/    resumen.py y resumen.json
```

El agente ejecuta el trabajo entre proyectos usando los archivos del workspace. La actualización se realiza cuando se le pide o se ejecuta el script; la plantilla no proporciona sincronización automática entre carpetas.

## Resultados comprobados

Todos los importes de esta prueba son ficticios y están expresados en EUR. Diferencia significa ventas menos gastos.

| Estado | Mes | Ventas | Gastos | Diferencia |
| --- | --- | ---: | ---: | ---: |
| Inicial | Enero de 2026 | 200 | 50 | 150 |
| Inicial | Febrero de 2026 | 200 | 40 | 160 |
| Tras añadir la venta | Enero de 2026 | 225 | 50 | 175 |
| Tras añadir la venta | Febrero de 2026 | 200 | 40 | 160 |

El anfitrión comprobó las cifras independientemente del informe de GLM. También verificó que la nueva venta apareciera una sola vez, que el informe se recalculara en su nueva ubicación y que no se recreara la ruta antigua. Los hashes de los originales y las reglas se mantuvieron tras el traslado; los scripts base coincidieron byte a byte con la distribución. La validación estructural, los enlaces Markdown y la comprobación de primer uso terminaron con código 0.

Ver [evidencia de las comprobaciones independientes](negocio-glm-evidencia.json).

## Cómo se realizó la prueba

- Fecha: 21 de septiembre de 2026. Plantilla: 0.4.0.
- Modelo: `glm-5.3-flash:cloud`, mediante Ollama y Claude Code, en Windows con Python 3.14.6.
- Tres procesos nuevos, sin reanudar sesiones ni enviar la conversación previa o la conclusión del anfitrión. Las fases compartieron únicamente el estado de trabajo del workspace como continuidad de la tarea; conservaron el entorno y la configuración global del agente.
- GLM inicializó y modificó la instancia. El anfitrión preparó las peticiones y comprobó el resultado, sin corregir la implementación.
- Duración de los delegados: 67,56 s para inicializar, 212,87 s para los proyectos y el resumen, y 118,30 s para actualizar y trasladar. Total: unos 6 min 39 s. Excluye preparativos, verificaciones del anfitrión e incidencias de conectividad de un intento anterior; no es una promesa de rendimiento.

## Qué demuestra y qué queda fuera

La prueba confirma este recorrido concreto: varios proyectos en una instancia, información combinada entre ellos, traslado de resultados y continuidad en una sesión nueva a partir de los archivos. Las peticiones se expresaron como necesidades de negocio, pero fue una prueba supervisada por otro agente, no un estudio con usuarios no técnicos.

Se probó el scaffold local, no la instalación desde el enlace a `prompt.md` en un equipo nuevo. No se evaluaron todos los modelos ni datos arbitrarios. El script generado usa `float`, no valida identificadores duplicados ni fechas completas, y su `test_command` ejecuta el cálculo sin contrastar cifras esperadas: por eso se verificaron aparte.

GLM informó de dos incidencias que resolvió: una fila CSV añadida sin salto previo y una inicialización Git accidental que revirtió. Se comprobó el estado final; estas incidencias son parte del reporte del delegado.

[Volver a la página](../index.html#caso-de-uso) · [Leer la especificación](../../WORKSPACE-SPEC.md)
