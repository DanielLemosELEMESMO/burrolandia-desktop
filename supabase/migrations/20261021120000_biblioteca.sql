-- A biblioteca de cada pessoa na nuvem (parte 2). Cada livro é identificado pelo hash do arquivo:
-- o mesmo EPUB em dois aparelhos é o mesmo livro. A capa e o arquivo ficam em buckets privados, numa
-- pasta com o id da pessoa. Ninguém vê nem mexe no que é de outra pessoa (RLS em tudo).
--
-- Conflitos entre aparelhos, campo a campo, pela hora em que cada coisa mudou:
-- - posição de leitura: a mais recente vence (posicao_em);
-- - título, autores, obra e edição: a mudança mais recente vence (metadados_em);
-- - capa: a escolhida por último vence (capa_em); capa nula não apaga a que já está lá;
-- - arquivo: entra uma vez e fica;
-- - aberto_em: o mais recente.
-- Remover deixa uma lápide (removido_em), para os outros aparelhos removerem também. Um aparelho
-- atrasado não traz o livro de volta; um livro novo para a conta (importado de novo, ou de um
-- aparelho que acabou de entrar) traz.
-- As horas que vêm dos aparelhos passam no máximo 5 minutos da hora do servidor.

create table public.livros (
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  hash_sha256 text not null check (hash_sha256 ~ '^[0-9a-f]{64}$'),
  titulo text not null check (char_length(titulo) between 1 and 1000),
  autores jsonb not null default '[]'
    check (jsonb_typeof(autores) = 'array' and jsonb_array_length(autores) <= 50 and octet_length(autores::text) <= 8192),
  idioma text check (char_length(idioma) <= 35),
  formato_original text not null check (formato_original in ('epub', 'pdf')),
  tamanho_bytes bigint not null check (tamanho_bytes > 0),
  identificadores jsonb not null default '{"isbn": [], "outros": []}'
    check (jsonb_typeof(identificadores) = 'object' and octet_length(identificadores::text) <= 8192),
  obra_id text check (obra_id ~ '^OL[0-9]{1,12}W$'),
  edicao_id text check (edicao_id ~ '^OL[0-9]{1,12}M$'),
  reconhecimento text not null default 'pendente'
    check (reconhecimento in ('pendente', 'isbn', 'titulo', 'escolhido', 'sem-resultado', 'recusado')),
  -- A obra e a edição do Open Library como estavam no aparelho, para os outros não precisarem buscar.
  obra jsonb check (jsonb_typeof(obra) = 'object' and octet_length(obra::text) <= 65536),
  edicao jsonb check (jsonb_typeof(edicao) = 'object' and octet_length(edicao::text) <= 16384),
  metadados_em timestamptz not null,
  -- O nome do arquivo da capa no bucket "capas" (<usuario>/<hash>/<capa>), depois de enviada. O nome
  -- leva o começo do hash da imagem: quem baixa confere que recebeu a capa certa.
  capa text check (capa ~ '^capa-[0-9a-f]{12}\.(jpg|png|webp|gif|svg)$'),
  capa_em timestamptz,
  -- O nome do arquivo no bucket "arquivos" (<usuario>/<hash>.<formato>), depois de enviado.
  arquivo text check (arquivo = hash_sha256 || '.' || formato_original),
  posicao jsonb check (jsonb_typeof(posicao) = 'object' and octet_length(posicao::text) <= 16384),
  progresso double precision not null default 0 check (progresso between 0 and 1),
  posicao_em timestamptz,
  adicionado_em timestamptz not null,
  aberto_em timestamptz,
  removido_em timestamptz,
  -- A hora do servidor da última mudança: é por ela que cada aparelho pede o que mudou.
  atualizado_em timestamptz not null default now(),
  primary key (usuario_id, hash_sha256)
);

create index livros_por_mudanca on public.livros (usuario_id, atualizado_em, hash_sha256);

create function public.livros_marcar_mudanca() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger livros_marcar_mudanca before insert or update on public.livros
  for each row execute function public.livros_marcar_mudanca();

alter table public.livros enable row level security;
revoke all on public.livros from anon, authenticated;
grant select, insert, update on public.livros to authenticated;

create policy "livros: ver os seus" on public.livros for select to authenticated
  using ((select auth.uid()) = usuario_id);
create policy "livros: criar os seus" on public.livros for insert to authenticated
  with check ((select auth.uid()) = usuario_id);
create policy "livros: mudar os seus" on public.livros for update to authenticated
  using ((select auth.uid()) = usuario_id)
  with check ((select auth.uid()) = usuario_id);

-- Uma hora que veio de um aparelho, no máximo 5 minutos à frente da hora do servidor (um relógio
-- adiantado não ganha todas). Nula continua nula.
create function public.hora_do_aparelho(hora timestamptz) returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case when hora is null then null else least(hora, now() + interval '5 minutes') end;
$$;

-- Guarda vários livros de uma vez, com as regras de conflito acima. Devolve como cada um ficou.
create function public.guardar_livros(itens jsonb) returns setof public.livros
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  item record;
  atual public.livros;
  meta boolean;
  capa_nova boolean;
  posicao_nova boolean;
begin
  if uid is null then
    raise exception 'É preciso entrar na conta' using errcode = '42501';
  end if;
  if jsonb_typeof(itens) is distinct from 'array' or jsonb_array_length(itens) > 200 then
    raise exception 'Envie uma lista de até 200 livros' using errcode = '22023';
  end if;

  for item in
    select x.hash_sha256, x.titulo, coalesce(x.autores, '[]') as autores, x.idioma, x.formato_original,
      x.tamanho_bytes, coalesce(x.identificadores, '{"isbn": [], "outros": []}') as identificadores,
      x.obra_id, x.edicao_id, coalesce(x.reconhecimento, 'pendente') as reconhecimento, x.obra, x.edicao,
      public.hora_do_aparelho(x.metadados_em) as metadados_em, x.capa,
      public.hora_do_aparelho(x.capa_em) as capa_em, x.arquivo, x.posicao, coalesce(x.progresso, 0) as progresso,
      public.hora_do_aparelho(x.posicao_em) as posicao_em, public.hora_do_aparelho(x.adicionado_em) as adicionado_em,
      public.hora_do_aparelho(x.aberto_em) as aberto_em, coalesce(x.novo, false) as novo
    from jsonb_to_recordset(itens) as x(
      hash_sha256 text, titulo text, autores jsonb, idioma text, formato_original text, tamanho_bytes bigint,
      identificadores jsonb, obra_id text, edicao_id text, reconhecimento text, obra jsonb, edicao jsonb,
      metadados_em timestamptz, capa text, capa_em timestamptz, arquivo text, posicao jsonb, progresso double precision,
      posicao_em timestamptz, adicionado_em timestamptz, aberto_em timestamptz, novo boolean)
  loop
    insert into public.livros (usuario_id, hash_sha256, titulo, autores, idioma, formato_original, tamanho_bytes,
      identificadores, obra_id, edicao_id, reconhecimento, obra, edicao, metadados_em, capa, capa_em, arquivo,
      posicao, progresso, posicao_em, adicionado_em, aberto_em)
    values (uid, item.hash_sha256, item.titulo, item.autores, item.idioma, item.formato_original, item.tamanho_bytes,
      item.identificadores, item.obra_id, item.edicao_id, item.reconhecimento, item.obra, item.edicao,
      item.metadados_em, item.capa, case when item.capa is null then null else item.capa_em end, item.arquivo,
      item.posicao, item.progresso, item.posicao_em, item.adicionado_em, item.aberto_em)
    on conflict (usuario_id, hash_sha256) do nothing;
    if found then
      continue;
    end if;

    select * into atual from public.livros l
      where l.usuario_id = uid and l.hash_sha256 = item.hash_sha256
      for update;

    if atual.removido_em is not null then
      -- O aparelho já conhecia o livro na conta: está atrasado, e a lápide fica.
      if not item.novo then
        continue;
      end if;
      -- Livro novo para a conta (importado de novo, ou de um aparelho que acabou de entrar): vale o que chegou.
      update public.livros l set
        titulo = item.titulo, autores = item.autores, idioma = item.idioma, identificadores = item.identificadores,
        obra_id = item.obra_id, edicao_id = item.edicao_id, reconhecimento = item.reconhecimento,
        obra = item.obra, edicao = item.edicao, metadados_em = item.metadados_em,
        capa = item.capa, capa_em = case when item.capa is null then null else item.capa_em end,
        arquivo = item.arquivo, posicao = item.posicao, progresso = item.progresso, posicao_em = item.posicao_em,
        adicionado_em = item.adicionado_em, aberto_em = item.aberto_em, removido_em = null
      where l.usuario_id = uid and l.hash_sha256 = item.hash_sha256;
      continue;
    end if;

    meta := item.metadados_em > atual.metadados_em;
    capa_nova := item.capa is not null and item.capa_em is not null
      and (atual.capa_em is null or item.capa_em > atual.capa_em);
    posicao_nova := item.posicao is not null and item.posicao_em is not null
      and (atual.posicao_em is null or item.posicao_em > atual.posicao_em);

    update public.livros l set
      titulo = case when meta then item.titulo else l.titulo end,
      autores = case when meta then item.autores else l.autores end,
      idioma = case when meta then item.idioma else l.idioma end,
      identificadores = case when meta then item.identificadores else l.identificadores end,
      obra_id = case when meta then item.obra_id else l.obra_id end,
      edicao_id = case when meta then item.edicao_id else l.edicao_id end,
      reconhecimento = case when meta then item.reconhecimento else l.reconhecimento end,
      obra = case when meta then item.obra else l.obra end,
      edicao = case when meta then item.edicao else l.edicao end,
      metadados_em = case when meta then item.metadados_em else l.metadados_em end,
      capa = case when capa_nova then item.capa else l.capa end,
      capa_em = case when capa_nova then item.capa_em else l.capa_em end,
      arquivo = coalesce(l.arquivo, item.arquivo),
      posicao = case when posicao_nova then item.posicao else l.posicao end,
      progresso = case when posicao_nova then item.progresso else l.progresso end,
      posicao_em = case when posicao_nova then item.posicao_em else l.posicao_em end,
      aberto_em = greatest(l.aberto_em, item.aberto_em)
    where l.usuario_id = uid and l.hash_sha256 = item.hash_sha256;
  end loop;

  return query
    select l.* from public.livros l
    where l.usuario_id = uid
      and l.hash_sha256 in (select x.hash_sha256 from jsonb_to_recordset(itens) as x(hash_sha256 text));
end;
$$;

-- Põe a lápide nos livros removidos num aparelho e apaga o que era pessoal (posição, obra, capa).
-- Um livro adicionado de novo depois da hora da remoção fica.
create function public.remover_livros(itens jsonb) returns setof public.livros
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  item record;
begin
  if uid is null then
    raise exception 'É preciso entrar na conta' using errcode = '42501';
  end if;
  if jsonb_typeof(itens) is distinct from 'array' or jsonb_array_length(itens) > 200 then
    raise exception 'Envie uma lista de até 200 livros' using errcode = '22023';
  end if;

  for item in
    select x.hash_sha256, public.hora_do_aparelho(x.removido_em) as removido_em
    from jsonb_to_recordset(itens) as x(hash_sha256 text, removido_em timestamptz)
  loop
    update public.livros l set
      removido_em = item.removido_em, titulo = '(removido)', autores = '[]', idioma = null,
      identificadores = '{"isbn": [], "outros": []}', obra_id = null, edicao_id = null,
      reconhecimento = 'pendente', obra = null, edicao = null, capa = null, capa_em = null, arquivo = null,
      posicao = null, progresso = 0, posicao_em = null, aberto_em = null
    where l.usuario_id = uid and l.hash_sha256 = item.hash_sha256
      and l.removido_em is null and l.adicionado_em < item.removido_em;
  end loop;

  return query
    select l.* from public.livros l
    where l.usuario_id = uid
      and l.hash_sha256 in (select x.hash_sha256 from jsonb_to_recordset(itens) as x(hash_sha256 text));
end;
$$;

-- O que mudou desde uma hora do servidor, em ordem, de página em página: (desde, depois_de) é o
-- último livro da página anterior. Sem desde, tudo.
create function public.livros_desde(desde timestamptz default null, depois_de text default null, limite integer default 500)
returns setof public.livros
language sql
stable
security invoker
set search_path = ''
as $$
  select l.* from public.livros l
  where l.usuario_id = (select auth.uid())
    and (desde is null or (l.atualizado_em, l.hash_sha256) > (desde, coalesce(depois_de, '')))
  order by l.atualizado_em, l.hash_sha256
  limit least(greatest(coalesce(limite, 500), 1), 1000);
$$;

-- Quanto a pessoa guarda na nuvem.
create function public.uso_da_nuvem() returns json
language sql
stable
security invoker
set search_path = ''
as $$
  select json_build_object(
    'livros', (select count(*) from public.livros l where l.usuario_id = (select auth.uid()) and l.removido_em is null),
    'arquivos', (select count(*) from public.livros l
      where l.usuario_id = (select auth.uid()) and l.removido_em is null and l.arquivo is not null),
    'bytes', (select coalesce(sum((o.metadata ->> 'size')::bigint), 0) from storage.objects o
      where o.bucket_id in ('capas', 'arquivos') and (storage.foldername(o.name))[1] = (select auth.uid())::text)
  );
$$;

revoke all on function public.guardar_livros(jsonb), public.remover_livros(jsonb),
  public.livros_desde(timestamptz, text, integer), public.uso_da_nuvem(), public.livros_marcar_mudanca(),
  public.hora_do_aparelho(timestamptz)
  from public, anon;
grant execute on function public.guardar_livros(jsonb), public.remover_livros(jsonb),
  public.livros_desde(timestamptz, text, integer), public.uso_da_nuvem(), public.hora_do_aparelho(timestamptz)
  to authenticated;

-- Os buckets: privados, com tamanho e tipo limitados. O plano gratuito aceita até 50 MB por arquivo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('capas', 'capas', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']),
  ('arquivos', 'arquivos', false, 52428800, array['application/epub+zip', 'application/pdf'])
on conflict (id) do nothing;

-- Cada pessoa só lê e escreve na própria pasta, e só com os nomes que o app usa:
-- capas/<usuario>/<hash do livro>/capa-<hash da imagem>.<tipo> e arquivos/<usuario>/<hash>.<epub|pdf>.
create function public.caminho_da_nuvem_valido(bucket text, nome text) returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select (select auth.uid()) is not null and case bucket
    when 'capas' then nome ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{64}/capa-[0-9a-f]{12}\.(jpg|png|webp|gif|svg)$')
    when 'arquivos' then nome ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{64}\.(epub|pdf)$')
    else false
  end;
$$;

revoke all on function public.caminho_da_nuvem_valido(text, text) from public, anon;
grant execute on function public.caminho_da_nuvem_valido(text, text) to authenticated;

create policy "nuvem: ver os seus arquivos" on storage.objects for select to authenticated
  using (bucket_id in ('capas', 'arquivos') and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "nuvem: enviar os seus arquivos" on storage.objects for insert to authenticated
  with check (public.caminho_da_nuvem_valido(bucket_id, name));
create policy "nuvem: substituir os seus arquivos" on storage.objects for update to authenticated
  using (bucket_id in ('capas', 'arquivos') and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (public.caminho_da_nuvem_valido(bucket_id, name));
create policy "nuvem: apagar os seus arquivos" on storage.objects for delete to authenticated
  using (bucket_id in ('capas', 'arquivos') and (storage.foldername(name))[1] = (select auth.uid())::text);
