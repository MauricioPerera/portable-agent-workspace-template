---
type: 'Example Guide'
title: 'Generación con un modelo local'
---

# Generación con un modelo local

`generate-local.mjs` conecta Ollama con el evaluador Linux. En esta primera integración la IA escribe las funciones de las tareas de un flujo con contrato fijo: entradas, salidas, pasos, enlaces, permisos y límites los establece el evaluador. No genera una topología arbitraria ni modifica pruebas o criterios.

```sh
node examples/text-classification/generate-local.mjs \
  --model workspace-generator-chat:latest \
  --url http://127.0.0.1:11435 \
  --output .generations/mi-intento \
  --registry .registry-generated \
  --attempts 3
```

La API debe estar en loopback. El puerto 11435 de la prueba corresponde a un túnel SSH inverso hacia Ollama en Windows; no expone Ollama en la red pública. Para un modelo instalado en la propia máquina Linux se puede omitir `--url` (puerto 11434). El evaluador necesita el entorno Linux y los requisitos del SDK: Node, bubblewrap, systemd y permisos para unidades temporales.

Con Ollama activo en Windows, mantener abierta esta conexión durante la generación:

```sh
ssh -N -o ExitOnForwardFailure=yes -R 127.0.0.1:11435:127.0.0.1:11434 srv1005356
```

Comprobar en el VPS con `ss -ltn sport = :11435` que el listener esté restringido a loopback. La conexión de la prueba se cierra al terminar; el túnel no es un servicio permanente.

En la prueba de Windows se inició `ollama serve` con `OLLAMA_IGPU_ENABLE=1` en el entorno de ese proceso. Ollama detectaba la Arc pero descartaba la GPU integrada cuando esa variable no estaba activada. No se cambió la configuración global de Windows; al reiniciar el servicio habrá que preservar esa opción y comprobar el resultado con `ollama ps`.

Al importar GGUF, comprobar `ollama show --modelfile MODELO`: la importación utilizada inicialmente produjo `TEMPLATE {{ .Prompt }}`, una plantilla genérica sin delimitación de roles. El adaptador la rechaza. El modelo `workspace-generator-chat:latest` usa una adaptación para conversaciones solo de texto de la [plantilla oficial Qwen3.5](https://huggingface.co/Qwen/Qwen3.5-9B/blob/main/chat_template.jinja), con roles ChatML y bloque de pensamiento vacío. No habilita herramientas ni visión. La configuración de creación queda registrada en la evidencia local.

El adaptador consulta `/api/tags`, exige un modelo instalado sin `remote_host` ni `remote_model`, guarda su digest y lo vuelve a comprobar antes de cada llamada. No descarga modelos ni utiliza los alias cloud. Usa `/api/chat`, respuesta JSON sin streaming, temperatura 0, contexto 16384 y límite de salida 4096 tokens. Cada solicitud tiene un plazo de diez minutos y límite de respuesta de 256 KiB. Temperatura 0 no garantiza reproducción exacta entre versiones o hardware. El esquema de respuesta fija cantidad e identificadores permitidos de las tareas; el validador comprueba que no haya duplicados.

## Circuito

1. Envía el contrato sin código de referencia y los casos funcionales de desarrollo.
2. Lee únicamente JSON `sources`, con un identificador y código CommonJS por tarea. El primer candidato debe incluir todas las tareas; una reparación puede incluir solo las tareas permitidas por el diagnóstico. Las restantes conservan su código.
3. Comprueba la definición y ejecuta el candidato mediante el aislamiento del SDK.
4. Devuelve diferencias por campo de la ejecución original del verificador: ruta JSON Pointer, código de error, esperado, observado y orientación de reparación. Agrupa diferencias repetidas de tareas y del flujo mediante sus enlaces; señala las tareas responsables. El feedback está limitado a 32 KiB, 24 grupos y ocho casos detallados. La evidencia completa queda en disco; no reejecuta casos para reconstruir fallos ni consulta datos reservados.
5. Si supera esa fase, aplica la evaluación reservada y publica solo si supera ambas puertas.
6. Una evaluación rechazada termina el ciclo. Sus textos, etiquetas y métricas no se incluyen en instrucciones de reparación.

Cada intento guarda instrucciones, respuesta, consumo reportado por Ollama, candidato y evidencia de calificación. `generation.json` registra estado final y hashes de contrato, política, datos, criterios, modelo y generador. Los archivos contienen los ejemplos de desarrollo y deben tratarse según la privacidad de esos datos. No se guardan credenciales.

Los criterios y datos se copian como valores independientes del candidato. La publicación y ejecución aprobada siguen usando `qualification.mjs` y `run-qualified.mjs`. Un fallo de proveedor termina con estado `ERROR`; agotar intentos funcionales termina con `EXHAUSTED`. Devolver un candidato idéntico al que ya falló termina con `STALLED` antes de repetir la verificación o publicar. El directorio de salida debe ser nuevo.

Los casos negativos del ejemplo exigen `expectErrorCode: "SCHEMA_INVALID"`: un fallo de proceso o timeout no acredita el rechazo por contrato. Los fixtures sin ese campo conservan la semántica anterior de aceptar cualquier error; añadirlo permite precisar la condición externa.

El runtime incluye el nuevo módulo de diagnóstico en su identidad. Los paquetes de una versión anterior del verificador deben volver a verificarse y calificarse; no se migran sus aprobaciones automáticamente.

## Alcance de los resultados

Los seis textos del ejemplo son ilustrativos, fueron utilizados durante el desarrollo del clasificador anterior y no acreditan generalización. Aunque no se envían al nuevo generador, no deben presentarse como un conjunto independiente real. Toda publicación de esta demostración conserva nivel `experimental` y exige `--allow-experimental true` al ejecutarla.

Las pruebas con proveedor simulado demuestran control del protocolo y las reparaciones. La evidencia de una llamada real a Ollama demuestra por separado el comportamiento de ese modelo y candidato concretos. Aprobar ejemplos finitos no certifica la seguridad o calidad universal del código generado.

API utilizada: [documentación oficial de Ollama](https://docs.ollama.com/api/chat).
