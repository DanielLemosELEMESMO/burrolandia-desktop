// Substitui o pdf.js do foliate-js: o Burrolândia não abre PDF pelo foliate.
// O PDF vira EPUB na importação e a "página original" tem visor próprio.
export const makePDF = async () => {
    throw new Error('PDF não é aberto pelo foliate-js neste app')
}
