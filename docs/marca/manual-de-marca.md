# BURROLÂNDIA — Manual de marca e briefing de implementação

**Status:** direção visual escolhida pelo fundador; manual de referência para design e desenvolvimento.  
**Data:** 20/10/2026  
**Fonte principal:** `referencias/01_prancha_conceitual_escolhida.jpg`  
**Prioridade deste arquivo:** decisões explícitas > especificações de implementação propostas > detalhes incidentais de imagens conceituais.

> **Instrução para Claude:** use este documento como referência de identidade visual e de experiência. Preserve o nome **Burrolândia** (com **u** e acento), a paleta aprovada e a navegação inferior retrátil. Antes de alterar fluxos, dados ou preços, confirme o que ainda está classificado como hipótese. Não copie literalmente a sidebar presente no mockup: ela contraria uma decisão explícita do produto.

## 1. O que está decidido

1. **Nome:** Burrolândia (não Borolândia nem Borrolândia).
2. **Direção estética:** a **primeira proposta Burrolândia — “Leitura sem pose”**; aspecto premium, irreverência brasileira, cores profundas, sensação de conforto e elegância na experiência de leitura.
3. **Paleta oficial:** Ameixa Real `#2F0E2F`, Creme Leitura `#F6EBDD`, Ouro Irreverente `#D4AF7C`, Lilás Pensativo `#B9A7D9`, Grafite Focado `#1F1F24`.
4. **Logo/ícone:** usar como direção principal o **rosto de burro claro com pequena coroa**, em fundo ameixa. A **variação com óculos escuros** pode ser usada em campanhas ou momentos bem-humorados. O burro-personagem com coroa e óculos é um elemento expressivo da marca. Monograma “B” e símbolo isolado de coroa são apenas alternativas secundárias; **não priorizar seu uso**.
5. **Tipografia:** **Fraunces** para grandes títulos e comunicação editorial; **Inter** para interface e microtexto. Corpo dos livros deve aceitar seleção da fonte pelo leitor; não forçar a fonte institucional no conteúdo importado.
6. **Desktop:** NÃO usar sidebar fixa. A navegação principal é um **dock flutuante, centralizado na base, retrátil**; deve poder aparecer e desaparecer em estados de foco/leitura, com acesso por mouse, toque e teclado.
7. **Mobile:** interface de leitura clara e espaçosa, com navegação inferior discreta fora do foco e controles que somem durante leitura imersiva.
8. **Proposta funcional:** centralizar biblioteca pessoal dispersa entre dispositivos e ler ebooks/PDFs, extraindo conteúdo e **recompondo uma visualização fluida** adaptada ao celular.

## 2. Alma da marca

**Personalidade:** debochada, culta sem pedantismo, absurda com intenção, brasileira, autoconsciente, acolhedora e caprichada.

**Tensão criativa:** uma marca que faz piada da própria burrice, mas entrega uma das experiências de leitura mais confortáveis possíveis. **O produto é sério; a embalagem tem senso de humor.**

**Sensações visadas:** “gostoso de mexer”, premium acessível, calmaria durante a leitura, personalidade marcante fora do texto, continuidade entre celular e desktop.

**Frases exploráveis (não necessariamente slogans obrigatórios):**
- “Leitura séria para gente questionável.” (presente na referência escolhida)
- “Leia sem pose.”
- “Conhecimento também tem seu lado bobo.”
- “O mesmo conteúdo, mais seu.”
- “Burro também aprende.”

**Regra de tom:** piada no onboarding, empty states, feedback de importação e marketing; **não interromper leitura com piadas repetidas**. Evitar infantilização, excesso de memes, ironia contra o usuário, ruído visual, ou mascote cobrindo o texto.

## 3. Paleta aprovada e aplicação

| Token | HEX | Uso preferencial |
|---|---|---|
| Ameixa Real | `#2F0E2F` | brand, telas de biblioteca imersivas, dock, botões primários |
| Creme Leitura | `#F6EBDD` | leitura, telas de documentos, superfícies de conforto |
| Ouro Irreverente | `#D4AF7C` | ornamentos, coroa, pequenos destaques gráficos |
| Lilás Pensativo | `#B9A7D9` | seleção, notas, hovers, realce de passagem |
| Grafite Focado | `#1F1F24` | parágrafos e controles em fundos claros |

**Combinações-base:** textos grafite sobre creme; textos creme sobre ameixa; ouro como detalhe e não como cor padrão de texto pequeno. Validar contraste WCAG 2.2 AA antes de fechar os estados de foco, alerta, disabled, texto de botão e badges. O azul noturno e roxo lavanda de versões anteriores são **referências de atmosfera**, não cores extras da paleta aprovada.

**Tokens estruturados:** `tokens.json`. Valores semânticos e mapeamentos são recomendações iniciais; os cinco HEX acima são o núcleo aprovado.

## 4. Logo, mascote e iconografia

- **Assinatura preferencial:** palavra **Burrolândia** com uma serifa marcante, premium e expressiva; versões de alto contraste sobre ameixa e creme.
- **App icon:** cabeça simplificada do burro em creme, com coroa em ouro, em quadrado arredondado ameixa; precisa funcionar a 24 px, 48 px e 128 px.
- **Ícone de variação:** burro de óculos escuros e coroa em versões especiais, identidade social e campanha.
- **Mascote editorial:** burro com postura autoconfiante e humor absurdo, possivelmente figurino premium. Reaparecer pontualmente em onboarding, biblioteca vazia, sucesso de adaptação e marketing.
- **Elementos opcionais:** monograma e coroa isolada podem ficar no inventário da marca, mas não há obrigação de mostrá-los no produto.
- **Limite:** a prancha é arte conceitual gerada por IA, **não um arquivo de identidade vetorial final**. Vetorizar/redesenhar o ícone, a assinatura e o mascote em SVG antes de produção. Verificar legibilidade, formas e reprodução.

Referências visuais: `referencias/02_assinatura_logo_e_mascote.jpg`, `referencias/03_icones_da_marca.jpg`, `referencias/07_personagem_e_tom_de_voz.jpg`.

## 5. Tipografia, ícones e composição

- **Display:** Fraunces, preferencialmente com contraste de peso e espaço; títulos curtos e vivos.
- **UI:** Inter, com hierarquia consistente, bom espaçamento e legibilidade em 320 px a desktops grandes.
- **Leitura:** permitir tamanho de fonte, família, entrelinha, margem/largura da coluna, tema claro/escuro e alinhamento que não comprometa legibilidade.
- **Raio dos componentes:** moderado; bordas suaves, cartões elegantes e sombras discretas, sem neumorfismo dominante.
- **Iconografia:** linear, consistente e de alta legibilidade; coroa é tempero, não obrigação em todo botão.
- **Motion:** transições curtas e suaves no dock, bibliotecas e progresso; respeitar `prefers-reduced-motion`.

## 6. Diretrizes de experiência — desktop

### Navegação — regra incontornável

**Não implementar uma sidebar.** A referência visual do laptop tem uma barra lateral ilustrativa: esse elemento está **explicitamente rejeitado** para o produto final.

Implementar um **dock flutuante inferior** com: Início, Biblioteca, Importar (ação de destaque), Ferramentas/Transformar, Buscar ou Mais (ajustável após arquitetura de informação). O dock deve:
- flutuar sobre o conteúdo sem ocupar lateral permanente;
- permanecer retrátil, com estado compacto/expandido;
- recolher na leitura imersiva e reabrir por gesto intencional, ponteiro, controle visível quando necessário ou atalho de teclado;
- ter nomes acessíveis, foco visível, alvos confortáveis e navegação completa por teclado;
- não ocultar parágrafos, controles de paginação nem conteúdo no rodapé;
- acompanhar as dimensões da janela; não depender exclusivamente de hover.

### Biblioteca

Tela com capa, título, autor, tipo de arquivo, progresso, sincronização, última leitura e origem/importação. Grid para exploração e lista para gestão, busca, ordenação, filtros e coleções. Dar clareza sobre **o que está salvo localmente, o que foi enviado ao Drive e o que ainda falta sincronizar**.

### Leitor

Área principal em **Creme Leitura**, tipografia ajustável, largura de linha confortável, marcações e progresso sutil. Ferramentas contextuais surgem quando úteis; evitar barras persistentes distraindo. Recurso de “ver original” e “ver adaptado” com rastreabilidade das passagens sempre que houver recomposição.

Referência visual: `referencias/05_interface_desktop_referencia.jpg` (cor e atmosfera, **não copiar a sidebar**).

## 7. Diretrizes de experiência — mobile

- Home com saudação curta, importar, últimos livros, progresso e busca.
- Leitor com atenção total ao texto, margens confortáveis e controles que se ocultam ao rolar ou tocar.
- Navegação inferior compacta e consistente nas telas de aplicação; leitor imersivo pode escondê-la temporariamente.
- Entrada em leitura a partir da biblioteca com retorno claro à posição de origem.
- Modo PDF original e modo **texto adaptado ao celular**, quando a extração tiver qualidade suficiente.
- Mensagens de progresso realistas para extração e sincronização; nunca sugerir que uma operação terminou sem confirmação.

Referência visual: `referencias/06_interface_mobile_referencia.jpg`.

## 8. Produto e biblioteca na nuvem (Drive Burrolândia)

**Necessidade de origem:** os livros do proprietário estão espalhados entre dispositivos; o produto deve tornar a biblioteca pessoal **centralizada, preservada, pesquisável e sincronizada**.

**Capacidades desejadas:** upload/importação de PDF/ePub conforme suporte, biblioteca na nuvem associada à conta, sincronização de metadados e progresso, download para leitura offline, reimportação sem duplicações óbvias, exportação/download do original, indicação de falhas e quota utilizada, prevenção de perda acidental de arquivos.

**Cuidados:** decisões de armazenamento precisam considerar custos, privacidade, segurança, backups, limites por usuário, licenças/direitos autorais e tolerância a falhas. Nunca prometer “armazenamento ilimitado” sem arquitetura e custos aprovados.

**Monetização:** o proprietário considera acesso gratuito para si e **armazenamento pago para outras pessoas**, com um preço ilustrativo de **cerca de R$ 2/mês**. Isso é **hipótese comercial, não preço aprovado**. Não inserir preço fixo nos layouts, não desenhar assinatura obrigatória ou cotas sem definição posterior. Separar acesso ao leitor, biblioteca local e armazenamento em nuvem na modelagem do produto.

## 9. Transformação de conteúdo — definição importante

A expressão “reescrever” aqui significa sobretudo **extrair, reorganizar e recompor a apresentação** de e-books e PDFs para uma leitura adequada ao tamanho da tela, preservando o conteúdo intelectual e oferecendo rastreabilidade ao original. Não equivale automaticamente a alterar o texto do autor.

**Princípios:** preservar original imutável; apresentar visualização adaptada como derivada; manter títulos, parágrafos, ênfases, notas, figuras e referências quando possível; mostrar erros/limitações de extração; permitir comparação com original. Simplificação, resumo, reescrita semântica ou adaptação por IA são **funcionalidades distintas**, sempre ativadas explicitamente e rotuladas.

## 10. Componentes e estados de interface

Implementar biblioteca, card de livro, barra de progresso, badge de sync, campo de busca, filtro, CTA de importação, dock retrátil, modal/dialog, toast discreto, estado vazio com mascote, skeleton de extração, painel de comparação original/adaptado, leitor com controles de tipografia, erros de arquivo e estado offline. Priorizar clareza operacional sobre piadas.

**Estados obrigatórios:** vazio, carregando, sucesso confirmado, erro recuperável, sem conexão, upload em andamento, conflito de versão e falta de espaço na nuvem (quando existir quota).

## 11. Checklist de aceite para design/código

- [ ] Nome aparece como **Burrolândia** em todos os pontos.
- [ ] Cinco cores de marca são usadas com HEX corretos e tokens centralizados.
- [ ] Fraunces para marca/títulos e Inter para UI; texto de livro personalizável.
- [ ] Identidade visual acompanha a prancha escolhida, não outras explorações.
- [ ] App icon principal com burro/coroa; variação de óculos é secundária.
- [ ] Nenhuma sidebar fixa no desktop.
- [ ] Dock inferior flutuante retrátil acessível por teclado e usável sem hover.
- [ ] Mobile tem navegação compacta e leitura imersiva.
- [ ] Arquivo original preservado; adaptação claramente identificada.
- [ ] Biblioteca diferencia sincronização na nuvem e armazenamento local.
- [ ] Preço e cotas de Drive aparecem como **a definir**, sem valor imposto.
- [ ] Copy bem-humorada não atrapalha leitura ou gera ambiguidade de status.
- [ ] Contraste, responsividade, redução de movimento e controles de fonte testados.

## 12. Assets anexos

- `referencias/01_prancha_conceitual_escolhida.jpg`: **fonte estética principal**; paleta, mascote, marca e atmosfera.
- `referencias/02_assinatura_logo_e_mascote.jpg`: logo editorial e mascote de campanha.
- `referencias/03_icones_da_marca.jpg`: ícone prioritário e variação.
- `referencias/04_paleta_e_tipografia.jpg`: cor e famílias tipográficas.
- `referencias/05_interface_desktop_referencia.jpg`: atmosfera do leitor desktop; sidebar na imagem deve ser ignorada.
- `referencias/06_interface_mobile_referencia.jpg`: direção de home mobile e navegação inferior.
- `referencias/07_personagem_e_tom_de_voz.jpg`: tom irreverente do personagem.
- `tokens.json`: cores e tokens iniciais em JSON.

## 13. Pedido pronto para desenvolvimento

> Implemente a identidade visual e as telas-base da Burrolândia conforme este documento e as imagens de referência. Priorize a prancha escolhida e os cinco HEX oficiais. Preserve uma UI premium e confortável, com humor pontual fora do fluxo principal de leitura. No desktop, substitua qualquer sidebar do conceito por um dock **inferior flutuante e retrátil**; no mobile, mantenha navegação discreta e leitura imersiva. Prepare Biblioteca, Importação, Leitor e Visualização Adaptada; deixe a arquitetura pronta para um Drive pessoal sincronizado, mas **não fixe planos/preços/cotas**. Preserve os arquivos originais e identifique explicitamente qualquer visualização transformada. Separe o que foi implementado do que depende de decisão de produto.
