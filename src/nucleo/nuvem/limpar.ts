// O que chega da nuvem passa por aqui antes de entrar no banco local. O banco da nuvem já confere
// quase tudo (supabase/migrations), mas o app não confia às cegas: um livro estranho é ignorado, e
// um campo estranho vira vazio.

import { RECONHECIMENTOS, type Edicao, type Identificadores, type Obra } from '../tipos'
import { validarLocator } from '../validacao'
import type { LivroNaNuvem } from './regras'

const HASH = /^[0-9a-f]{64}$/
const OBRA = /^OL\d{1,12}W$/
const EDICAO = /^OL\d{1,12}M$/
const CAPA = /^capa-[0-9a-f]{12}\.(?:jpg|png|webp|gif|svg)$/

const ehObjeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const texto = (x: unknown, limite: number) => (typeof x === 'string' && x.trim() ? x.slice(0, limite) : null)
const textos = (x: unknown, limite = 50, tamanho = 300) =>
  Array.isArray(x) ? x.filter((t): t is string => typeof t === 'string').slice(0, limite).map(t => t.slice(0, tamanho)) : []
const hora = (x: unknown) => (typeof x === 'string' && !Number.isNaN(Date.parse(x)) ? x : null)
const inteiro = (x: unknown) => (typeof x === 'number' && Number.isSafeInteger(x) && x >= 0 ? x : null)

function identificadores(x: unknown): Identificadores {
  return ehObjeto(x) ? { isbn: textos(x.isbn, 50, 20), outros: textos(x.outros, 50, 200) } : { isbn: [], outros: [] }
}

function obra(x: unknown): Obra | null {
  if (!ehObjeto(x) || typeof x.id !== 'string' || !OBRA.test(x.id)) return null
  return {
    id: x.id,
    titulo: texto(x.titulo, 1000) ?? '',
    autores: textos(x.autores),
    primeiroAno: inteiro(x.primeiroAno),
    edicoes: inteiro(x.edicoes) ?? 0,
    capaId: inteiro(x.capaId),
    assuntos: textos(x.assuntos, 30, 200),
    descricao: typeof x.descricao === 'string' ? x.descricao.slice(0, 20_000) : null,
  }
}

function edicao(x: unknown, obraId: string | null): Edicao | null {
  if (!ehObjeto(x) || typeof x.id !== 'string' || !EDICAO.test(x.id)) return null
  const daObra = typeof x.obraId === 'string' && OBRA.test(x.obraId) ? x.obraId : obraId
  if (!daObra) return null
  return {
    id: x.id,
    obraId: daObra,
    titulo: texto(x.titulo, 1000) ?? '',
    editoras: textos(x.editoras, 20, 200),
    publicadaEm: texto(x.publicadaEm, 60),
    ano: inteiro(x.ano),
    paginas: inteiro(x.paginas),
    idiomas: textos(x.idiomas, 20, 10),
    isbn: textos(x.isbn, 50, 20),
    capaId: inteiro(x.capaId),
  }
}

/** O livro da nuvem com cada campo conferido; null se nem o essencial (hash, formato, datas) vale. */
export function limparDaNuvem(x: LivroNaNuvem): LivroNaNuvem | null {
  const metadadosEm = hora(x.metadadosEm)
  const adicionadoEm = hora(x.adicionadoEm)
  if (!HASH.test(x.hash) || (x.formato !== 'epub' && x.formato !== 'pdf') || !metadadosEm || !adicionadoEm) return null
  if (typeof x.atualizadoEm !== 'string' || !x.atualizadoEm) return null
  const obraId = typeof x.obraId === 'string' && OBRA.test(x.obraId) ? x.obraId : null
  const posicao = validarLocator(x.posicao)
  return {
    hash: x.hash,
    titulo: texto(x.titulo, 1000) ?? 'Sem título',
    autores: textos(x.autores),
    idioma: texto(x.idioma, 35),
    formato: x.formato,
    tamanhoBytes: inteiro(x.tamanhoBytes) ?? 0,
    identificadores: identificadores(x.identificadores),
    obraId,
    edicaoId: typeof x.edicaoId === 'string' && EDICAO.test(x.edicaoId) ? x.edicaoId : null,
    reconhecimento: (RECONHECIMENTOS as readonly string[]).includes(x.reconhecimento) ? x.reconhecimento : 'pendente',
    obra: obra(x.obra),
    edicao: edicao(x.edicao, obraId),
    metadadosEm,
    capa: typeof x.capa === 'string' && CAPA.test(x.capa) ? x.capa : null,
    capaEm: hora(x.capaEm),
    arquivo: x.arquivo === `${x.hash}.${x.formato}` ? x.arquivo : null,
    posicao,
    progresso: typeof x.progresso === 'number' && x.progresso >= 0 && x.progresso <= 1 ? x.progresso : 0,
    posicaoEm: posicao ? hora(x.posicaoEm) : null,
    adicionadoEm,
    abertoEm: hora(x.abertoEm),
    removidoEm: hora(x.removidoEm),
    atualizadoEm: x.atualizadoEm,
  }
}
