import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { AndamentoImportacao } from '../nucleo/tipos'
import type { ApiBurrolandia } from './api'

const api: ApiBurrolandia = {
  biblioteca: {
    listar: () => ipcRenderer.invoke('biblioteca:listar'),
    adicionar: () => ipcRenderer.invoke('biblioteca:adicionar'),
    importar: caminho => ipcRenderer.invoke('biblioteca:importar', caminho),
    remover: id => ipcRenderer.invoke('biblioteca:remover', id),
    salvarCapa: (id, imagem) => ipcRenderer.invoke('biblioteca:salvar-capa', id, imagem),
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
    salvarPosicao: (id, posicao) => ipcRenderer.invoke('leitura:salvar-posicao', id, posicao),
    salvarPosicaoAgora: (id, posicao) => {
      ipcRenderer.sendSync('leitura:salvar-posicao-agora', id, posicao)
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
    reconhecer: (id, deNovo) => ipcRenderer.invoke('catalogo:reconhecer', id, deNovo === true),
    buscar: texto => ipcRenderer.invoke('catalogo:buscar', texto),
    edicoes: id => ipcRenderer.invoke('catalogo:edicoes', id),
    escolherObra: (id, obraId) => ipcRenderer.invoke('catalogo:escolher-obra', id, obraId),
    escolherEdicao: (id, edicaoId) => ipcRenderer.invoke('catalogo:escolher-edicao', id, edicaoId),
    nenhuma: id => ipcRenderer.invoke('catalogo:nenhuma', id),
    capa: id => ipcRenderer.invoke('catalogo:capa', id),
    usarCapa: id => ipcRenderer.invoke('catalogo:usar-capa', id),
    aoMudar: quando => {
      const ouvinte = (_: unknown, livroId: string) => quando(livroId)
      ipcRenderer.on('catalogo:mudou', ouvinte)
      return () => ipcRenderer.off('catalogo:mudou', ouvinte)
    },
  },
}

contextBridge.exposeInMainWorld('burrolandia', api)
