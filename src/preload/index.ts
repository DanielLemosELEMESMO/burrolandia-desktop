import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { AndamentoDoDownload, AndamentoImportacao, EstadoDaNuvem, Locator } from '../nucleo/tipos'
import type { ApiBurrolandia } from './api'

const api: ApiBurrolandia = {
  biblioteca: {
    listar: () => ipcRenderer.invoke('biblioteca:listar'),
    adicionar: () => ipcRenderer.invoke('biblioteca:adicionar'),
    importar: caminho => ipcRenderer.invoke('biblioteca:importar', caminho),
    remover: id => ipcRenderer.invoke('biblioteca:remover', id),
    salvarCapa: (id, imagem, { escolhida = false } = {}) => ipcRenderer.invoke('biblioteca:salvar-capa', id, imagem, escolhida),
    imagens: id => ipcRenderer.invoke('biblioteca:imagens', id),
    caminhoDoArquivo: arquivo => webUtils.getPathForFile(arquivo),
    aoAndamento: quando => {
      const ouvinte = (_: unknown, andamento: AndamentoImportacao) => quando(andamento)
      ipcRenderer.on('importacao:andamento', ouvinte)
      return () => ipcRenderer.off('importacao:andamento', ouvinte)
    },
  },
  leitura: {
    abrir: id => ipcRenderer.invoke('leitura:abrir', id),
    fechar: () => ipcRenderer.invoke('leitura:fechar'),
    posicao: id => ipcRenderer.invoke('leitura:posicao', id),
    salvarPosicao: (id, posicao) => ipcRenderer.invoke('leitura:salvar-posicao', id, posicao),
    salvarPosicaoAgora: (id, posicao) => {
      ipcRenderer.sendSync('leitura:salvar-posicao-agora', id, posicao)
    },
    aoChegarPosicao: quando => {
      const ouvinte = (_: unknown, id: string, posicao: Locator) => quando(id, posicao)
      ipcRenderer.on('leitura:posicao-de-outro-aparelho', ouvinte)
      return () => ipcRenderer.off('leitura:posicao-de-outro-aparelho', ouvinte)
    },
  },
  preferencias: {
    ler: () => ipcRenderer.invoke('preferencias:ler'),
    salvar: parcial => ipcRenderer.invoke('preferencias:salvar', parcial),
  },
  sessao: {
    ler: () => ipcRenderer.invoke('sessao:ler'),
  },
  catalogo: {
    sobre: id => ipcRenderer.invoke('catalogo:sobre', id),
    reconhecer: id => ipcRenderer.invoke('catalogo:reconhecer', id),
    buscar: texto => ipcRenderer.invoke('catalogo:buscar', texto),
    edicoes: id => ipcRenderer.invoke('catalogo:edicoes', id),
    escolherObra: (id, obraId) => ipcRenderer.invoke('catalogo:escolher-obra', id, obraId),
    escolherEdicao: (id, edicaoId) => ipcRenderer.invoke('catalogo:escolher-edicao', id, edicaoId),
    nenhuma: id => ipcRenderer.invoke('catalogo:nenhuma', id),
    capa: id => ipcRenderer.invoke('catalogo:capa', id),
    capas: id => ipcRenderer.invoke('catalogo:capas', id),
    miniatura: capaId => ipcRenderer.invoke('catalogo:miniatura', capaId),
    usarCapa: (id, capaId) => ipcRenderer.invoke('catalogo:usar-capa', id, capaId),
    aoMudar: quando => {
      const ouvinte = (_: unknown, livroId: string) => quando(livroId)
      ipcRenderer.on('catalogo:mudou', ouvinte)
      return () => ipcRenderer.off('catalogo:mudou', ouvinte)
    },
  },
  nuvem: {
    estado: () => ipcRenderer.invoke('nuvem:estado'),
    entrar: (email, senha) => ipcRenderer.invoke('nuvem:entrar', email, senha),
    criarConta: (email, senha) => ipcRenderer.invoke('nuvem:criar-conta', email, senha),
    sair: () => ipcRenderer.invoke('nuvem:sair'),
    sincronizar: () => ipcRenderer.invoke('nuvem:sincronizar'),
    uso: () => ipcRenderer.invoke('nuvem:uso'),
    baixar: id => ipcRenderer.invoke('nuvem:baixar', id),
    aoMudar: quando => {
      const ouvinte = (_: unknown, estado: EstadoDaNuvem, livros: boolean) => quando(estado, livros)
      ipcRenderer.on('nuvem:mudou', ouvinte)
      return () => ipcRenderer.off('nuvem:mudou', ouvinte)
    },
    aoAndamento: quando => {
      const ouvinte = (_: unknown, id: string, andamento: AndamentoDoDownload) => quando(id, andamento)
      ipcRenderer.on('nuvem:andamento', ouvinte)
      return () => ipcRenderer.off('nuvem:andamento', ouvinte)
    },
  },
}

contextBridge.exposeInMainWorld('burrolandia', api)
