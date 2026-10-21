# Parte 2 — Conta e nuvem

Data: 21/10/2026 · Estado: entregue e revisado (o Daniel passou o projeto do Supabase e pediu para seguir; este documento registra as decisões e como ficou, já com as correções da revisão).

## 1. Propósito

A mesma biblioteca em qualquer aparelho: entrar com a sua conta e encontrar os seus livros, as capas que você escolheu, a obra de cada um e **a página onde você parou**, no computador e, depois, no celular (outro projeto). Os arquivos são seus e privados: a nuvem é uma pasta só sua, não uma vitrine.

## 2. Decisões

1. **Conta**: e-mail e senha (Supabase Auth). A confirmação por e-mail fica desligada por enquanto: o envio padrão do Supabase manda 2 e-mails por hora e só para quem é da equipe do projeto. Com um SMTP próprio (Resend, por exemplo), liga a confirmação e o "esqueci a senha".
2. **Onde roda**: o cliente do Supabase mora no processo principal, junto do banco e dos arquivos; a interface só pede pelo IPC. A sessão fica no banco local, cifrada pelo sistema (`safeStorage`: DPAPI no Windows).
3. **O que sincroniza**:
   - a lista de livros, cada um identificado pelo **hash do arquivo** (o mesmo PDF em dois aparelhos é o mesmo livro);
   - título, autores, idioma, formato, tamanho, identificadores, obra, edição e como foi reconhecido;
   - a posição de leitura, com a hora em que mudou, e quando o livro foi aberto por último;
   - a capa (bucket privado `capas`);
   - o arquivo original (bucket privado `arquivos`), até **50 MB**, o limite por arquivo do plano gratuito; o plano gratuito tem **1 GB** no total, e cada conta pode guardar até **800 MB** (o número fica em `uso_da_nuvem`, no banco: mudar não pede versão nova do app). Livro maior, ou além do espaço da conta, fica só no aparelho, e o app diz isso.
4. **Conflitos**, campo a campo, pela hora em que cada coisa mudou no aparelho: a posição mais recente vence, venha de onde vier (`posicao_em`); título, autores, obra e edição também (`metadados_em`); a capa escolhida por último (`capa_em`; capa nula não apaga a que está lá); o arquivo entra uma vez e fica; a última abertura é a mais recente. Remover um livro num aparelho remove nos outros (só a cópia do app; o arquivo original no computador fica onde estava) e apaga da nuvem a capa e o arquivo dele.
   - **O que o app faz sozinho tem hora fraca** (1970): o título e a capa que vieram no arquivo, a capa gerada da primeira página do PDF, a do catálogo para um livro sem capa, o reconhecimento automático. Perde para qualquer escolha sua (a obra ou a edição escolhida, "não é nenhuma destas", a capa trocada), em qualquer aparelho; entre automáticos, o ISBN vale mais que o título, que vale mais que "não achou", que vale mais que o que veio no arquivo. Assim um aparelho que importou o mesmo arquivo depois não passa por cima do que você arrumou.
   - **Só o que você faz move a posição**: virar a página, rolar, o sumário, um link do livro. Abrir o livro, mudar a letra ou o tamanho da janela não gravam posição; com o livro aberto, uma posição mais nova que chega de outro aparelho leva o leitor até ela.
5. **Livro de outro aparelho**: aparece na biblioteca com o selo "Na nuvem". Ao abrir, o app baixa o arquivo, confere o hash, prepara (o PDF ganha o texto adaptado) e abre na posição sincronizada. Sem o arquivo na nuvem, explica que ele ficou no outro aparelho.
6. **Quando sincroniza**: ao entrar, ao abrir o app, alguns segundos depois de qualquer mudança (a posição incluída) e a cada 5 minutos com o app aberto; e quando você pede, em "Sua conta".
7. **Segurança**: RLS em todas as tabelas (cada pessoa só lê e escreve o que é seu, pelo `auth.uid()`); buckets privados, com política por pasta (o primeiro nível do caminho é o id da pessoa). A chave publicável vai no app (ela é feita para isso, com a RLS por trás). A chave secreta, o token de acesso e a senha do banco nunca entram no repositório.
8. **Esquema versionado** em `supabase/migrations/`, aplicado pelo Management API do Supabase.

## 3. O banco na nuvem

- `livros` (chave: pessoa + hash): os campos do item 3, mais `capa` e `arquivo` (o nome do arquivo no storage, quando já foi enviado), `removido_em` (lápide) e `atualizado_em` (a hora do servidor, que guia a sincronização).
- `guardar_livros(itens jsonb)`: grava até 200 livros de uma vez (cada item com as colunas da tabela e `novo`), com as regras de conflito feitas no próprio banco; devolve como cada um ficou.
- `remover_livros(itens jsonb)`: `[{hash_sha256, removido_em}]`; põe a lápide e apaga o que era pessoal (posição, obra, capa). Um livro adicionado de novo depois da hora da remoção fica.
- `uso_da_nuvem()`: quanto a pessoa ocupa no storage e quanto pode ocupar (`limite`).

Também: `livros_desde(desde, depois_de, limite)` lê o que mudou de página em página; `hora_do_aparelho` limita as horas dos aparelhos a 5 minutos à frente do servidor (um relógio adiantado não ganha todas), no gatilho da tabela (vale também para uma escrita direta). Um livro que volta como novo para a conta enquanto ainda está vivo conta como adicionado na hora dele: uma remoção feita antes, em outro aparelho, que só chegar depois, não o tira. Os buckets aceitam só os nomes e os tipos que o app usa (`capas/<conta>/<hash>/capa-<hash da imagem>.<tipo>`, `arquivos/<conta>/<hash>.<epub|pdf>`).

## 4. O app

- **Sua conta** (o botão no alto das telas Início e Biblioteca, `componentes/Conta.tsx`): entrar ou criar a conta; depois, como está a nuvem, quanto a conta guarda, sincronizar agora e sair.
- **Sincronização** (`src/main/nuvem.ts`): (1) traz o que mudou na nuvem, voltando um minuto para não perder mudanças gravadas fora de ordem; (2) manda as lápides e os livros mudados (cada mudança local soma uma versão; a capa sobe antes, com o nome do conteúdo); (3) sobe os arquivos de até 50 MB, um por vez. A decisão de como um livro da nuvem entra no aparelho é a mesma regra, do lado de cá (`nucleo/nuvem/aparelho.ts`), e o que chega é conferido campo a campo (`nucleo/nuvem/limpar.ts`).
- **Quando**: ao abrir o app, ao entrar, alguns segundos depois de cada mudança, a cada 5 minutos, ao voltar para a janela depois de 30 segundos, e antes de abrir um livro (só a leitura, esperando no máximo 2 segundos, para a posição de outro aparelho valer). Fechando, sobe o que faltar (no máximo 3 segundos).
- **Livro de outro aparelho**: `estado = 'na-nuvem'`, com a pasta só com a capa; abrir chama `nuvem:baixar` (confere o hash e prepara como na importação) e depois abre. O diálogo do download pode fechar (o livro continua descendo). Sem o arquivo na nuvem (grande demais, ou ainda não subiu), adicionar o mesmo arquivo neste computador completa o livro, sem baixar.
- **Arquivos**: um por vez, até o espaço da conta; um que a nuvem recusa não segura os outros (tenta de novo em uma hora), e entre um e outro o que mudou aqui (a posição) sobe. Todo pedido tem tempo limite (30 s; arquivos, 10 min).
- **Sair** (com confirmação): o que falta subir sobe antes (até 3 s); o ciclo em andamento para e os pedidos dele são cancelados; a sessão guardada é esquecida mesmo sem conexão; os livros que vieram da nuvem, baixados ou não, saem deste computador; os adicionados aqui ficam e voltam a ser "nunca enviados". Entrar com outra conta não leva nada da anterior (o marcador do que já foi lido é de cada conta). Sessão terminada (saiu em todos os aparelhos, senha trocada): o app tenta renovar uma vez (um relógio atrasado faz o token vencer antes); recusada de novo, pede para entrar, sem mexer nos livros.
- **Interface `Remoto`** (`nucleo/nuvem/remoto.ts`): no app, `RemotoSupabase` (`src/main/supabase.ts`, supabase-js pela rede do Chromium); nos testes, a nuvem de mentira em memória (`tests/fakes`, com as mesmas regras em `nucleo/nuvem/regras.ts`) e, de ponta a ponta, um Supabase de mentira por HTTP (`tests/e2e/nuvem-falsa.ts`) para dois apps com pastas diferentes.

## 4.1. Testes

- Contrato (`tests/unit/nuvem-contrato.test.ts`): as mesmas situações contra a nuvem de mentira e contra o Supabase de verdade (`BURROLANDIA_NUVEM_AO_VIVO=1` com `SUPABASE_REF` e `SUPABASE_TOKEN`): regras de conflito, lápides, páginas, arquivos, e a RLS (outra conta e sem conta não leem nem mexem em nada). As contas de teste (`@burrolandia.test`) e os arquivos delas são apagados no fim.
- Sincronização (`tests/unit/nuvem-sincronizacao.test.ts`): dois e três aparelhos na mesma nuvem, inclusive as corridas (sair ou trocar de conta no meio da leitura, capa trocada durante o envio e o download, removido durante o download) e os limites (espaço da conta, arquivo recusado, livro recusado).
- `RemotoSupabase` sem rede (`tests/unit/supabase.test.ts`): sair sem conexão e com o token vencido, cancelar, tempo limite, renovar a sessão uma vez.
- Ponta a ponta (`tests/e2e/nuvem.spec.ts`, `nuvem-posicao.spec.ts`): a posição vai de um aparelho para o outro e volta; o livro aberto e parado não passa por cima da leitura de outro; reabrindo numa rede lenta, o livro vai para a posição nova quando ela chega; remover num tira do outro; sair; senha errada.

## 4.2. Limites conhecidos

- Sem confirmação de e-mail e sem "esqueci a senha" até haver um SMTP próprio: qualquer um cria conta com qualquer e-mail, e quem esquece a senha perde o acesso à conta (os livros do computador continuam).
- O plano gratuito tem 1 GB de armazenamento para o projeto inteiro. O limite por conta (800 MB) é respeitado pelo app, não pelo banco: com o cadastro aberto, alguém com a chave publicável poderia encher o projeto. Para uso só seu, dá para fechar novos cadastros no Supabase (Authentication → Sign In / Providers → "Allow new users to sign up") depois de criar as contas.
- Dois aparelhos mexendo no mesmo livro no mesmo instante (trocando a capa, ou um removendo enquanto o outro adiciona de novo) podem deixar uma capa ou um arquivo faltando na nuvem: quem limpa lista e apaga o que não vale mais. Raro; trocar a capa (ou adicionar o arquivo) de novo resolve.
- Capas trocadas antes de entrar na conta pela primeira vez contam como automáticas (não há como saber quais foram escolhidas): se uma delas não aparecer no outro computador, trocar de novo com a conta aberta resolve.
- As lápides ficam para sempre (sem nada pessoal: só o hash e a hora), para um aparelho que passou meses desligado não trazer de volta um livro removido.
- Conflitos usam as horas dos aparelhos: um relógio atrasado pode perder para uma mudança que, de fato, foi antes.
- Um livro aberto num aparelho e removido em outro sai da biblioteca na próxima sincronização, mesmo aberto (o leitor continua até fechar).

## 5. Fora desta entrega

O texto adaptado dos PDFs não sobe (cada aparelho converte); estantes, destaques e notas ficam para depois; login com Google e confirmação por e-mail esperam o SMTP próprio.

## 6. Para o app do celular

O APK usa o mesmo projeto, as mesmas funções e os mesmos buckets. Para ser a mesma biblioteca, ele faz igual ao desktop:

- **O livro** é o SHA-256 dos bytes do arquivo original, em hexadecimal minúsculo (nunca do texto adaptado nem de uma cópia mexida).
- **A posição** é o Locator como o desktop grava (`src/nucleo/tipos.ts`, montado em `telas/Leitor.tsx`): no EPUB e no texto adaptado, `locations.cfi` (o CFI do foliate-js), `progression` no capítulo e `totalProgression` no livro; no texto adaptado de um PDF, também `fragments: ["pagina-N"]`; na página original do PDF, `fragments: ["page=N"]`. Quando o CFI não leva a lugar nenhum, o desktop cai para a página do original e depois para a fração do livro: um leitor que não fale CFI ainda acerta a página de um PDF, mas num EPUB fica só com a fração.
- **A capa** fica em `capas/<conta>/<hash do livro>/capa-<12 primeiros hex do SHA-256 da imagem>.<jpg|png|webp|gif|svg>`, e quem baixa confere o nome contra o conteúdo. **O arquivo** fica em `arquivos/<conta>/<hash>.<epub|pdf>`, até 50 MB; depois de enviado, o livro vai com `arquivo = '<hash>.<formato>'`.
- **As horas** de cada grupo de campos (`metadados_em`, `capa_em`, `posicao_em`) são as do aparelho no momento da mudança, e são elas que decidem os conflitos; o banco corta o que passar de 5 minutos à frente da hora dele. O que o app faz sozinho usa a hora fraca (`HORA_FRACA` e `horaDoReconhecimento` em `nucleo/nuvem/regras.ts`: 1970, com o ISBN, o título e o "não achou" alguns milissegundos à frente); só uma escolha da pessoa usa a hora de agora.
- **A posição** só muda por um gesto da pessoa (virar, rolar, ir pelo sumário ou por um link); abrir o livro e mudar o layout não gravam nada. Com o livro aberto, uma posição mais nova que chegar vale.
- **`novo`** vai `true` só enquanto este aparelho ainda não enviou o livro para esta conta: assim um livro importado de novo volta, e um aparelho atrasado não desfaz uma remoção. Uma lápide só tira do aparelho um livro que ele já tinha enviado.
- **O que mudou** vem de `livros_desde`, a partir do `atualizado_em` e do hash do último livro recebido, voltando um minuto (o banco às vezes grava fora de ordem); por isso, aplicar de novo um livro igual não pode mudar nada.
- **Remover** é `remover_livros` e, depois, apagar a capa e o arquivo do storage; a lápide só é esquecida depois disso.
- **Antes de subir arquivos**, `uso_da_nuvem()` diz o espaço da conta (`bytes` e `limite`).
- **O que chega da nuvem** é conferido antes de entrar no banco (`nucleo/nuvem/limpar.ts`).

O teste de contrato (`tests/unit/nuvem-contrato.test.ts`) descreve esse comportamento e roda contra o Supabase de verdade. Em TypeScript (Capacitor, ou React Native com o leitor numa WebView), `src/nucleo` (EPUB, PDF → texto adaptado, catálogo, regras da nuvem) vira um pacote dos dois apps, e o foliate-js garante os mesmos CFIs.
