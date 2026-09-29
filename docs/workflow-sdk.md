---
type: 'Technical Guide'
title: 'SDK opcional de flujos'
---

# SDK opcional de flujos para agentes

La [extensión](../extensions/workflow-sdk/README.md) permite que una IA defina tareas JavaScript mediante contratos JSON y que el sistema las valide, pruebe y ejecute sin depender de un catálogo de pieces. El adaptador del motor usa internamente un paquete derivado de Activepieces. La extensión se incluye en el **repositorio distribuidor** y en futuros ZIP de release, separada del workspace mínimo que crea el prompt. El ZIP publicado de la versión 0.4.5 precede a esta extensión; para probarla ahora, clona la rama del repositorio que la contiene. La ruta de primera instalación conserva Python como único requisito.

## Probar desde este repositorio

Desde `extensions/workflow-sdk/`, con Node 22 o posterior:

```sh
npm ci --ignore-scripts --no-audit --no-fund
node src/cli.mjs search "ejecutar flujo"
node src/cli.mjs schema run
node src/cli.mjs validate --spec examples/flow.json --policy examples/policy.json --input examples/input.json
node src/cli.mjs publish --spec examples/flow.json --policy examples/policy.json --registry .registry --dry-run
npm test
```

En Windows y macOS funcionan la definición, validación y compilación; las pruebas de ejecución se omiten. La verificación, publicación y ejecución requieren Linux x86_64 con Bubblewrap, systemd y flock. Se probaron en el VPS Linux en una copia aislada: 39 pruebas correctas. Consulta [evidencia y límites](../extensions/workflow-sdk/RESULTADOS-CLI.md).

## Usarlo con un workspace creado por la plantilla

Mantén el SDK en una copia local de este repositorio y guarda las definiciones y políticas dentro de un proyecto del workspace, por ejemplo `proyectos/mi-automatizacion/`. Ejecuta la CLI desde `extensions/workflow-sdk/` pasando rutas absolutas a la especificación, la política, el registro y el estado del proyecto. `--dry-run` permite revisar límites y pasos antes de ejecutar. `verify` evalúa fixtures externos; `publish` exige que superen los criterios; `run` acepta un artefacto aprobado.

El SDK no se copia automáticamente a cada instancia y no modifica su inicialización. Para un flujo real, añade al workspace una skill y un contrato propios, actualiza sus índices y conserva evidencia de las pruebas en `reports/`. Los ejemplos ilustrativos de clasificación viven solo en el distribuidor: no se insertan en un workspace ni acreditan calidad para datos de otro dominio.

La ejecución del código de tareas se limita al sandbox Linux descrito en el [README técnico](../extensions/workflow-sdk/README.md). Los planes estáticos no prueban el comportamiento de las tareas; la calidad se limita a los casos y presupuestos de la política externa.
