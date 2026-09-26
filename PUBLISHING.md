---
type: 'Publishing Guide'
title: 'Publicar la plantilla en GitHub'
description: 'Pasos para distribuir el workspace como plantilla de GitHub sin dependencias de terceros.'
---

# Publicar la plantilla en GitHub

## Antes de publicar

Ejecuta los gates locales:

```powershell
python scripts/validate_okf_nodes.py
python scripts/validate_template.py
python -m unittest discover -s tests -v
```

No publiques secretos, datos de clientes ni ejemplos operativos dentro de este repositorio. Los ejemplos deben vivir en repositorios independientes.

El gate de plantilla comprueba estructura, manifiesto y un inventario explícito de archivos permitidos en toda la distribución. Si añades un archivo legítimo, revisa su contenido y agrégalo a `ALLOWED_EXTRA` en `scripts/validate_template.py`. El gate no es un detector de secretos: revisa el contenido y la evidencia antes de publicar. El prompt y el generador deben distribuirse en la misma versión. La rama local no cambia el prompt público hasta que se publique su revisión.

## Cambios críticos y protección de `main`

Todos los cambios entran por PR y deben pasar los seis jobs de Linux, Windows y macOS. El job `trusted-pr-gate` se ejecuta desde la rama base con `pull_request_target`, sin ejecutar código del PR. Para cambios en `contracts/`, `scripts/`, `tests/`, `.github/workflows/`, `AGENTS.md`, `WORKSPACE-SPEC.md`, `PUBLISHING.md`, `manifest.yaml` o `docs/prompt.md`, compara el head exacto con la variable `PAW_APPROVED_CHANGE_REF`. Una persona distinta de quien implementó revisa el diff y aprueba ese SHA antes de que el administrador actualice la variable y repita el job. Cualquier commit posterior exige una nueva aprobación.

La protección de rama requiere PR, los seis jobs y `trusted-pr-gate`. El repositorio tiene una sola cuenta colaboradora; por ello la aprobación independiente es una separación de proceso entre persona y agente, no una separación de credenciales. El administrador conserva la capacidad técnica de alterar la variable o la protección. Documenta cada aprobación con el SHA y evita presentar esta medida como una garantía criptográfica.

## Publicación

1. Crea un repositorio nuevo en GitHub y sube este directorio como rama por defecto.
2. En la configuración del repositorio, activa **Template repository**.
3. Conserva el workflow `.github/workflows/validate.yml` para validar cada cambio.
4. Publica una release cada vez que cambie la versión enlazada por `docs/prompt.md`, además de los cambios de `spec_version` o de comportamiento del scaffold que requieran una nueva versión. Prepara el ZIP y su checksum fuera de esta carpeta con `python scripts/package_release.py --output-dir ../release-assets`, y adjunta ambos a la release de la versión indicada en `manifest.yaml`. Comprueba los bytes de ambos assets publicados contra el commit etiquetado y que las dos URL del prompt responden. Publica los assets antes de integrar el cambio de prompt en `main` para evitar un enlace público transitoriamente roto.

La vía principal para usuarios es entregar el enlace de `docs/prompt.md` publicado a su IA. El agente obtiene la distribución y ejecuta el generador. Como alternativa, los usuarios técnicos pueden seleccionar **Use this template** o descargar un ZIP y ejecutar `python scripts/init_workspace.py`. El comando funciona sin parámetros y crea una instancia vecina separada de la web y los workflows. Requiere Python 3.10 o posterior y ningún paquete de terceros.
