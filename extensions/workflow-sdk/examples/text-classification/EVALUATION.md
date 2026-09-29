---
type: 'Example Guide'
title: 'Evaluar textos etiquetados'
---

# Evaluar textos etiquetados

La herramienta está preparada para datos propios. Actualmente solo se probó con seis textos ilustrativos y tests de las métricas; todavía no hay datos reales del usuario. No se entrenó un modelo.

## Preparar datos

JSONL: un objeto JSON por línea, con exactamente estos tres campos:

```json
{"id":"texto-001","texto":"Necesito una respuesta inmediata.","categoria_esperada":"urgente"}
{"id":"texto-002","texto":"Cuando puedas, revisa mi solicitud.","categoria_esperada":"normal"}
{"id":"texto-003","texto":"Tal vez haga falta priorizar este asunto.","categoria_esperada":"revisión"}
```

Asignar etiquetas revisadas antes de mirar las predicciones. Guardar por separado ejemplos usados para diseñar reglas y ejemplos reservados para medirlas. El evaluador rechaza duplicados normalizados y coincidencias normalizadas exactas con fixtures de aceptación; no detecta todas las paráfrasis ni sabe si un texto se usó previamente para desarrollar reglas.

Requisitos: hasta 500 registros / 1 MiB; ID único de 1..64 caracteres; texto string de hasta 4096 caracteres; categorías exactas `urgente`, `normal` y `revisión`. El dataset ilustrativo incluido tiene dos ejemplos por categoría. Ese equilibrio es demostrativo y no representa una distribución real de solicitudes.

Para convertir un CSV UTF-8 con cabecera `id,texto,categoria_esperada`:

```sh
python3 examples/text-classification/csv_to_jsonl.py mis-textos.csv mis-textos.jsonl
```

Se utiliza el lector CSV de Python, con comillas, comas y saltos de línea en campos. La salida se crea como archivo nuevo; no se sobrescribe. La validación completa de IDs, textos y duplicados se realiza al evaluar el JSONL.

## Criterios externos

`evaluation-criteria.json` contiene límites explícitos, separados del clasificador:

```json
{
  "minAccuracy": 0.9,
  "minUrgentRecall": 1.0,
  "maxReviewRate": 0.5,
  "minPerCategory": 2,
  "maxRuntimeErrors": 0
}
```

Estos valores son **provisionales para la demostración**. No se determinaron a partir de costes, riesgo ni datos del usuario. Deben acordarse y fijarse antes de una evaluación real; no relajarlos después para ocultar resultados malos. Dos ejemplos por categoría permiten comprobar la herramienta, no estimar de forma fiable el rendimiento en producción.

## Ejecutar

Desde la raíz del SDK en el VPS, con el paquete corregido:

```sh
node examples/text-classification/evaluate.mjs \
  --dataset examples/text-classification/dataset-ilustrativo.jsonl \
  --criteria examples/text-classification/evaluation-criteria.json \
  --kind ilustrativo \
  --registry .registry \
  --artifact 868c3536f22212d9c2a758de0b8941c105e7eea8dc9927cc9c4d2c03578efd2d \
  --state .state-classification-evaluation \
  --output evidence/evaluacion-nueva.json
```

Usar un nombre de reporte nuevo en cada ejecución. Cada registro recibe un nuevo runId y pasa por el flujo registrado y su aislamiento. La evaluación ejecuta secuencialmente un flujo por texto. Para datos propios, sustituir la ruta del dataset y especificar `--kind real`; ese valor es una declaración del operador, no una certificación automática de procedencia.

La CLI devuelve código 0 si cumple todos los criterios, 2 si los resultados no los cumplen y 1 ante un error de configuración/dataset. Un reporte aceptado por esta herramienta no revoca otros paquetes ni altera el registro del SDK; el actor que despliega debe exigir ambos controles: aceptación funcional del SDK y aprobación de la evaluación elegida.

## Leer el reporte

- **Accuracy:** textos cuya categoría coincide con la etiqueta, dividido entre todos los registros.
- **Precision por categoría:** aciertos entre las predicciones de esa categoría.
- **Recall por categoría:** aciertos entre los textos etiquetados con esa categoría. El recall urgente detecta urgencias omitidas.
- **F1:** combinación de precision y recall mediante conteos de verdaderos positivos, falsos positivos y falsos negativos.
- **Tasa de revisión:** proporción de predicciones `revisión`, no una confianza estadística.
- **Matriz de confusión:** filas = categoría esperada; columnas = predicción. La columna `error` representa fallos de ejecución.
- **Mismatches:** IDs, predicciones, etiquetas, reglas y errores para revisar.

Los fallos de ejecución cuentan en el denominador y como predicciones perdidas; no se omiten para mejorar métricas. Si falta una categoría, su recall es null y el control de cobertura falla. Precision puede ser null si nunca se predijo una categoría.

El reporte registra hashes del dataset, criterios, evaluador, artefacto y runtime, además de runIds y tiempos. No incluye el texto original en los resultados, solo su hash. Los checkpoints del SDK sí guardan los inputs; el directorio de estado debe tratarse como parte de los datos de la evaluación. Los hashes son controles locales de integridad, no firmas.

## Prueba ilustrativa realizada

La versión inicial obtuvo 5/6 aciertos y omitió una urgencia: no reconocía `inmediata`. Su evaluación incumplió accuracy y recall urgente. Se corrigió la regla y añadió un fixture de regresión con un texto distinto; la versión nueva pasó 28 casos de aceptación y obtuvo 6/6 en la misma muestra ilustrativa.

Como esa muestra se utilizó para detectar y corregir el defecto, el resultado posterior es una regresión sobre ejemplos de desarrollo, **no un conjunto independiente para estimar precisión**. El siguiente paso cuando existan datos será medir una muestra reservada, etiquetada y revisada del dominio.

Pruebas de la herramienta:

```sh
node --test test/evaluation.test.mjs
```

Seis tests verifican urgencias omitidas, fallos de runtime, clases ausentes, criterios cumplidos, datos inválidos/duplicados y solapamiento con fixtures.
