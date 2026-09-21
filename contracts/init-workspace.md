---
type: 'Task Contract'
name: 'init-workspace'
version: '2.0.0'
inputs: 'Nombre opcional, destino vacío y distribución completa.'
outputs: 'Instancia validada con inventario inicial y evidencia verificable.'
scope: 'Generación local sin sobrescritura, red, instalación ni conocimiento de dominio.'
test_command: 'python -m unittest discover -s tests -v'
---

# Contrato: Inicializar workspace

## Entrada

Nombre opcional (por defecto Mi Workspace) y ruta de destino opcional. Python 3.10 o posterior y la distribución completa.

## Salida

Workspace con constitución, especificación, manifiesto de instancia, índices, memoria, adaptadores, licencia, marcadores para Git y procedimiento de primer uso con contrato, oráculo, inventario y evidencia. No incorpora la web ni los workflows del distribuidor.

## Perímetro

El scaffold no copia conocimiento ni proyectos de dominio. No sobrescribe un destino que contenga archivos.

## Aceptación

La suite debe probar la vía scaffold y el comando exacto de creación del prompt sobre una distribución temporal, valores por defecto, apóstrofos y Unicode, rechazos sin escritura por entradas o recursos inválidos, recuperación por Git, preservación de insumos Markdown y ausencia de archivos de publicación en la instancia. Los validadores deben rechazar YAML fuera del subconjunto, contratos incompletos, enlaces externos al árbol y evidencia o resultados alterados. Debe ejecutarse una primera tarea metodológica real y su oráculo, conservar tiempo observado y comprobar equivalencia operativa de ambas vías. Un código 0 exige todas las pruebas; no acredita comportamiento de todos los modelos ni rendimiento de red.
