# Parte 2 — Conta e nuvem

Data: 21/10/2026 · Estado: entregue (o Daniel passou o projeto do Supabase e pediu para seguir; este documento registra as decisões e como ficou).

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

Também: `livros_desde(desde, depois_de, limite)` lê o que mudou de página em página; `hora_do_aparelho` limita as horas dos aparelhos a 5 minutos à frente do servidor (um relógio adiantado não ganha todas). Os buckets aceitam só os nomes e os tipos que o app usa (`capas/<conta>/<hash>/capa-<hash da imagem>.<tipo>`, `arquivos/<conta>/<hash>.<epub|pdf>`).

## 4. O app

- **Sua conta** (o botão no alto das telas Início e Biblioteca, `componentes/Conta.tsx`): entrar ou criar a conta; depois, como está a nuvem, quanto a conta guarda, sincronizar agora e sair.
- **Sincronização** (`src/main/nuvem.ts`): (1) traz o que mudou na nuvem, voltando um minuto para não perder mudanças gravadas fora de ordem; (2) manda as lápides e os livros mudados (cada mudança local soma uma versão; a capa sobe antes, com o nome do conteúdo); (3) sobe os arquivos de até 50 MB, um por vez. A decisão de como um livro da nuvem entra no aparelho é a mesma regra, do lado de cá (`nucleo/nuvem/aparelho.ts`), e o que chega é conferido campo a campo (`nucleo/nuvem/limpar.ts`).
- **Quando**: ao abrir o app, ao entrar, alguns segundos depois de cada mudança, a cada 5 minutos, ao voltar para a janela depois de 30 segundos, e antes de abrir um livro (só a leitura, esperando no máximo 2 segundos, para a posição de outro aparelho valer). Fechando, sobe o que faltar (no máximo 3 segundos).
- **Livro de outro aparelho**: `estado = 'na-nuvem'`, com a pasta só com a capa; abrir chama `nuvem:baixar` (confere o hash e prepara como na importação) e depois abre.
- **Sair**: os livros que estavam só na nuvem saem deste computador; os daqui ficam e voltam a ser "nunca enviados". Entrar com outra conta não leva nada da anterior. Sessão terminada (saiu em todos os aparelhos, senha trocada): o app pede para entrar de novo, sem mexer nos livros.
- **Interface `Remoto`** (`nucleo/nuvem/remoto.ts`): no app, `RemotoSupabase` (`src/main/supabase.ts`, supabase-js pela rede do Chromium); nos testes, a nuvem de mentira em memória (`tests/fakes`, com as mesmas regras em `nucleo/nuvem/regras.ts`) e, de ponta a ponta, um Supabase de mentira por HTTP (`tests/e2e/nuvem-falsa.ts`) para dois apps com pastas diferentes.

## 4.1. Testes

- Contrato (`tests/unit/nuvem-contrato.test.ts`): as mesmas situações contra a nuvem de mentira e contra o Supabase de verdade (`BURROLANDIA_NUVEM_AO_VIVO=1` com `SUPABASE_REF` e `SUPABASE_TOKEN`): regras de conflito, lápides, páginas, arquivos, e a RLS (outra conta e sem conta não leem nem mexem em nada). As contas de teste (`@burrolandia.test`) e os arquivos delas são apagados no fim.
- Sincronização (`tests/unit/nuvem-sincronizacao.test.ts`): dois e três aparelhos na mesma nuvem.
- Ponta a ponta (`tests/e2e/nuvem.spec.ts`): a posição vai de um aparelho para o outro e volta; remover num tira do outro; sair; senha errada.

## 4.2. Limites conhecidos

- Sem confirmação de e-mail e sem "esqueci a senha" até haver um SMTP próprio: qualquer um cria conta com qualquer e-mail, e quem esquece a senha perde o acesso à conta (os livros do computador continuam).
- O plano gratuito tem 1 GB de armazenamento para o projeto inteiro, e não há cota por pessoa ainda.
- As lápides ficam para sempre (sem nada pessoal: só o hash e a hora), para um aparelho que passou meses desligado não trazer de volta um livro removido.
- Conflitos usam as horas dos aparelhos: um relógio atrasado pode perder para uma mudança que, de fato, foi antes.
- Um livro aberto num aparelho e removido em outro sai da biblioteca na próxima sincronização, mesmo aberto (o leitor continua até fechar).

## 5. Fora desta entrega

O texto adaptado dos PDFs não sobe (cada aparelho converte); estantes, destaques e notas ficam para depois; login com Google e confirmação por e-mail esperam o SMTP próprio.
