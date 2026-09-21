---
type: 'Task Contract'
name: 'init-workspace'
version: '1.0.0'
test_command: 'python -m unittest tests.test_init_workspace'
---

# Contrato: Inicializar workspace

## Entrada

Un nombre visible y, opcionalmente, una ruta de destino.

## Salida

Un workspace mínimo con `AGENTS.md` como primera lectura, manifiesto, índices, memoria, contratos, reportes y adaptadores de agentes.

## Perímetro

El scaffold no copia conocimiento ni proyectos de dominio. No sobrescribe un destino que contenga archivos.

## Aceptación

La prueba de regresión debe crear un workspace temporal, verificar su estructura, ejecutar su validador OKF y confirmar que el scaffold rechaza sobrescrituras. El comando `test_command` debe devolver código 0.
