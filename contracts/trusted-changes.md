---
type: 'Task Contract'
name: 'trusted-changes'
version: '1.0.0'
inputs: 'Diff real entre base y head de un PR; SHA aprobado fuera del implementador.'
outputs: 'Código 0 solo si los cambios críticos corresponden exactamente al SHA aprobado.'
scope: 'Contratos, oráculos, inicializador, workflows, prompt y política de publicación.'
test_command: 'python -m unittest discover -s tests -v'
---

# Cambios críticos aprobados

El gate compara los nombres de archivos de un diff Git real, sin confiar en la descripción del PR. Un cambio crítico requiere aprobación independiente del SHA exacto del head, registrada en la variable del repositorio `PAW_APPROVED_CHANGE_REF`. Un nuevo commit invalida la aprobación anterior. Los PR sin cambios críticos no requieren esa variable.

El gate falla cerrado si faltan las referencias Git o el SHA aprobado. Protege ambos lados de un renombre. La persona que implementa no debe establecer la variable por iniciativa propia; debe conservar la aprobación externa vinculada al SHA. La variable y la protección de rama son controles de proceso: quien tenga privilegios administrativos y el mismo token puede cambiarlos, por lo que no constituyen separación criptográfica de identidades.
