# Parte 1 — Minha biblioteca (desktop)

Data: 20/10/2026 · Estado: etapas 1, 2 e 3 entregues (o Daniel pediu para executar sem rodada de revisão da spec; este documento registra as decisões).

## 1. Propósito

Um app para ler os seus EPUBs e PDFs com conforto, em qualquer tamanho de tela, e mais tarde descobrir e conversar sobre livros com outras pessoas. O social existe para valorizar a leitura e os autores, não para bate-papo. **Em primeiro lugar, as suas coisas têm que estar lá**: você traz o arquivo, o app processa e você lê.

O projeto inteiro tem três partes, cada uma com spec, plano e entrega próprios:

1. **Minha biblioteca** (este documento): app desktop que funciona sem internet e sem conta.
2. **Conta e nuvem**: login, arquivos privados na nuvem, posição e estantes sincronizadas (Supabase; no desenvolvimento, Supabase em Docker). Habilita o app de celular, que é outro projeto.
3. **Descobrir e conversar**: páginas de autor e de assunto, ranking por relevância (geral e da sua tribo), avaliações de fora (Open Library, Google Books, Wikidata) e do app, resenhas, seguir referências.

## 2. As três forças, traduzidas para leitura

Herdadas do projeto IRVV. Toda entrega se olha com três perguntas:

| Força | Definição aqui | Pergunta de entrega |
|---|---|---|
| Ambientação | Ao abrir, você está onde parou e sabe para onde ir. | Ao abrir, a pessoa já vê o que tem que ver? |
| Rotina | Ler cabe no dia a dia; voltar ao livro não custa nada. | Isso facilita voltar a ler todo dia? |
| Acessibilidade | Qualquer pessoa lê confortavelmente, sem ajuda, do início ao fim. | Qualquer pessoa consegue, sem ajuda? |

Regras que valem desde o primeiro commit (a IRVV escreveu, mas ainda não cumpria): texto de interface com no mínimo 12px; alvos clicáveis de 44px; contraste AA nos três temas; foco visível; tudo por teclado; respeito a `prefers-reduced-motion`; sem emoji decorativo.

## 3. Escopo da parte 1

Entregue em etapas; cada etapa vira um `.exe` para Windows.

**Etapa 1 — EPUB com a posição salva**
- Biblioteca: "Continuar lendo" em destaque e a grade de livros com capas.
- Adicionar livro, um por vez (botão ou arrastar o arquivo), com fluxo de início, meio e fim.
- Leitor: páginas ou rolagem, sumário, barras que somem enquanto você lê.
- Ajustes de leitura (**Aa**): tema (Papel, Sépia, Noite, Automático), letra (Literata, Atkinson Hyperlegible, original do livro), tamanho, espaçamento, largura da coluna, alinhamento, uma ou duas páginas.
- Posição salva sozinha, continuamente; o app reabre no livro e na página onde você estava.
- Tempo em palavras: "faltam 8 minutos neste capítulo".
- Remover livro (com confirmação).

**Etapa 2 — PDF**
- Na importação, o PDF é convertido uma vez num EPUB ("texto adaptado"), guardado ao lado do original.
- "Página original": o PDF como foi impresso, sincronizado com a posição do texto adaptado.

**Etapa 3 — Reconhecer obra e edição**
- Obra → edições → seu arquivo, usando o Open Library (detalhes na seção 8).
- O Google Books fica para quando houver uma chave de API: sem chave, a cota diária compartilhada acaba (testado em 20/10, de um IP de nuvem), e o resultado seria imprevisível.

**Fora da parte 1**: conta, sincronização, celular, destaques e notas, leitura em voz alta, estantes personalizadas, metas e lembretes, importação em lote, OCR de PDF escaneado.

## 4. Arquitetura

```
Electron
├── main (Node)                 janela, protocolo app://, IPC, banco e arquivos
│   └── usa src/nucleo          lógica sem Electron: tipos, EPUB, PDF→EPUB, tempo
├── preload                     ponte mínima (contextBridge) → window.burrolandia
└── renderer (React + TS)       telas; leitor = foliate-js (vendorizado, MIT)
```

- **Local primeiro.** Tudo funciona sem internet. A parte 2 adiciona sincronização por cima, sem migrar dados: tabelas e ids já seguem o formato das tabelas do Supabase (UUID, datas ISO, `atualizado_em`).
- **Formatos portáteis**, para o celular reaproveitar:
  - conteúdo: sempre EPUB (o original, ou o gerado a partir do PDF);
  - posição: **Locator** no formato do Readium (`href`, `locations.progression`, `locations.totalProgression`, `locations.fragments`, `text`), com extensões `locations.cfi` (EPUB CFI completo) e `locations.pagina` (rótulo da página do PDF original). `locations.position` não é usado, porque o índice do foliate não é a lista de posições do Readium.
- **`src/nucleo` não depende do Electron.** O conversor PDF→EPUB e a leitura de metadados rodam em qualquer Node; na parte 2 podem ir para um servidor quando o celular também enviar arquivos.
- **Armazenamento**: `node:sqlite` (embutido no Electron 44, sem módulo nativo) em `userData/burrolandia.db`, modo WAL. Arquivos em `userData/livros/<id>/`. A pasta de dados pode ser trocada pela variável `BURROLANDIA_DADOS` (testes).
- **Protocolo `app://burrolandia/`**: serve o renderer em produção e os arquivos dos livros em `/livros/<id>/<arquivo>`. Os iframes do foliate (blob:) herdam a origem, então as fontes locais carregam dentro do livro.
- **Segurança**: `contextIsolation`, `sandbox`, sem `nodeIntegration`. CSP com `script-src 'self'`, herdada pelos iframes do livro, o que bloqueia scripts embutidos em EPUBs. Links externos abrem no navegador do sistema.

### Modelo de dados (SQLite)

```sql
livros(
  id TEXT PRIMARY KEY,            -- UUID
  titulo TEXT NOT NULL,
  autores TEXT NOT NULL,          -- JSON: ["Machado de Assis"]
  idioma TEXT,
  formato_original TEXT NOT NULL, -- 'epub' | 'pdf'
  arquivo_original TEXT NOT NULL, -- 'original.epub'
  arquivo_leitura TEXT,           -- 'original.epub' ou 'leitura.epub' (gerado)
  capa TEXT,                      -- 'capa.jpg' ou NULL (capa tipográfica)
  hash_sha256 TEXT NOT NULL UNIQUE,
  tamanho_bytes INTEGER NOT NULL,
  identificadores TEXT,           -- JSON: { isbn: [...], ... }
  estado TEXT NOT NULL,           -- 'pronto' | 'processando' | 'erro'
  posicao TEXT,                   -- JSON Locator
  progresso REAL NOT NULL DEFAULT 0,
  adicionado_em TEXT NOT NULL,
  aberto_em TEXT,
  atualizado_em TEXT NOT NULL
)
preferencias(chave TEXT PRIMARY KEY, valor TEXT NOT NULL)  -- JSON por chave
```

A etapa 3 (migração 2) acrescenta `obras` e `edicoes`, com os ids do Open Library como chave (`OL1003040W`, `OL61241820M`), e em `livros` as colunas `obra_id`, `edicao_id` e `reconhecimento` (começa `pendente`). Na parte 2, essas tabelas viram o catálogo compartilhado do servidor.

Notas para a parte 2 (sincronização):
- Remover hoje apaga a linha (`DELETE`). Para levar remoções feitas sem internet, a parte 2 troca isso por uma marca (`removido_em`) antes de ligar a sincronização.
- `estado` hoje só vale `pronto`; ele vai servir para processamento em segundo plano (por exemplo, PDF enviado pelo celular e convertido no servidor). Importações interrompidas não ficam no banco, e as pastas que sobram são apagadas na abertura do app.

## 5. Fluxos

**Adicionar livro (início, meio e fim)**
1. Início: "Importar livro" (o botão de ouro no centro do dock, ou o do estado vazio) abre o diálogo do sistema; arrastar o arquivo para qualquer tela também vale, inclusive em cima do texto do livro (o leitor repassa o arrasto que acontece dentro dos iframes). Arquivo sem caminho no disco (vindo de outro app) recebe a explicação de salvar numa pasta antes.
2. Meio: painel "Preparando seu livro", com o que está acontecendo ("Lendo o arquivo", e para PDF "Adaptando o texto — página 34 de 210").
3. Fim: o burro de coroa, "Seu livro está na biblioteca", capa e título, a lista do que aconteceu (no PDF, se o texto foi adaptado ou se ele é digitalizado), e os botões "Começar a ler" e "Agora não".
- Arquivo repetido (mesmo SHA-256): "Esse livro já está na sua biblioteca", com "Abrir".
- EPUB com DRM: explica que o arquivo está protegido pela loja e não pode ser aberto.
- Arquivo inválido: explica e não deixa lixo na pasta de dados.

**Ler e voltar**
- Abrir um livro grava `aberto_em` e a sessão (`livroAberto`). Fechar o app dentro do livro faz o app reabrir dentro do livro.
- Cada mudança de posição salva o Locator (com debounce de 300 ms) e salva de forma síncrona ao fechar a janela.
- Reabrir: vai para `locations.cfi`; se falhar, para `totalProgression`.

## 6. Leitor

- Navegação: ←/→, PageUp/PageDown, espaço (Shift+espaço volta), Home/End do capítulo, roda do mouse, clique nas margens laterais.
- Faixa de cima: voltar (com o nome de onde você veio: "Início" ou "Biblioteca"), título, capítulo, alternância do PDF, Sumário e Aa. Faixa de baixo: capítulo e tempo restante, o dock compacto no meio, a porcentagem, e o fio de progresso com o ponto de ouro. Nas páginas, as duas cabem nas margens do livro (72 px); na rolagem e na página original, o texto corre entre elas. Nunca cobrem o texto. Somem após 2,5 s sem mexer o mouse; escondidas, não pegam clique; reaparecem com o mouse, com Tab ou com um painel aberto.
- Painéis (Sumário, Aa) são diálogos: foco preso, Esc fecha, foco volta ao botão de origem.
- O tema de leitura (Automático, Creme, Sépia, Noite) vale para o leitor, os painéis e os diálogos; as telas da biblioteca ficam na ameixa da marca. As preferências de texto valem para todos os livros.
- Padrões: tema Automático; Literata; 19px; espaçamento 1,55; coluna de 660px; alinhado à esquerda (texto justificado é opcional, porque prejudica quem tem dislexia); duas páginas quando couber.

## 7. Conversão PDF → EPUB (etapa 2)

Roda num processo utilitário do Electron (sem travar a janela), com `pdfjs-dist` empacotado nele, em `src/nucleo/pdf`:
1. Extrai o texto de cada página com posição e tamanho da fonte.
2. Monta linhas; descarta cabeçalhos e rodapés repetidos e números de página.
3. Detecta colunas; junta linhas em parágrafos (espaçamento, recuo, pontuação final); desfaz hifenização de fim de linha.
4. Títulos por tamanho de fonte; capítulos pelo sumário do PDF (outline) quando existe.
5. Escreve EPUB 3 com `page-list`: cada página do PDF vira um marcador `epub:type="pagebreak"`, o que liga o texto adaptado à página original.
6. PDF sem texto (escaneado) fica só com a página original e um aviso. OCR fica para depois.
7. Página sem texto no meio de um PDF com texto vira um aviso no texto adaptado ("veja a página original").
8. A capa do PDF é a primeira página, desenhada pela interface e guardada como JPEG.
9. Posição no PDF: o Locator leva o fragmento `page=N` (página original) ou `pagina-N` (âncora no texto adaptado); um modo abre onde o outro parou.

10. Caracteres que o XML não aceita (nulo e outros de controle, comuns em títulos de PDF) são removidos em um ponto só, ao escrever o XML. Se mesmo assim o texto adaptado não abrir, o leitor cai para a página original com um aviso.
11. Na página original, a página atual é a do comando (abrir, setas, zoom) ou, na rolagem feita pela pessoa, a que está logo abaixo da barra de cima.

Limites conhecidos: imagens e tabelas do PDF não entram no texto adaptado (estão na página original); notas de rodapé entram como parágrafos; PDFs com layout muito livre (revistas) podem sair fora de ordem; capítulos muito longos (quando o PDF não tem sumário nem títulos claros) não são divididos, o que deixa a paginação mais lenta e o "falta X neste capítulo" longo.

## 8. Catálogo: reconhecer obra e edição (etapa 3)

Roda no processo principal (`src/main/catalogo.ts`), com a lógica em `src/nucleo/catalogo` (testável sem Electron). Princípio: **na dúvida, não escolhe**. Ligar o livro à obra errada é pior do que deixar a pessoa procurar.
1. **Pelo ISBN**, quando o arquivo tem um (EPUB: metadados; PDF: as 8 primeiras e as 4 últimas páginas, onde ficam os créditos e a contracapa). A busca do Open Library por ISBN devolve a obra e a edição exata. Como um PDF também traz os ISBNs dos livros que cita (as referências de uma dissertação), o ISBN só vale se o título ou o autor do livro conferem com os da edição achada.
2. **Senão, pelo título e pelo autor**, em busca livre, da mais exata à mais larga: o título inteiro, o subtítulo (que numa série é o volume: "Jogos Vorazes: Em Chamas" acha "Em Chamas") e o título principal, sempre com o autor. A comparação ignora acentos e artigos (inclusive o invertido dos catálogos: "Origem das Espécies, A"), e vale também para o título da edição que bateu na busca: assim "A Origem das Espécies" é reconhecida como *On the Origin of Species* (a obra original, com 259 edições), não como os registros soltos da tradução.
   - **Subtítulo que distingue a obra** ("O Senhor dos Anéis: As Duas Torres") precisa bater: o título principal sozinho seria qualquer volume da série. Subtítulo que só diz o gênero, a série ou a edição ("romance", "lenda do Ceará", "2ª edição") e a série entre parênteses ("Em Chamas (Jogos Vorazes Livro 2)") não contam.
   - **Os números têm que ser os mesmos** dos dois lados ("Diário de um Banana 2" não é o volume 1).
   - **Sem autor que valha, não busca**: um título sozinho ("Relatório", "Introdução") bate com qualquer coisa, e o de um PDF pode ser só o nome do arquivo. "Autores" de metadado ("Administrator", "Usuário do Windows", nomes de fabricante) não valem.
   - Entre as que batem, fica a de título inteiro igual ("O Senhor dos Anéis" sem subtítulo é a obra toda, não o primeiro volume), depois a com mais edições (o catálogo tem obras repetidas). Registro de obra sem edição nenhuma é sobra do catálogo e fica de fora. A edição fica para você escolher.
3. **Estados** (`livros.reconhecimento`): pendente, isbn, titulo, escolhido, sem-resultado, recusado. Só os pendentes são procurados sozinhos: o que a pessoa escolheu ou recusou fica como está. Sem conexão, o livro continua pendente e é procurado de novo 4 s depois da próxima abertura do app, dos mais novos aos mais velhos (a fila para no primeiro sinal de que está sem internet).
4. **Quando roda**: logo depois de importar (depois da capa do PDF) e na fila dos pendentes; uma requisição por vez, no máximo uma por segundo (o que o Open Library pede a quem não deixa contato), tempo-limite de 15 s, identificando o app no User-Agent, pela rede do Chromium (respeita o proxy do sistema). Quando o catálogo pede calma (429, ou 503 com Retry-After), o app espera o tempo pedido (sem dizer, um minuto) sem nem perguntar. A busca livre vai sem os caracteres que o catálogo leria como comando; consulta que ele não entende (400) conta como "não achou".
5. **Privacidade**: do computador só saem título, autor e ISBN; o arquivo, nunca. O painel diz isso. Livro sem autor não manda o título.
6. **Capa**: o livro sem capa ganha a do catálogo (a da edição, ou a da obra), conferida até o fim: se ganhou uma capa enquanto o catálogo procurava, fica com ela. O que tem capa só troca se você pedir, depois de ver a do catálogo; trocada, a capa ganha um nome de arquivo novo (`capa-<hash>.<ext>`, a tela não fica com a antiga) e a anterior sai do disco. O que o servidor de capas devolve e não é imagem é ignorado.
7. **Painel "Sobre este livro"** (menu ⋯ na biblioteca): a obra (descrição, assuntos, quantas edições, link para o Open Library), a sua edição, "Escolher a edição" (as do idioma do livro primeiro, depois as com ISBN, das mais novas às mais velhas), "Não é esta obra" (busca à mão, já preenchida com título e autor) e "Não é nenhuma destas". Um painel por livro: a resposta atrasada de um livro nunca aparece no de outro, e o processo principal só aceita uma edição da obra do próprio livro. Sem conexão, "Tentar de novo" repete só a ação que falhou. O que já se sabe aparece na hora; a descrição da obra, se faltar, chega depois.

Limites conhecidos: o Open Library tem obras repetidas, e o caminho do ISBN pode cair numa delas (é a obra que o catálogo dá para aquela edição); ISBNs de livros brasileiros recentes muitas vezes não estão lá (a obra costuma estar, e o título acha); volume de série cujo título o catálogo não tem fica sem obra ("Diário de um Banana: Rodrick é o Cara"), para a pessoa procurar; os assuntos vêm em inglês; quando o catálogo junta obras repetidas, o id guardado pode virar redirecionamento (tratar quando a parte 2 renovar os dados).

Em aberto (decisão do Daniel): se a busca no catálogo deve ser automática como hoje (os livros já importados também entram na fila depois da atualização), pedir permissão uma vez, ou ter um interruptor nos ajustes; e se o app deve deixar um contato no User-Agent (com contato, o Open Library aceita até três requisições por segundo).

## 9. Testes e verificação

- Unitários (Vitest): metadados de EPUB, banco, Locator, tempo em palavras, conversor PDF→EPUB (com PDFs gerados nos testes), catálogo (com respostas reais do Open Library gravadas em `tests/fixtures/openlibrary`).
- Ponta a ponta (Playwright `_electron`, com xvfb aqui e Windows no CI): adicionar → ler → avançar páginas → fechar → reabrir na mesma posição; temas; remover; catálogo contra um Open Library de mentira (servidor local). Os demais testes rodam sem internet (`BURROLANDIA_SEM_INTERNET`).
- Capturas de tela de cada tela para o Daniel acompanhar.

## 10. Build e distribuição

- GitHub Actions em `windows-latest` a cada push: testes, `electron-builder` (instalador NSIS e `.exe` portátil), artefatos do run e pré-release `dev` com link fixo.
- Sem assinatura de código por enquanto: o Windows mostra "O Windows protegeu o computador" → "Mais informações" → "Executar assim mesmo".

## 11. Identidade visual

A marca vem do kit do Daniel (docs/marca: manual, tokens e referências). Decisões de implementação:

- **Cores:** as cinco da marca em `estilos/tokens.css` (Ameixa Real #2F0E2F, Creme Leitura #F6EBDD, Ouro Irreverente #D4AF7C, Lilás Pensativo #B9A7D9, Grafite Focado #1F1F24) e os tons derivados, todos com contraste conferido por cálculo (texto ≥ 5,1:1; bordas e foco ≥ 3,1:1). O código fora do CSS (fundo da janela, CSS de dentro do livro, SVG) lê os mesmos HEX de `src/nucleo/cores.ts`, e um teste confere que as duas listas batem. Ouro é detalhe (ícones, fios, o botão Importar, o ponto do item atual), nunca texto pequeno; links na Noite são lilás.
- **Duas superfícies:** a da marca (ameixa, creme no texto, ouro nos destaques) no Início, na Biblioteca e no dock; a do tema de leitura no leitor, nos painéis, nos diálogos e no cartão "Continuar lendo". O tema claro se chama Creme na tela (no código e no banco continua `papel`, para não migrar preferências).
- **Letras:** Fraunces (com eixo de tamanho óptico) nos títulos e na assinatura; Inter na interface; nos livros, a escolha do leitor (Literata, Atkinson ou a do livro), nunca a fonte da marca.
- **Navegação:** sem barra lateral. Dock flutuante no centro da base com Início, Biblioteca, Importar (círculo de ouro), Buscar e Ajustes; recolhe num botão e lembra a escolha. No leitor, mora na faixa de baixo, sem Ajustes (o Aa está no topo) e some junto com as faixas.
- **Telas:** Início (saudação, Continuar lendo, Na sua estante) e Biblioteca (busca por título ou autor sem acento, formato, ordem por recentes, título — sem o artigo —, autor ou progresso, grade ou lista, selos de formato e de "Neste computador", última leitura em palavras).
- **Burro:** desenhado em SVG a partir das referências (cabeça creme, coroa de ouro, pálpebras a meio mastro). Aparece no ícone do app, no sucesso da importação e, de óculos escuros, na biblioteca vazia. Humor só fora da leitura: saudação, estado vazio, importação.
- **A decidir (produto):** Ferramentas/Transformar (resumo e reescrita por IA, sempre rotulados), Drive e sincronização, coleções, preços e cotas (não aparecem na interface), versão final vetorial da marca por designer.

## 12. Vocabulário

Um conceito, um nome, igual no código, na interface e na conversa.

| Termo | Significa |
|---|---|
| biblioteca | todos os seus livros neste app |
| livro | o seu exemplar: o arquivo que você trouxe, com a posição e o progresso |
| obra | o livro como criação (A Origem das Espécies), acima das edições (etapa 3) |
| edição | uma publicação específica de uma obra (etapa 3) |
| catálogo | o Open Library, de onde vêm as obras e as edições |
| reconhecer | ligar o seu livro à obra (e, se der, à edição) do catálogo |
| continuar lendo | o livro aberto mais recentemente e ainda não terminado |
| texto adaptado | o EPUB gerado a partir de um PDF |
| página original | o PDF como foi impresso |
| ajustes de leitura | o painel Aa (Ajustes, no dock) |
| início | a tela de abertura: saudação, continuar lendo e os livros mexidos por último |
| dock | a navegação principal, flutuando na base da janela |
| importar | trazer um arquivo do computador para a biblioteca |
| posição | onde você está no livro (Locator) |
