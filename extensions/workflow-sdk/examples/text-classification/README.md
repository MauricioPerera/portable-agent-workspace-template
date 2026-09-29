---
type: 'Example Guide'
title: 'Clasificador de prioridad'
---

# Clasificador de prioridad: urgente, normal y revisión

Primer caso de uso del SDK con las categorías elegidas por el usuario. Utiliza dos tareas propias: normalizar texto y clasificarlo mediante reglas léxicas. No utiliza un modelo entrenado ni requiere datos de entrenamiento.

## Entradas y salida

```json
{ "id": "solicitud-001", "texto": "URGENTE: estoy bloqueado y no puedo trabajar" }
```

Resultado:

```json
{
  "id": "solicitud-001",
  "texto_normalizado": "urgente: estoy bloqueado y no puedo trabajar",
  "categoria": "urgente",
  "requiere_revision": false,
  "reglas_aplicadas": ["urgente.explicita", "urgente.bloqueo"]
}
```

El identificador se conserva. `revisión` lleva tilde en el valor de categoría; las claves JSON y los identificadores de reglas usan nombres sin tilde. La señal `requiere_revision` es una regla de derivación, no una probabilidad o confianza estadística.

## Política de clasificación actual

| Situación | Categoría |
| --- | --- |
| Urgencia explícita, respuesta inmediata, bloqueo o caída del servicio según patrones definidos | urgente |
| Negación explícita de urgencia, ausencia de prisa o texto sin señales de urgencia | normal |
| Texto vacío, incertidumbre o mezcla de señales urgentes y normales | revisión |

Se normalizan Unicode a NFC, espacios y mayúsculas. Para buscar reglas se ignoran tildes; el texto normalizado devuelto las conserva. Las palabras se comparan con límites de palabra para evitar, por ejemplo, que `desbloqueado` se interprete como `bloqueado`. Las frases reconocidas de negación se eliminan antes de buscar urgencia explícita; se conserva su señal para detectar contradicciones con otras reglas.

Las reglas son finitas y visibles en `tasks/clasificar.cjs`. No se interpreta semántica general, ironía, toda forma de negación ni gravedad de un incidente. Por ejemplo, `urgente` puede ser parte de un relato histórico y activar una regla. Antes de usarlo para priorizar solicitudes reales, ampliar criterios y casos con lenguaje del dominio y revisar los resultados. No se estimó precisión sobre datos reales etiquetados.

## Ejecución

Desde la raíz del SDK en Linux:

```sh
# Reconstruir la definición después de editar las tareas:
node examples/text-classification/build-definition.mjs

# Evaluar contra la política externa:
node src/cli.mjs verify --spec examples/text-classification/flow.json \
  --policy examples/text-classification/policy.json --evidence evidence

# Publicar localmente una versión aceptada:
node src/cli.mjs publish --spec examples/text-classification/flow.json \
  --policy examples/text-classification/policy.json --registry .registry --evidence evidence

# Copiar el artifactId devuelto por publish:
node src/cli.mjs run --registry .registry --artifact ID_DEVUELTO \
  --input examples/text-classification/input.json \
  --state .state-classification --run-id prioridad-001

# Demostración de las tres categorías y recuperación de cada resultado:
node examples/text-classification/run-demo.mjs --registry .registry \
  --artifact ID_DEVUELTO --state .state-classification
```

`build-definition.mjs` es un programa confiable de empaquetado: lee el código de las tareas como datos, sin importarlas ni evaluarlas. `flow.json` contiene contratos, código y conexiones. Cambiar source o contratos requiere reconstruir, verificar y publicar otro paquete. Los criterios de `policy.json` deben mantenerse fuera del control del código candidato; modificar expectativas para que pase una implementación incorrecta anula la utilidad del control.

## Verificación

La política incluye **28 casos externos**: cuatro de normalización, catorce de clasificación y diez de flujo completo. Cubre las tres categorías, negaciones, Unicode, espacios, incertidumbre, contradicciones, entradas vacías, falsos positivos por subpalabras, preservación de ID y rechazo de entradas inválidas. Se añadió un caso de regresión para la forma femenina `inmediata` después de detectar esa omisión en la evaluación ilustrativa.

Se verificó y publicó en el VPS Ubuntu 24.04.4 / Node 22.22.2. Las tareas usan el aislamiento y los límites del SDK: sin red ni archivos del workspace, 128 MiB y 3 segundos por tarea, máximo 16 KiB de stdout/stderr. El ejemplo no escribe en n8n ni conecta servicios externos.

Para evaluar un conjunto etiquetado y revisar métricas y errores, consultar [EVALUATION.md](EVALUATION.md).

Para exigir aceptación funcional y evaluación etiquetada antes de publicar y ejecutar un candidato, consultar [QUALIFICATION.md](QUALIFICATION.md).
