module.exports = ({ texto_normalizado }) => {
    const texto = texto_normalizado.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    const sinUrgencia = /\b(no es urgente|no urgente|no hay urgencia|sin urgencia)\b/gu;
    const negada = sinUrgencia.test(texto);
    sinUrgencia.lastIndex = 0;
    const sinNegaciones = texto.replace(sinUrgencia, ' ');
    const reglasUrgentes = [
        ['urgente.explicita', /\b(urgente|urgencia|urgentemente)\b/u],
        ['urgente.inmediata', /\b(inmediato|inmediata|inmediatamente|cuanto antes|no puede esperar)\b/u],
        ['urgente.bloqueo', /\b(bloqueado|bloqueada|no puedo trabajar)\b/u],
        ['urgente.caida', /\b(servicio caido|sistema caido|sistema fuera de servicio)\b/u]
    ];
    const aplicadas = reglasUrgentes.filter(([, patron]) => patron.test(sinNegaciones)).map(([id]) => id);
    const urgente = aplicadas.length > 0;
    if (negada) aplicadas.push('normal.sin_urgencia');
    const sinPrisa = /\b(sin prisa|cuando puedas|puede esperar)\b/u.test(texto.replace(/\bno puede esperar\b/gu, ' '));
    if (sinPrisa) aplicadas.push('normal.sin_prisa');
    const incierta = /\b(no se si|quizas|tal vez|puede que)\b|\burgente\s*\?/u.test(texto);
    if (incierta) aplicadas.push('revision.incertidumbre');
    const contradictoria = urgente && (negada || sinPrisa);
    if (contradictoria) aplicadas.push('revision.conflicto');
    const vacia = texto.trim().length === 0;
    if (vacia) aplicadas.push('revision.vacio');
    const revisar = incierta || contradictoria || vacia;
    return {
        categoria: revisar ? 'revisión' : urgente ? 'urgente' : 'normal',
        requiere_revision: revisar,
        reglas_aplicadas: aplicadas
    };
};
