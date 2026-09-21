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

El gate de plantilla comprueba estructura, manifiesto y rutas permitidas del núcleo; no es un detector de secretos. Revisa el contenido y la evidencia antes de publicar. El prompt y el generador deben distribuirse en la misma versión. La rama local no cambia el prompt público hasta que se publique su revisión.

## Publicación

1. Crea un repositorio nuevo en GitHub y sube este directorio como rama por defecto.
2. En la configuración del repositorio, activa **Template repository**.
3. Conserva el workflow `.github/workflows/validate.yml` para validar cada cambio.
4. Crea releases al modificar `spec_version` o el comportamiento del scaffold.

La vía principal para usuarios es entregar el enlace de `docs/prompt.md` publicado a su IA. El agente obtiene la distribución y ejecuta el generador. Como alternativa, los usuarios técnicos pueden seleccionar **Use this template** o descargar un ZIP y ejecutar `python scripts/init_workspace.py`. El comando funciona sin parámetros y crea una instancia vecina separada de la web y los workflows. Requiere Python 3.10 o posterior y ningún paquete de terceros.
