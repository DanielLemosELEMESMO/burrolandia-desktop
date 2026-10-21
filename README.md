# Burrolândia

Sua biblioteca de EPUBs e PDFs, agradável de ler em qualquer tela. Esta é a versão desktop (Electron).

O projeto segue as três forças herdadas da IRVV:

- **Ambientação**: ao abrir, você está onde parou e sabe para onde ir.
- **Rotina**: ler cabe no dia a dia, e voltar ao livro não custa nada.
- **Acessibilidade**: qualquer pessoa lê com conforto, sem ajuda, do início ao fim.

As decisões estão nas specs: [a biblioteca](docs/superpowers/specs/2026-10-20-minha-biblioteca-design.md) e [a conta e a nuvem](docs/superpowers/specs/2026-10-21-conta-e-nuvem-design.md).

## Testar no seu computador (Windows)

A cada push, o GitHub Actions roda os testes e gera dois arquivos na pré-release **dev** (em _Releases_, no GitHub):

- `Burrolandia-Instalador-<versão>.exe`: instala e abre (recomendado).
- `Burrolandia-Portatil-<versão>.exe`: abre sem instalar.

O app ainda não é assinado. Se o Windows avisar, clique em **Mais informações → Executar assim mesmo**.

Os seus livros ficam em `%APPDATA%\Burrolandia`.

## Desenvolver

Requisitos: Node 22 ou mais novo.

```bash
npm install
npm run dev        # abre o app com recarga automática
npm test           # testes unitários (Vitest)
npm run e2e        # build + testes de ponta a ponta com o app de verdade (Playwright)
npm run typecheck
npm run dist:win   # gera o instalador e o portátil em release/ (rode no Windows)
```

Num Linux sem tela (como o ambiente na nuvem), use `xvfb-run -a npm run e2e`.

Para testar o app empacotado (como o usuário recebe), gere a versão Linux e aponte os testes para ela:

```bash
npx electron-builder --linux dir --publish never
BURROLANDIA_EXECUTAVEL=$PWD/release/linux-unpacked/burrolandia-desktop xvfb-run -a npx playwright test
```

A nuvem: os testes de ponta a ponta usam um Supabase de mentira (ou a nuvem desligada). O contrato contra o Supabase de verdade roda só quando pedido, com o token pessoal do painel do Supabase (que nunca entra no repositório):

```bash
SUPABASE_REF=<id do projeto> SUPABASE_TOKEN=<token> BURROLANDIA_NUVEM_AO_VIVO=1 npx vitest run tests/unit/nuvem-contrato.test.ts
SUPABASE_REF=<id do projeto> SUPABASE_TOKEN=<token> node scripts/supabase-migrar.mjs   # aplica as migrações de supabase/migrations
```

Capturas das telas principais:

```bash
npx electron-vite build
xvfb-run -a npx playwright test --config tests/capturas/playwright.config.ts
```

## Como está organizado

```
src/
  nucleo/     lógica sem Electron: tipos, EPUB (ler e escrever), PDF, catálogo (Open Library), nuvem (regras de conflito), validação, tempo em palavras
  main/       processo principal: janela, protocolo app://, IPC, banco (SQLite embutido), biblioteca no disco, sincronização e Supabase
supabase/     migrações do banco na nuvem (tabela, RLS, funções, buckets)
  preload/    ponte mínima e tipada entre a interface e o processo principal
  renderer/   interface em React; o leitor usa o foliate-js (vendorizado em src/renderer/src/vendor)
tests/
  unit/       Vitest
  e2e/        Playwright com o app de verdade
  fixtures/   livros de teste gerados na hora (Machado de Assis, domínio público) e respostas gravadas do Open Library
```

- **Local primeiro**: tudo funciona sem internet e sem conta. Com a conta (parte 2, Supabase), os livros, as capas, a obra e a página onde você parou vão para os outros aparelhos; os arquivos (até 50 MB) ficam numa pasta privada da conta. Cada livro é o hash do arquivo, e os conflitos se resolvem campo a campo (a posição mais recente vence). Ver `src/main/nuvem.ts`, `src/nucleo/nuvem` e `supabase/migrations`. Nos testes, `BURROLANDIA_NUVEM=desligada` (o padrão dos testes) ou o endereço de um Supabase de mentira.
- **Formatos portáteis**: todo livro vira EPUB e a posição segue o Locator do Readium, para o app de celular entender a mesma posição.
- **PDF**: na importação, um processo separado (`src/main/conversor.ts`) converte o PDF num EPUB, o "texto adaptado" (`src/nucleo/pdf`): junta linhas em parágrafos, desfaz a hifenização, tira cabeçalhos e números de página, lê duas colunas na ordem e divide em capítulos pelos marcadores do PDF ou pelos títulos. Cada página do original vira uma marca no EPUB, e assim o leitor alterna entre o texto adaptado e a página original sem perder a página. PDF digitalizado (só imagem) abre na página original.
- **Obra e edição**: cada livro é reconhecido no Open Library (`src/main/catalogo.ts`, lógica em `src/nucleo/catalogo`): pelo ISBN, a edição exata (se o título ou o autor conferem); senão, a obra pelo título e pelo autor, inclusive traduções e volumes de série. Na dúvida, não escolhe: livro sem autor não é procurado pelo título. O painel "Sobre este livro" mostra a obra e deixa escolher a edição. Só saem do computador título, autor e ISBN, no máximo uma requisição por segundo. Sem internet, o livro fica pendente e é procurado na próxima abertura. Nos testes, `BURROLANDIA_SEM_INTERNET=1` desliga o catálogo e `BURROLANDIA_CATALOGO=<url>` aponta para um de mentira.

Os PDFs de teste são gerados pelo próprio Electron (`tests/fixtures/gerar-pdfs.cjs`) e ficam no repositório.
