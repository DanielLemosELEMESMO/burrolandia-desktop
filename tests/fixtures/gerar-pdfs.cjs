// Gera os PDFs de teste com o próprio Electron (printToPDF). Rode e faça commit da saída:
//   xvfb-run -a node_modules/electron/dist/electron --no-sandbox tests/fixtures/gerar-pdfs.cjs
// Os PDFs ficam em tests/fixtures/pdf/ e são lidos pelos testes de conversão.

const { app, BrowserWindow } = require('electron')
const { mkdtempSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const destino = join(__dirname, 'pdf')

// Hifeniza à força palavras longas com hífen opcional (&shy;), para aparecerem quebras de linha com hífen.
const hifenizar = texto =>
  texto.replace(/[A-Za-zÀ-ÿ]{9,}/g, palavra => palavra.slice(0, 4) + '&shy;' + palavra.slice(4, 8) + '&shy;' + palavra.slice(8))

const DOM_CASMURRO = [
  ['I. Do título', [
    'Uma noite destas, vindo da cidade para o Engenho Novo, encontrei no trem da Central um rapaz aqui do bairro, que eu conheço de vista e de chapéu. Cumprimentou-me, sentou-se ao pé de mim, falou da Lua e dos ministros, e acabou recitando-me versos. A viagem era curta, e os versos pode ser que não fossem inteiramente maus. Sucedeu, porém, que, como eu estava cansado, fechei os olhos três ou quatro vezes; tanto bastou para que ele interrompesse a leitura e metesse os versos no bolso.',
    '— Continue, disse eu acordando.',
    '— Já acabei, murmurou ele.',
    'Vi-lhe fazer um gesto para tirá-los outra vez do bolso, mas não passou do gesto; estava amuado. No dia seguinte entrou a dizer de mim nomes feios, e acabou alcunhando-me Dom Casmurro. Os vizinhos, que não gostam dos meus hábitos reclusos e calados, deram curso à alcunha, que afinal pegou. Nem por isso me zanguei.',
    'Não consultes dicionários. Casmurro não está aqui no sentido que eles lhe dão, mas no que lhe pôs o vulgo de homem calado e metido consigo. Dom veio por ironia, para atribuir-me fumos de fidalgo. Tudo por estar cochilando! Também não achei melhor título para a minha narração; se não tiver outro daqui até ao fim do livro, vai este mesmo.',
  ]],
  ['II. Do livro', [
    'Agora que expliquei o título, passo a escrever o livro. Antes disso, porém, digamos os motivos que me põem a pena na mão.',
    'Vivo só, com um criado. A casa em que moro é própria; fi-la construir de propósito, levado de um desejo tão particular que me vexa imprimi-lo, mas vá lá. Um dia, há bastantes anos, lembrou-me reproduzir no Engenho Novo a casa em que me criei na antiga Rua de Mata-cavalos, dando-lhe o mesmo aspecto e economia daquela outra, que desapareceu.',
    'O meu fim evidente era atar as duas pontas da vida, e restaurar na velhice a adolescência. Pois, senhor, não consegui recompor o que foi nem o que fui. Em tudo, se o rosto é igual, a fisionomia é diferente. Se só me faltassem os outros, vá; um homem consola-se mais ou menos das pessoas que perde; mas falto eu mesmo, e esta lacuna é tudo.',
    'Os amigos que me restam são de data recente; todos os antigos foram estudar a geologia dos campos-santos. Quanto às amigas, algumas datam de quinze anos, outras de menos, e quase todas creem na mocidade.',
    'Entretanto, vida diferente não quer dizer vida pior; é outra coisa. A certos respeitos, aquela vida antiga aparece-me despida de muitos encantos que lhe achei; mas é também exato que perdeu muito espinho que a fez molesta, e, de memória, conservo alguma recordação doce e feiticeira.',
  ]],
  ['III. A denúncia', [
    'Ia entrar na sala de visitas, quando ouvi proferir o meu nome e escondi-me atrás da porta. A casa era a da Rua de Mata-cavalos, o mês novembro, o ano é que é um tanto remoto, mas eu não hei de trocar as datas à minha vida só para agradar às pessoas que não amam histórias velhas; o ano era de 1857.',
    '— D. Glória, a senhora persiste na ideia de meter o nosso Bentinho no seminário? É mais que tempo, e já agora pode haver uma dificuldade.',
    '— Que dificuldade?',
    '— Uma grande dificuldade.',
    'Minha mãe quis saber o que era. José Dias, depois de alguns instantes de concentração, veio ver se havia alguém no corredor; não deu por mim, voltou e, abafando a voz, disse que a dificuldade estava na casa ao pé, a gente do Pádua.',
  ]],
]

const umaColuna = () => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Dom Casmurro</title><style>
@page { size: 148mm 210mm; margin: 22mm 17mm 20mm; }
body { font: 11pt/1.45 Georgia, serif; margin: 0; }
h1 { font-size: 19pt; font-weight: normal; margin: 0 0 16pt; break-before: page; }
h1:first-child { break-before: auto; }
p { margin: 0; text-indent: 1.4em; text-align: justify; }
h1 + p { text-indent: 0; }
</style></head><body>
${DOM_CASMURRO.map(([titulo, ps]) => `<h1>${titulo}</h1>\n${ps.map(p => `<p>${hifenizar(p)}</p>`).join('\n')}`).join('\n')}
</body></html>`

const NOTAS = [
  'A leitura lenta é um hábito que se constrói aos poucos. Quem lê todos os dias, mesmo por poucos minutos, descobre que o livro deixa de ser uma tarefa e passa a ser um lugar para onde se volta.',
  'O primeiro obstáculo costuma ser o lugar onde paramos. Quando um aplicativo esquece a página, a pessoa perde o fio e, muitas vezes, a vontade. Lembrar a página exata parece pouco, mas é o que permite voltar sem esforço.',
  'O segundo obstáculo é o conforto. Letra pequena, linhas longas demais e contraste fraco cansam os olhos antes de cansar a mente. Ajustar o tamanho, o espaço entre as linhas e a cor do fundo transforma a experiência.',
  'Há também a questão do formato. Um PDF foi pensado para o papel: margens, colunas e cabeçalhos que fazem sentido impressos, mas atrapalham numa tela pequena. Adaptar o texto à tela devolve ao leitor o controle sobre a página.',
  'Por fim, ler é também conversar. Saber o que outras pessoas leram, como avaliaram e por que recomendam um livro ajuda a escolher o próximo, sem transformar a leitura numa competição.',
  'Estas notas foram escritas para testar a conversão de documentos em duas colunas. O texto da coluna da esquerda deve vir inteiro antes do texto da coluna da direita.',
]

const duasColunas = () => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Notas sobre a leitura</title><style>
@page { size: A4; margin: 18mm 16mm; }
body { font: 10.5pt/1.4 Georgia, serif; margin: 0; }
h1 { font-size: 22pt; font-weight: normal; margin: 0 0 14pt; }
.colunas { columns: 2; column-gap: 9mm; }
p { margin: 0 0 7pt; text-align: justify; }
</style></head><body>
<h1>Notas sobre a leitura</h1>
<div class="colunas">${NOTAS.map(p => `<p>${p}</p>`).join('\n')}${NOTAS.map(p => `<p>${p}</p>`).join('\n')}</div>
</body></html>`

const digitalizado = () => `<!doctype html><html><head><meta charset="utf-8"><title>Digitalizado</title><style>
@page { size: A5; margin: 0; } body { margin: 0; } canvas { display: block; width: 148mm; height: 210mm; }
</style></head><body><canvas id="c" width="592" height="840"></canvas><script>
const c = document.getElementById('c').getContext('2d');
c.fillStyle = '#f4efe2'; c.fillRect(0, 0, 592, 840);
c.fillStyle = '#3a3226';
for (let y = 80; y < 780; y += 22) { const w = 380 + ((y * 37) % 90); c.fillRect(70, y, w, 9); }
</script></body></html>`

async function gerar(nome, html, opcoes) {
  const janela = new BrowserWindow({ show: false, width: 900, height: 1200 })
  const arquivo = join(mkdtempSync(join(tmpdir(), 'pdf-')), 'pagina.html')
  writeFileSync(arquivo, html)
  await janela.loadFile(arquivo)
  await new Promise(r => setTimeout(r, 400))
  const pdf = await janela.webContents.printToPDF({ preferCSSPageSize: true, printBackground: true, ...opcoes })
  writeFileSync(join(destino, nome), pdf)
  janela.destroy()
  console.log('gerado', nome, pdf.length, 'bytes')
}

// Sem isso o app fecha quando a primeira janela é destruída.
app.on('window-all-closed', () => {})

app.whenReady().then(async () => {
  await gerar('dom-casmurro-uma-coluna.pdf', umaColuna(), {
    displayHeaderFooter: true,
    headerTemplate: '<div style="width:100%;text-align:center;font:8pt Georgia,serif;color:#555">Dom Casmurro · Machado de Assis</div>',
    footerTemplate: '<div style="width:100%;text-align:center;font:8pt Georgia,serif;color:#555"><span class="pageNumber"></span></div>',
    generateTaggedPDF: true,
    generateDocumentOutline: true,
  })
  await gerar('notas-duas-colunas.pdf', duasColunas(), {})
  await gerar('digitalizado.pdf', digitalizado(), {})
  app.quit()
})
