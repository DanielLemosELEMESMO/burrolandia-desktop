-- Revisão da parte 2.
-- 1. As horas dos aparelhos passam no máximo 5 minutos da hora do servidor também numa escrita direta
--    na tabela (antes, só pelas funções): um cliente com o relógio errado não trava a posição de um livro.
-- 2. Um livro que volta como novo para a conta (importado de novo, ou de um aparelho que acabou de
--    entrar) enquanto ainda está vivo passa a contar como adicionado na hora dele: a remoção atrasada
--    de outro aparelho, feita antes disso, não o tira.
-- 3. Quanto cada conta pode guardar no storage: o app não sobe arquivos além disso.

create or replace function public.livros_marcar_mudanca() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.metadados_em := public.hora_do_aparelho(new.metadados_em);
  new.capa_em := public.hora_do_aparelho(new.capa_em);
  new.posicao_em := public.hora_do_aparelho(new.posicao_em);
  new.adicionado_em := public.hora_do_aparelho(new.adicionado_em);
  new.aberto_em := public.hora_do_aparelho(new.aberto_em);
  new.removido_em := public.hora_do_aparelho(new.removido_em);
  new.atualizado_em := now();
  return new;
end;
$$;

create or replace function public.guardar_livros(itens jsonb) returns setof public.livros
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
      -- Adicionado de novo (novo para a conta) com o livro ainda vivo: conta a hora mais recente.
      adicionado_em = case when item.novo then greatest(l.adicionado_em, item.adicionado_em) else l.adicionado_em end,
      aberto_em = greatest(l.aberto_em, item.aberto_em)
    where l.usuario_id = uid and l.hash_sha256 = item.hash_sha256;
  end loop;

  return query
    select l.* from public.livros l
    where l.usuario_id = uid
      and l.hash_sha256 in (select x.hash_sha256 from jsonb_to_recordset(itens) as x(hash_sha256 text));
end;
$$;

-- Quanto a pessoa guarda na nuvem, e quanto pode guardar (o plano gratuito tem 1 GB para o projeto
-- inteiro; mudar o limite é mudar o número aqui).
create or replace function public.uso_da_nuvem() returns json
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
      where o.bucket_id in ('capas', 'arquivos') and (storage.foldername(o.name))[1] = (select auth.uid())::text),
    'limite', 838860800
  );
$$;

revoke all on function public.guardar_livros(jsonb), public.uso_da_nuvem(), public.livros_marcar_mudanca() from public, anon;
grant execute on function public.guardar_livros(jsonb), public.uso_da_nuvem() to authenticated;
