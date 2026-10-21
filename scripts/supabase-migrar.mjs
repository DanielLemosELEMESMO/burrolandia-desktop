// Aplica no projeto do Supabase as migrações de supabase/migrations que ainda não foram aplicadas,
// pelo Management API. Cada uma roda numa transação e fica registrada em
// supabase_migrations.schema_migrations (a mesma tabela do `supabase db push` da CLI).
//
// Uso: SUPABASE_REF=<id do projeto> SUPABASE_TOKEN=<token de acesso> node scripts/supabase-migrar.mjs
// O token é pessoal (Account → Access Tokens no painel do Supabase) e nunca entra no repositório.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const { SUPABASE_REF: ref, SUPABASE_TOKEN: token } = process.env
if (!ref || !token) {
  console.error('Defina SUPABASE_REF e SUPABASE_TOKEN.')
  process.exit(1)
}

const pasta = join(import.meta.dirname, '../supabase/migrations')

async function consulta(sql) {
  const resposta = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  if (!resposta.ok) throw new Error(`O Supabase respondeu ${resposta.status}: ${await resposta.text()}`)
  return resposta.json()
}

/** Um texto como literal do Postgres, entre $marca$ que não aparece no texto. */
function literal(texto) {
  let marca = 'migracao'
  while (texto.includes(`$${marca}$`)) marca += '_'
  return `$${marca}$${texto}$${marca}$`
}

await consulta(`create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text not null primary key, statements text[], name text);`)
const aplicadas = new Set((await consulta('select version from supabase_migrations.schema_migrations')).map(l => l.version))

let novas = 0
for (const arquivo of readdirSync(pasta).sort()) {
  const partes = arquivo.match(/^(\d{14})_([a-z0-9_]+)\.sql$/)
  if (!partes || aplicadas.has(partes[1])) continue
  const [, versao, nome] = partes
  const sql = readFileSync(join(pasta, arquivo), 'utf8')
  await consulta(`begin;
${sql}
;
insert into supabase_migrations.schema_migrations (version, name, statements) values ('${versao}', '${nome}', array[${literal(sql)}]);
commit;`)
  console.log(`Aplicada: ${arquivo}`)
  novas++
}
console.log(novas ? `${novas} migração(ões) aplicada(s).` : 'Nada a aplicar: o banco já está em dia.')
