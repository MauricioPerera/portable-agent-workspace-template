module.exports = ({ texto }) => ({
    texto_normalizado: texto.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase()
});
