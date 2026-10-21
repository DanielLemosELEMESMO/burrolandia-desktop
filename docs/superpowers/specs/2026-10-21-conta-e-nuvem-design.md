# Parte 2 — Conta e nuvem

Data: 21/10/2026 · Estado: em construção (o Daniel passou o projeto do Supabase e pediu para seguir; este documento registra as decisões).

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
   - o arquivo original (bucket privado `arquivos`), até **50 MB**, o limite por arquivo do plano gratuito; o plano gratuito tem **1 GB** no total. Livro maior fica só no aparelho, e o app diz isso.
4. **Conflitos**: a posição mais recente vence, venha de onde vier. No resto, mudança local ainda não enviada vence; senão, vale a da nuvem. Remover um livro num aparelho remove nos outros (só a cópia do app; o arquivo original no computador fica onde estava) e apaga da nuvem a capa e o arquivo dele.
5. **Livro de outro aparelho**: aparece na biblioteca com o selo "Na nuvem". Ao abrir, o app baixa o arquivo, confere o hash, prepara (o PDF ganha o texto adaptado) e abre na posição sincronizada. Sem o arquivo na nuvem, explica que ele ficou no outro aparelho.
6. **Quando sincroniza**: ao entrar, ao abrir o app, alguns segundos depois de qualquer mudança (a posição incluída) e a cada 5 minutos com o app aberto; e quando você pede, em "Sua conta".
7. **Segurança**: RLS em todas as tabelas (cada pessoa só lê e escreve o que é seu, pelo `auth.uid()`); buckets privados, com política por pasta (o primeiro nível do caminho é o id da pessoa). A chave publicável vai no app (ela é feita para isso, com a RLS por trás). A chave secreta, o token de acesso e a senha do banco nunca entram no repositório.
8. **Esquema versionado** em `supabase/migrations/`, aplicado pelo Management API do Supabase.

## 3. O banco na nuvem

- `livros` (chave: pessoa + hash): os campos do item 3, mais `capa` e `arquivo` (o nome do arquivo no storage, quando já foi enviado), `removido_em` (lápide) e `atualizado_em` (a hora do servidor, que guia a sincronização).
- `guardar_livros(livros jsonb)`: grava vários de uma vez, com a regra da posição mais recente feita no próprio banco.
- `remover_livros(hashes text[])`: põe a lápide.
- `uso_da_nuvem()`: quanto a pessoa ocupa no storage.

## 4. O app

- **Sua conta** (o botão no alto das telas Início e Biblioteca): entrar, criar conta, ver o que já subiu, sincronizar agora, sair.
- **Sincronização** (`src/main/nuvem.ts`): manda o que mudou desde a última vez (capa e arquivo junto, se ainda não subiram) e recebe o que mudou na nuvem desde a última leitura. Fala com uma interface (`Remoto`): no app, o Supabase; nos testes, uma nuvem de mentira em memória (unitários) e numa pasta compartilhada entre duas instâncias do app (ponta a ponta: dois "aparelhos").

## 5. Fora desta entrega

O texto adaptado dos PDFs não sobe (cada aparelho converte); estantes, destaques e notas ficam para depois; login com Google e confirmação por e-mail esperam o SMTP próprio.
