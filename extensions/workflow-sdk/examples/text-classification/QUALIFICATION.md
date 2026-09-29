---
type: 'Example Guide'
title: 'Puerta conjunta para candidatos'
---

# Puerta conjunta para candidatos

Esta capa conecta la aceptación funcional del SDK con la evaluación etiquetada del clasificador. El candidato se entrega como `flow.json`; su código se trata como datos y se ejecuta dentro del aislamiento existente. Política, dataset y criterios son entradas externas confiables del evaluador.

## Secuencia

1. Validar datos, criterios y ausencia de solapamiento exacto normalizado con fixtures.
2. Ejecutar los casos funcionales del SDK.
3. Ejecutar el candidato contra cada texto etiquetado, antes de registrarlo.
4. Comprobar accuracy, recall urgente, tasa de revisión, cobertura y errores.
5. Publicar mediante el SDK solo si ambas verificaciones pasan. La publicación repite sus casos funcionales.
6. Guardar una constancia `release.json` con hashes de todos los inputs y reportes.

Si falla una verificación, `result.json` indica `REJECTED`, la etapa y artifactId=null. Esa cualificación no publica el candidato ni crea una constancia de aprobación. Los errores operativos quedan con estado `ERROR`.

## Cualificar y publicar

Desde la raíz del SDK Linux:

```sh
node examples/text-classification/qualify.mjs \
  --spec examples/text-classification/flow.json \
  --policy examples/text-classification/policy.json \
  --dataset examples/text-classification/dataset-ilustrativo.jsonl \
  --criteria examples/text-classification/evaluation-criteria.json \
  --kind ilustrativo \
  --output .qualifications/priority-nueva \
  --registry .registry-qualified
```

El directorio de salida debe ser nuevo. Conserva definición, política, dataset, criterios, reportes, estado de evaluación, resultado y constancia. Contiene textos y etiquetas: tratarlo como datos de la evaluación. Los archivos se crean con permisos restringidos.

Una muestra declarada ilustrativa produce `releaseLevel: experimental`. Una muestra declarada real produce `evaluated-real-data`; esa declaración no verifica por sí sola procedencia, calidad del etiquetado o independencia del conjunto. Todavía no se recibieron datos reales del usuario.

## Ejecutar usando la aprobación conjunta

```sh
node examples/text-classification/run-qualified.mjs \
  --qualification .qualifications/priority-nueva \
  --registry .registry-qualified \
  --input examples/text-classification/input.json \
  --state .state-qualified \
  --run-id qualified-001 \
  --allow-experimental true
```

`--allow-experimental true` es obligatorio para una aprobación basada en datos ilustrativos; por defecto se rechaza. La opción es del operador del host, no del candidato. Para recuperar el mismo resultado añadir `--resume true` conservando entrada e identificador.

El lanzador comprueba:

- Integridad de la constancia y los siete archivos fijados.
- Misma implementación del cualificador y métricas.
- Correspondencia de filas, etiquetas y hashes con el dataset.
- Recomputación de métricas y cumplimiento de los criterios guardados.
- Coincidencia de definición, política, versión publicada y runtime.
- Estado final de aprobación y permiso explícito para experimentos cuando corresponda.

Cambiar dataset, criterios o evidencia después de aprobar provoca rechazo por integridad. Cambiar cualificador o runtime exige una nueva cualificación. Los hashes son constancias locales de integridad, no firmas contra quien pueda reescribir el host y toda la evidencia.

## Frontera de esta capa

La CLI base `src/cli.mjs publish` y la API `publish()` del SDK siguen verificando aceptación funcional. La aprobación conjunta se exige al utilizar `qualify.mjs` y `run-qualified.mjs`. Una aplicación que necesite ambos controles debe usar este lanzador y limitar el acceso a las APIs de menor nivel; no se instaló una política global que bloquee llamadas directas al SDK.

Este perfil concreto usa las categorías urgente, normal y revisión. Aporta un patrón para otros evaluadores, pero no incorpora aún selección automática de perfiles, un proveedor LLM, generación/reparación autónoma, datos reales ni servicio permanente. La calidad sigue dependiendo de criterios externos pertinentes y muestras apropiadas.

## Pruebas

```sh
node --test test/qualification.test.mjs
```

Tres pruebas operativas pasaron en el VPS:

1. Candidato incorrecto en los casos funcionales: rechazado antes de publicar.
2. Mutación que supera los 28 casos funcionales pero pierde una urgencia en el dataset: rechazada en evaluación, sin registro creado.
3. Candidato correcto: aprobado como experimental; ejecución bloqueada sin opción explícita; ejecución y recuperación correctas con ella; modificación de criterios detectada y rechazada.

La muestra ilustrativa tiene seis ejemplos y se usó previamente para desarrollar las reglas. La aprobación obtenida demuestra este circuito, no precisión independiente ni preparación para decisiones operativas reales.
