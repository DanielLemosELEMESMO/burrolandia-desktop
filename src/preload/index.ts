import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { AndamentoImportacao } from '../nucleo/tipos'
import type { ApiBurrolandia } from './api'

const api: ApiBurrolandia = {
  biblioteca: {
    listar: () => ipcRenderer.invoke('biblioteca:listar'),
    adicionar: () => ipcRenderer.invoke('biblioteca:adicionar'),
    importar: caminho => ipcRenderer.invoke('biblioteca:importar', caminho),
    remover: id => ipcRenderer.invoke('biblioteca:remover', id),
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
}

contextBridge.exposeInMainWorld('burrolandia', api)
