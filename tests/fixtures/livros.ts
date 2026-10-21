// Livros de teste, gerados com o nosso escritor de EPUB. Os textos são de Machado de Assis
// (domínio público), transcritos de memória para testes: não são edição de referência.

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { strToU8 } from 'fflate'
import { escreverEpub, type CapituloEpub } from '../../src/nucleo/epub/escrever'

const paragrafos = (...textos: string[]) => textos.map(t => `<p>${t}</p>`).join('\n')
const capitulo = (titulo: string, ...textos: string[]): CapituloEpub => ({
  titulo,
  corpo: `<section epub:type="chapter"><h2>${titulo}</h2>\n${paragrafos(...textos)}</section>`,
})

const DOM_CASMURRO: CapituloEpub[] = [
  capitulo(
    'I. Do título',
    'Uma noite destas, vindo da cidade para o Engenho Novo, encontrei no trem da Central um rapaz aqui do bairro, que eu conheço de vista e de chapéu. Cumprimentou-me, sentou-se ao pé de mim, falou da Lua e dos ministros, e acabou recitando-me versos. A viagem era curta, e os versos pode ser que não fossem inteiramente maus. Sucedeu, porém, que, como eu estava cansado, fechei os olhos três ou quatro vezes; tanto bastou para que ele interrompesse a leitura e metesse os versos no bolso.',
    '— Continue, disse eu acordando.',
    '— Já acabei, murmurou ele.',
    '— São muito bonitos.',
    'Vi-lhe fazer um gesto para tirá-los outra vez do bolso, mas não passou do gesto; estava amuado. No dia seguinte entrou a dizer de mim nomes feios, e acabou alcunhando-me Dom Casmurro. Os vizinhos, que não gostam dos meus hábitos reclusos e calados, deram curso à alcunha, que afinal pegou. Nem por isso me zanguei. Contei a anedota aos amigos da cidade, e eles, por graça, chamam-me assim, alguns em bilhetes: “Dom Casmurro, domingo vou jantar com você.” — “Vou para Petrópolis, Dom Casmurro; a casa é a mesma da Renânia; vê se deixas essa caverna do Engenho Novo, e vai lá passar uns quinze dias comigo.” — “Meu caro Dom Casmurro, não cuide que o dispenso do teatro amanhã; venha e dormirá aqui na cidade; dou-lhe camarote, dou-lhe chá, dou-lhe cama; só não lhe dou moça.”',
    'Não consultes dicionários. Casmurro não está aqui no sentido que eles lhe dão, mas no que lhe pôs o vulgo de homem calado e metido consigo. Dom veio por ironia, para atribuir-me fumos de fidalgo. Tudo por estar cochilando! Também não achei melhor título para a minha narração; se não tiver outro daqui até ao fim do livro, vai este mesmo. O meu poeta do trem ficará sabendo que não lhe guardo rancor. E com pequeno esforço, sendo o título seu, poderá cuidar que a obra é sua. Há livros que apenas terão isso dos seus autores; alguns nem tanto.',
  ),
  capitulo(
    'II. Do livro',
    'Agora que expliquei o título, passo a escrever o livro. Antes disso, porém, digamos os motivos que me põem a pena na mão.',
    'Vivo só, com um criado. A casa em que moro é própria; fi-la construir de propósito, levado de um desejo tão particular que me vexa imprimi-lo, mas vá lá. Um dia, há bastantes anos, lembrou-me reproduzir no Engenho Novo a casa em que me criei na antiga Rua de Mata-cavalos, dando-lhe o mesmo aspecto e economia daquela outra, que desapareceu. Construtor e pintor entenderam bem as indicações que lhes fiz: é o mesmo prédio assobradado, três janelas de frente, varanda ao fundo, as mesmas alcovas e salas.',
    'O meu fim evidente era atar as duas pontas da vida, e restaurar na velhice a adolescência. Pois, senhor, não consegui recompor o que foi nem o que fui. Em tudo, se o rosto é igual, a fisionomia é diferente. Se só me faltassem os outros, vá; um homem consola-se mais ou menos das pessoas que perde; mas falto eu mesmo, e esta lacuna é tudo.',
    'O que aqui está é, mal comparando, semelhante à pintura que se põe na barba e nos cabelos, e que apenas conserva o hábito externo, como se diz nas autópsias; o interno não aguenta tinta. Uma certidão que me desse vinte anos de idade poderia enganar os estranhos, como todos os documentos falsos, mas não a mim.',
    'Os amigos que me restam são de data recente; todos os antigos foram estudar a geologia dos campos-santos. Quanto às amigas, algumas datam de quinze anos, outras de menos, e quase todas creem na mocidade. Duas ou três fariam crer nela aos outros, mas a língua que falam obriga muita vez a consultar os dicionários, e tal frequência é cansativa.',
    'Entretanto, vida diferente não quer dizer vida pior; é outra coisa. A certos respeitos, aquela vida antiga aparece-me despida de muitos encantos que lhe achei; mas é também exato que perdeu muito espinho que a fez molesta, e, de memória, conservo alguma recordação doce e feiticeira. Em verdade, pouco apareço e menos falo. Distrações raras. O mais do tempo é gasto em hortar, jardinar e ler; como bem e não durmo mal.',
    'Ora, como tudo cansa, esta monotonia acabou por exaurir-me também. Quis variar, e lembrou-me escrever um livro. Jurisprudência, filosofia e política acudiram-me, mas não me acudiram as forças necessárias. Depois, pensei em fazer uma História dos Subúrbios, menos seca que as memórias do Padre Luís Gonçalves dos Santos, relativas à cidade; era obra modesta, mas exigia documentos e datas, como preliminares, tudo árido e longo. Foi então que os bustos pintados nas paredes entraram a falar-me e a dizer-me que, uma vez que eles não alcançavam reconstituir-me os tempos idos, pegasse da pena e contasse alguns.',
    'Talvez a narração me desse a ilusão, e as sombras viessem perpassar ligeiras, como ao poeta, não o do trem, mas o do Fausto: Aí vindes outra vez, inquietas sombras?',
  ),
  capitulo(
    'III. A denúncia',
    'Ia entrar na sala de visitas, quando ouvi proferir o meu nome e escondi-me atrás da porta. A casa era a da Rua de Mata-cavalos, o mês novembro, o ano é que é um tanto remoto, mas eu não hei de trocar as datas à minha vida só para agradar às pessoas que não amam histórias velhas; o ano era de 1857.',
    '— D. Glória, a senhora persiste na ideia de meter o nosso Bentinho no seminário? É mais que tempo, e já agora pode haver uma dificuldade.',
    '— Que dificuldade?',
    '— Uma grande dificuldade.',
    'Minha mãe quis saber o que era. José Dias, depois de alguns instantes de concentração, veio ver se havia alguém no corredor; não deu por mim, voltou e, abafando a voz, disse que a dificuldade estava na casa ao pé, a gente do Pádua.',
    '— A gente do Pádua?',
    '— Há algum tempo estou para lhe dizer isto, mas não me atrevia. Não me parece bonito que o nosso Bentinho ande metido nos cantos com a filha do Tartaruga, e esta é a dificuldade, porque se eles pegam de namoro, a senhora terá muito que lutar para separá-los.',
  ),
  capitulo(
    'IV. Um dever amaríssimo!',
    'José Dias amava os superlativos. Era um modo de dar feição monumental às ideias; não as havendo, servia a prolongar as frases. Levantou-se para ir buscar o gamão, que estava no interior da casa. Cosi-me muito à parede, e vi-o passar com as suas calças brancas engomadas, presilhas, rodaque e gravata de mola. Foi dos últimos que usaram presilhas no Rio de Janeiro, e talvez neste mundo.',
    'Trazia as calças curtas para que lhe ficassem bem esticadas. A gravata de cetim preto, com um aro de aço por dentro, imobilizava-lhe o pescoço; era então moda. O rodaque de chita, veste caseira e leve, parecia nele uma casaca de cerimônia. Era magro, chupado, com um princípio de calva; teria os seus cinquenta e cinco anos. Levantou-se com o passo vagaroso do costume, não aquele vagar arrastado dos preguiçosos, mas um vagar calculado e deduzido, um silogismo completo, a premissa antes da consequência, a consequência antes da conclusão. Um dever amaríssimo!',
  ),
]

function capaSvg(titulo: string, autor: string) {
  return strToU8(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
  <rect width="600" height="900" fill="#14362f"/>
  <rect x="36" y="36" width="528" height="828" fill="none" stroke="#cdb383" stroke-width="2"/>
  <text x="300" y="380" text-anchor="middle" font-family="Georgia, serif" font-size="64" fill="#fbfbf7">${titulo}</text>
  <text x="300" y="460" text-anchor="middle" font-family="Georgia, serif" font-size="30" fill="#cdb383">${autor}</text>
</svg>`)
}

export function epubDomCasmurro() {
  return escreverEpub({
    identificador: 'urn:uuid:5a0c3f2e-1b4d-4c6e-9a51-000000000001',
    titulo: 'Dom Casmurro',
    autores: ['Machado de Assis'],
    idioma: 'pt-BR',
    capa: { bytes: capaSvg('Dom Casmurro', 'Machado de Assis'), tipo: 'image/svg+xml' },
    capitulos: DOM_CASMURRO,
  })
}

export function epubMemoriasPostumas() {
  return escreverEpub({
    identificador: 'urn:uuid:5a0c3f2e-1b4d-4c6e-9a51-000000000002',
    titulo: 'Memórias Póstumas de Brás Cubas',
    autores: ['Machado de Assis'],
    idioma: 'pt-BR',
    capitulos: [
      capitulo(
        'Ao leitor',
        'Ao verme que primeiro roeu as frias carnes do meu cadáver dedico como saudosa lembrança estas memórias póstumas.',
      ),
      capitulo(
        'I. Óbito do autor',
        'Algum tempo hesitei se devia abrir estas memórias pelo princípio ou pelo fim, isto é, se poria em primeiro lugar o meu nascimento ou a minha morte. Suposto o uso vulgar seja começar pelo nascimento, duas considerações me levaram a adotar diferente método: a primeira é que eu não sou propriamente um autor defunto, mas um defunto autor, para quem a campa foi outro berço; a segunda é que o escrito ficaria assim mais galante e mais novo.',
      ),
    ],
  })
}

/** Dom Casmurro com uma capa JPEG (para ver a troca pela capa do catálogo, que é outra imagem). */
export function epubDomCasmurroComCapa(capa: Uint8Array) {
  return escreverEpub({
    identificador: 'urn:uuid:5a0c3f2e-1b4d-4c6e-9a51-000000000003',
    titulo: 'Dom Casmurro',
    autores: ['Machado de Assis'],
    idioma: 'pt-BR',
    capa: { bytes: capa, tipo: 'image/jpeg' },
    capitulos: DOM_CASMURRO.slice(0, 1),
  })
}

/** Um livro com outra obra no catálogo, para os testes de mais de um livro. */
export function epubOrigemDasEspecies() {
  return escreverEpub({
    identificador: 'urn:uuid:5a0c3f2e-1b4d-4c6e-9a51-000000000004',
    titulo: 'A Origem das Espécies',
    autores: ['Charles Darwin'],
    idioma: 'pt-BR',
    capitulos: [capitulo('I. Variação sob domesticação', 'Um capítulo curto, escrito para os testes.')],
  })
}

/** Grava os livros de teste numa pasta e devolve os caminhos. */
export function gravarLivrosDeTeste(pasta: string) {
  mkdirSync(pasta, { recursive: true })
  const domCasmurro = join(pasta, 'dom-casmurro.epub')
  const memorias = join(pasta, 'memorias-postumas.epub')
  writeFileSync(domCasmurro, epubDomCasmurro())
  writeFileSync(memorias, epubMemoriasPostumas())
  return { domCasmurro, memorias }
}
