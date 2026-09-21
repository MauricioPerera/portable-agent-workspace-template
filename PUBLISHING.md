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
python -m unittest tests.test_init_workspace
```

No publiques secretos, datos de clientes ni ejemplos operativos dentro de este repositorio. Los ejemplos deben vivir en repositorios independientes.

## Publicación

1. Crea un repositorio nuevo en GitHub y sube este directorio como rama por defecto.
2. En la configuración del repositorio, activa **Template repository**.
3. Conserva el workflow `.github/workflows/validate.yml` para validar cada cambio.
4. Crea releases al modificar `spec_version` o el comportamiento del scaffold.

Los usuarios pueden seleccionar **Use this template** o descargar un ZIP y ejecutar `python scripts/init_workspace.py`. El workspace generado no requiere paquetes de terceros; los validadores usan la biblioteca estándar de Python.
