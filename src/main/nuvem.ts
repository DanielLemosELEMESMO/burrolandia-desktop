// A sincronização com a nuvem (parte 2): sobe o que mudou neste aparelho e traz o que mudou nos
// outros. Cada livro é o hash do arquivo; os conflitos seguem @nucleo/nuvem/regras (lá) e
// @nucleo/nuvem/aparelho (aqui). Sem conta, nada sai do computador.
//
// Um ciclo: (1) traz o que mudou na nuvem desde a última vez; (2) manda as lápides e os livros
// mudados (com a capa, se ainda não subiu); (3) sobe os arquivos que faltam, um por vez, e avisa a
// nuvem. Sem conexão, para e tenta de novo daqui a pouco; com a sessão terminada, pede para entrar.

import { decidir } from '@nucleo/nuvem/aparelho'
import { limparDaNuvem } from '@nucleo/nuvem/limpar'
import type { LivroNaNuvem, LivroParaGuardar } from '@nucleo/nuvem/regras'
import { ErroDaConta, NaoEstaNaNuvem, SemConexaoComANuvem, SessaoTerminada, type Remoto } from '@nucleo/nuvem/remoto'
import {
  LIMITE_DO_ARQUIVO_NA_NUVEM,
  type AndamentoDoDownload,
  type CodigoDaConta,
  type Conta,
  type EstadoDaNuvem,
  type ResultadoDaConta,
  type ResultadoDoDownload,
} from '@nucleo/tipos'
import type { Banco, LivroSincronizavel } from './banco'
import { MENSAGENS_DE_ERRO, nomeDaCapaNaNuvem, type Biblioteca } from './biblioteca'

const TIPOS: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  epub: 'application/epub+zip',
  pdf: 'application/pdf',
}
const tipoDe = (nome: string) => TIPOS[nome.slice(nome.lastIndexOf('.') + 1)] ?? 'application/octet-stream'

/** Depois de uma mudança, espera um pouco para subir (várias mudanças juntas viram uma ida só). */
const ESPERA = 5_000
/** Com o app aberto, de quanto em quanto tempo ver o que mudou nos outros aparelhos. */
const INTERVALO = 5 * 60_000
/** Sem conexão, tenta de novo depois disso. */
const DE_NOVO = 60_000
/** Voltando para a janela depois disso, vê o que mudou. */
const VOLTANDO = 30_000
/** Cada leitura volta um pouco no tempo: mudanças gravadas fora de ordem na nuvem não se perdem. */
const VOLTA = 60_000
const LOTE = 100
const PAGINA = 500

const CONTA = 'nuvem:conta'
const MARCADOR = 'nuvem:marcador'
const ULTIMA_VEZ = 'nuvem:ultima-vez'

export const MENSAGENS_DA_CONTA: Record<CodigoDaConta, string> = {
  'senha-errada': 'E-mail ou senha não conferem.',
  'conta-existe': 'Este e-mail já tem conta. Entre com ele.',
  'senha-fraca': 'A senha precisa de pelo menos 8 caracteres e não pode ser das mais comuns.',
  'email-invalido': 'Confira o e-mail: ele não parece certo.',
  'muitas-tentativas': 'Muitas tentativas seguidas. Espere um pouco e tente de novo.',
  'sem-conexao': 'Sem conexão com a nuvem agora. Confira a internet e tente de novo.',
  falhou: 'Algo deu errado na nuvem. Tente de novo em instantes.',
}

const espera = (ms: number) => new Promise<void>(pronto => setTimeout(pronto, ms).unref?.())

/** O que o banco da nuvem aceita (os limites dele): um livro estranho não trava a fila dos outros. */
function caber(livro: LivroParaGuardar): LivroParaGuardar {
  return {
    ...livro,
    titulo: livro.titulo.slice(0, 1000) || 'Sem título',
    autores: livro.autores.slice(0, 50).map(a => a.slice(0, 150)),
    idioma: livro.idioma?.slice(0, 35) ?? null,
    obra: livro.obra && { ...livro.obra, descricao: livro.obra.descricao?.slice(0, 20_000) ?? null },
  }
}

export interface OpcoesDaNuvem {
  espera?: number
  intervalo?: number
  deNovo?: number
  /** O maior arquivo que sobe (nos testes, menor). */
  limiteDoArquivo?: number
}

export class Nuvem {
  #estado: EstadoDaNuvem
  /** Muda ao entrar, sair ou parar: um ciclo de antes para no meio. */
  #geracao = 0
  #rodando: Promise<void> | null = null
  #deNovo = false
  #recebendo: Promise<boolean> | null = null
  #mudouNoCiclo = false
  #agendada: ReturnType<typeof setTimeout> | null = null
  #retentativa: ReturnType<typeof setTimeout> | null = null
  #periodica: ReturnType<typeof setInterval> | null = null
  readonly #baixando = new Map<string, Promise<ResultadoDoDownload>>()
  readonly #tempos: Required<OpcoesDaNuvem>

  constructor(
    private readonly banco: Banco,
    private readonly biblioteca: Biblioteca,
    private readonly remoto: Remoto | null,
    private readonly aoMudar: (estado: EstadoDaNuvem, livrosMudaram: boolean) => void = () => {},
    {
      espera: aposMudanca = ESPERA,
      intervalo = INTERVALO,
      deNovo = DE_NOVO,
      limiteDoArquivo = LIMITE_DO_ARQUIVO_NA_NUVEM,
    }: OpcoesDaNuvem = {},
  ) {
    this.#tempos = { espera: aposMudanca, intervalo, deNovo, limiteDoArquivo }
    this.#estado = {
      disponivel: !!remoto,
      conta: null,
      sincronizando: false,
      ultimaVez: banco.lerPreferencia<string>(ULTIMA_VEZ) ?? null,
      problema: null,
      pendentes: 0,
      grandesDemais: 0,
    }
    remoto?.aoTerminarSessao(() => this.#sessaoTerminou())
  }

  estado(): EstadoDaNuvem {
    return {
      ...this.#estado,
      pendentes: this.#estado.conta ? this.banco.contarPendentes() : 0,
      grandesDemais: this.banco.contarGrandesDemais(this.#tempos.limiteDoArquivo),
    }
  }

  #avisar(livrosMudaram = false) {
    this.aoMudar(this.estado(), livrosMudaram)
  }

  /** Ao abrir o app: a conta da sessão guardada e a primeira sincronização. */
  async iniciar() {
    if (!this.remoto) return
    const conta = await this.remoto.conta().catch(() => null)
    const guardada = this.banco.lerPreferencia<Conta>(CONTA)
    // Havia conta e a sessão sumiu: o app pede para entrar de novo (os livros daqui ficam).
    this.#estado = { ...this.#estado, conta, problema: !conta && guardada ? 'sessao-terminada' : null }
    this.#avisar()
    if (!conta) return
    if (guardada && guardada.id !== conta.id) this.#esquecer()
    this.banco.salvarPreferencia(CONTA, conta)
    this.#comecarPeriodica()
    await this.sincronizar()
  }

  entrar(email: string, senha: string): Promise<ResultadoDaConta> {
    return this.#comecar(remoto => remoto.entrar(email, senha))
  }

  criarConta(email: string, senha: string): Promise<ResultadoDaConta> {
    return this.#comecar(remoto => remoto.criarConta(email, senha))
  }

  async #comecar(acao: (remoto: Remoto) => Promise<Conta>): Promise<ResultadoDaConta> {
    if (!this.remoto) return { ok: false, codigo: 'sem-conexao', mensagem: MENSAGENS_DA_CONTA['sem-conexao'] }
    let conta: Conta
    try {
      conta = await acao(this.remoto)
    } catch (erro) {
      const codigo: CodigoDaConta =
        erro instanceof ErroDaConta ? erro.codigo : erro instanceof SemConexaoComANuvem ? 'sem-conexao' : 'falhou'
      if (codigo === 'falhou') console.warn('A conta não abriu', erro)
      return { ok: false, codigo, mensagem: MENSAGENS_DA_CONTA[codigo] }
    }
    // Outra conta: o que este aparelho sabia da anterior não vale para esta.
    const anterior = this.banco.lerPreferencia<Conta>(CONTA)
    if (anterior && anterior.id !== conta.id) this.#esquecer()
    this.banco.salvarPreferencia(CONTA, conta)
    this.#geracao++
    this.#estado = { ...this.#estado, conta, problema: null }
    this.#avisar(true)
    this.#comecarPeriodica()
    void this.sincronizar()
    return { ok: true, estado: this.estado() }
  }

  /** Sai da conta neste aparelho. Os livros daqui ficam; os que só estavam na nuvem saem. */
  async sair() {
    this.#geracao++
    this.#pararTempos()
    await this.remoto?.sair().catch(erro => console.warn('Não deu para avisar a nuvem da saída', erro))
    this.#esquecer()
    this.banco.apagarPreferencia(CONTA)
    this.#estado = { ...this.#estado, conta: null, problema: null, sincronizando: false }
    this.#avisar(true)
  }

  /** O que este aparelho sabia da conta: livros só da nuvem, envios, marcador. */
  #esquecer() {
    this.banco.esquecerNuvem()
    this.banco.apagarPreferencia(MARCADOR)
    this.biblioteca.limparPastasOrfas().catch(erro => console.warn('Não deu para apagar as pastas dos livros da nuvem', erro))
  }

  #sessaoTerminou() {
    if (!this.#estado.conta) return
    this.#geracao++
    this.#pararTempos()
    this.#estado = { ...this.#estado, conta: null, problema: 'sessao-terminada', sincronizando: false }
    this.#avisar(true)
  }

  #comecarPeriodica() {
    this.#periodica ??= setInterval(() => void this.sincronizar(), this.#tempos.intervalo)
    this.#periodica.unref?.()
  }

  #pararTempos() {
    for (const tempo of [this.#agendada, this.#retentativa]) if (tempo) clearTimeout(tempo)
    if (this.#periodica) clearInterval(this.#periodica)
    this.#agendada = this.#retentativa = this.#periodica = null
  }

  /** Para tudo (o app está fechando). Termina quando o ciclo em andamento desistir. */
  parar(): Promise<void> {
    this.#geracao++
    this.#pararTempos()
    return this.#rodando?.catch(() => {}) ?? Promise.resolve()
  }

  /** Uma mudança aqui: sobe daqui a pouco (mudanças seguidas viram uma ida só). */
  agendar() {
    if (!this.#estado.conta) return
    if (this.#agendada) clearTimeout(this.#agendada)
    this.#agendada = setTimeout(() => {
      this.#agendada = null
      void this.sincronizar()
    }, this.#tempos.espera)
    this.#agendada.unref?.()
  }

  /** Voltou para a janela: se faz tempo, vê o que mudou nos outros aparelhos. */
  aoVoltar() {
    const ultima = this.#estado.ultimaVez ? Date.parse(this.#estado.ultimaVez) : 0
    if (this.#estado.conta && Date.now() - ultima > VOLTANDO) void this.sincronizar()
  }

  /** Antes de abrir um livro: traz a posição mais nova da nuvem, esperando no máximo `limite`. */
  async atualizarAntesDeAbrir(limite = 2000) {
    if (!this.remoto || !this.#estado.conta) return
    await Promise.race([this.#receber(this.#geracao).catch(() => false), espera(limite)])
  }

  /** O app vai fechar: sobe o que estiver pendente, esperando no máximo `limite`. */
  async enviarAntesDeSair(limite = 3000) {
    if (!this.#estado.conta || !this.banco.contarPendentes()) return
    await Promise.race([this.sincronizar(), espera(limite)])
  }

  /** Um ciclo agora; chamado durante outro, roda mais um depois dele. */
  sincronizar(): Promise<void> {
    if (!this.remoto || !this.#estado.conta) return Promise.resolve()
    if (this.#rodando) {
      this.#deNovo = true
      return this.#rodando
    }
    this.#rodando = (async () => {
      this.#estado.sincronizando = true
      this.#mudouNoCiclo = false
      this.#avisar()
      try {
        do {
          this.#deNovo = false
          await this.#ciclo(this.#geracao)
        } while (this.#deNovo && this.#estado.conta)
      } finally {
        this.#estado.sincronizando = false
        this.#rodando = null
        this.#avisar(this.#mudouNoCiclo)
      }
    })()
    return this.#rodando
  }

  async #ciclo(geracao: number) {
    try {
      await this.#receber(geracao)
      await this.#enviarLapides(geracao)
      await this.#enviarLivros(geracao)
      await this.#enviarArquivos(geracao)
      await this.#enviarLivros(geracao)
      if (geracao !== this.#geracao) return
      const agora = new Date().toISOString()
      this.banco.salvarPreferencia(ULTIMA_VEZ, agora)
      this.#estado = { ...this.#estado, ultimaVez: agora, problema: null }
    } catch (erro) {
      if (geracao !== this.#geracao) return
      if (erro instanceof SessaoTerminada) return this.#sessaoTerminou()
      if (erro instanceof SemConexaoComANuvem) {
        this.#estado.problema = 'sem-conexao'
        this.#tentarDeNovo()
        return
      }
      console.warn('A sincronização falhou', erro)
      this.#estado.problema = 'falhou'
      this.#tentarDeNovo()
    }
  }

  #tentarDeNovo() {
    this.#retentativa ??= setTimeout(() => {
      this.#retentativa = null
      void this.sincronizar()
    }, this.#tempos.deNovo)
    this.#retentativa.unref?.()
  }

  /** Traz o que mudou na nuvem (um pedido por vez). Devolve se algo mudou aqui. */
  #receber(geracao: number): Promise<boolean> {
    this.#recebendo ??= this.#lerMudancas(geracao).finally(() => {
      this.#recebendo = null
    })
    return this.#recebendo
  }

  async #lerMudancas(geracao: number): Promise<boolean> {
    const marcador = this.banco.lerPreferencia<{ desde: string; hash: string }>(MARCADOR)
    let desde = marcador ? new Date(Date.parse(marcador.desde) - VOLTA).toISOString() : null
    let depoisDe: string | null = null
    let ultimo: { desde: string; hash: string } | null = null
    let mudou = false
    for (let pagina = 0; pagina < 1000; pagina++) {
      const lote = await this.remoto!.mudancas(desde, depoisDe, PAGINA)
      if (geracao !== this.#geracao) return false
      for (const bruto of lote) {
        const livro = limparDaNuvem(bruto)
        if (livro && (await this.#aplicar(livro))) mudou = true
      }
      const fim = lote.at(-1)
      if (fim) {
        desde = fim.atualizadoEm
        depoisDe = fim.hash
        ultimo = { desde: fim.atualizadoEm, hash: fim.hash }
      }
      if (lote.length < PAGINA) break
    }
    if (ultimo) this.banco.salvarPreferencia(MARCADOR, ultimo)
    if (mudou) {
      this.#mudouNoCiclo = true
      this.#avisar(true)
    }
    return mudou
  }

  /** Um livro que veio da nuvem entra aqui. Devolve se algo mudou na biblioteca. */
  async #aplicar(remoto: LivroNaNuvem): Promise<boolean> {
    const local = this.banco.porHashParaSincronia(remoto.hash)
    const decisao = decidir(local, remoto, this.banco.temLapide(remoto.hash))
    switch (decisao.tipo) {
      case 'ignorar':
        return false
      case 'remover':
        await this.biblioteca.remover(local!.id, { daNuvem: true })
        return true
      case 'criar': {
        const livro = await this.biblioteca.criarDaNuvem(remoto)
        this.#guardarObra(remoto)
        if (remoto.capa) await this.#baixarCapa(livro.id, remoto)
        return true
      }
      case 'atualizar': {
        if (decisao.metadados) this.#guardarObra(remoto)
        const mudou = this.banco.aplicarDaNuvem(local!.id, remoto, decisao)
        const capa = decisao.capa === 'baixar' && (await this.#baixarCapa(local!.id, remoto))
        return mudou || capa
      }
    }
  }

  #guardarObra(remoto: LivroNaNuvem) {
    if (remoto.obra) this.banco.salvarObra(remoto.obra)
    if (remoto.edicao) this.banco.salvarEdicao(remoto.edicao)
  }

  async #baixarCapa(id: string, remoto: LivroNaNuvem): Promise<boolean> {
    try {
      const bytes = await this.remoto!.baixar('capas', `${remoto.hash}/${remoto.capa}`)
      return await this.biblioteca.guardarCapaDaNuvem(id, remoto.capa!, bytes, remoto.capaEm)
    } catch (erro) {
      // Sem a imagem na nuvem, a capa daqui fica; da próxima vez que o livro mudar, tenta de novo.
      if (erro instanceof NaoEstaNaNuvem) return false
      throw erro
    }
  }

  async #enviarLapides(geracao: number) {
    for (let vez = 0; vez < 100; vez++) {
      const lapides = this.banco.lapides().slice(0, LOTE)
      if (!lapides.length || geracao !== this.#geracao) return
      const resultado = await this.remoto!.remover(lapides)
      if (geracao !== this.#geracao) return
      this.banco.esquecerLapides(lapides.map(l => l.hash))
      for (const lapide of lapides) {
        const ficou = resultado.find(l => l.hash === lapide.hash)
        // Adicionado de novo em outro aparelho depois da remoção daqui: ele volta.
        const vivo = ficou && !ficou.removidoEm ? limparDaNuvem(ficou) : null
        if (vivo) {
          if (await this.#aplicar(vivo)) this.#mudouNoCiclo = true
          continue
        }
        // A capa e o arquivo saem da nuvem junto (o banco de lá não alcança o armazenamento).
        const capas = await this.remoto!.listar('capas', lapide.hash)
        await this.remoto!.apagar('capas', capas.map(nome => `${lapide.hash}/${nome}`))
        await this.remoto!.apagar('arquivos', [`${lapide.hash}.epub`, `${lapide.hash}.pdf`])
      }
    }
  }

  async #enviarLivros(geracao: number) {
    for (let vez = 0; vez < 50; vez++) {
      const pendentes = this.banco.pendentesDeEnvio(LOTE)
      if (!pendentes.length || geracao !== this.#geracao) return
      const capasNovas = new Set<string>()
      for (const livro of pendentes) if (await this.#subirCapa(livro)) capasNovas.add(livro.hashSha256)
      const lidos = pendentes.flatMap(l => this.banco.paraSincronia(l.id) ?? [])
      const resultado = await this.#guardar(lidos)
      if (geracao !== this.#geracao) return
      for (const livro of lidos) this.banco.marcarEnviado(livro.id, livro.versao)
      for (const bruto of resultado) {
        const livro = limparDaNuvem(bruto)
        if (!livro) continue
        if (await this.#aplicar(livro)) this.#mudouNoCiclo = true
        // Capas que não valem mais (a anterior, ou a daqui que perdeu para uma mais nova) saem.
        if (capasNovas.has(livro.hash)) await this.#limparCapas(livro)
      }
      if (pendentes.length < LOTE) return
    }
  }

  /** Guarda o lote. Se a nuvem recusar, um por um: um livro estranho não segura os outros na fila. */
  async #guardar(livros: LivroSincronizavel[]): Promise<LivroNaNuvem[]> {
    try {
      return await this.remoto!.guardar(livros.map(l => caber(this.#paraGuardar(l))))
    } catch (erro) {
      if (erro instanceof SemConexaoComANuvem || erro instanceof SessaoTerminada) throw erro
      if (livros.length > 1) {
        const resultado: LivroNaNuvem[] = []
        for (const livro of livros) resultado.push(...(await this.#guardar([livro])))
        return resultado
      }
      console.warn('A nuvem recusou um livro; ele fica só neste aparelho até mudar de novo', livros[0].hashSha256, erro)
      return []
    }
  }

  #paraGuardar(l: LivroSincronizavel): LivroParaGuardar {
    const capaNaNuvem = !!l.capa && l.capa === l.capaNaNuvem
    return {
      hash: l.hashSha256,
      titulo: l.titulo,
      autores: l.autores,
      idioma: l.idioma,
      formato: l.formatoOriginal,
      tamanhoBytes: l.tamanhoBytes,
      identificadores: l.identificadores,
      obraId: l.obraId,
      edicaoId: l.edicaoId,
      reconhecimento: l.reconhecimento,
      obra: l.obraId ? this.banco.obterObra(l.obraId) : null,
      edicao: l.edicaoId ? this.banco.obterEdicao(l.edicaoId) : null,
      metadadosEm: l.metadadosEm || l.atualizadoEm,
      capa: capaNaNuvem ? l.capa : null,
      capaEm: capaNaNuvem ? l.capaEm : null,
      arquivo: l.arquivoNaNuvem,
      posicao: l.posicao,
      progresso: l.progresso,
      posicaoEm: l.posicao ? l.posicaoEm : null,
      adicionadoEm: l.adicionadoEm,
      abertoEm: l.abertoEm,
      novo: l.versaoEnviada === 0,
    }
  }

  /** Sobe a capa do livro, se a daqui ainda não está na nuvem. */
  async #subirCapa(livro: LivroSincronizavel): Promise<boolean> {
    if (!livro.capa || livro.capa === livro.capaNaNuvem) return false
    const bytes = await this.biblioteca.lerCapa(livro.id)
    const nome = bytes && nomeDaCapaNaNuvem(bytes)
    if (!bytes || !nome) return false
    await this.remoto!.enviar('capas', `${livro.hashSha256}/${nome}`, bytes, tipoDe(nome))
    await this.biblioteca.marcarCapaNaNuvem(livro.id, nome, bytes)
    return true
  }

  async #limparCapas(livro: LivroNaNuvem) {
    if (!livro.capa) return
    const sobras = (await this.remoto!.listar('capas', livro.hash)).filter(nome => nome !== livro.capa)
    if (sobras.length) await this.remoto!.apagar('capas', sobras.map(nome => `${livro.hash}/${nome}`))
  }

  async #enviarArquivos(geracao: number) {
    for (const livro of this.banco.semArquivoNaNuvem(this.#tempos.limiteDoArquivo)) {
      if (geracao !== this.#geracao) return
      const bytes = await this.biblioteca.lerOriginal(livro.id)
      if (!bytes) continue
      const nome = `${livro.hashSha256}.${livro.formatoOriginal}`
      await this.remoto!.enviar('arquivos', nome, bytes, tipoDe(nome))
      if (geracao !== this.#geracao) return
      this.banco.marcarArquivoNaNuvem(livro.id, nome)
    }
  }

  /** Baixa o arquivo de um livro que está só na nuvem e prepara para ler. Dois pedidos viram um. */
  baixar(id: string, aoAndamento?: (andamento: AndamentoDoDownload) => void): Promise<ResultadoDoDownload> {
    const andamento = this.#baixando.get(id)
    if (andamento) return andamento
    const tarefa = this.#baixar(id, aoAndamento).finally(() => this.#baixando.delete(id))
    this.#baixando.set(id, tarefa)
    return tarefa
  }

  async #baixar(id: string, aoAndamento?: (andamento: AndamentoDoDownload) => void): Promise<ResultadoDoDownload> {
    const livro = this.banco.paraSincronia(id)
    if (!livro) return { ok: false, mensagem: 'Este livro não está mais na biblioteca.' }
    if (livro.estado !== 'na-nuvem') return { ok: true, livro }
    if (!this.remoto || !this.#estado.conta) return { ok: false, mensagem: 'Entre na sua conta para baixar este livro.' }
    if (!livro.arquivoNaNuvem) {
      return {
        ok: false,
        mensagem:
          'O arquivo deste livro ainda não subiu do aparelho onde ele foi adicionado. Abra o app lá, com internet, e ele sobe sozinho.',
      }
    }
    try {
      aoAndamento?.({ etapa: 'baixando' })
      const bytes = await this.remoto.baixar('arquivos', livro.arquivoNaNuvem)
      const pronto = await this.biblioteca.completarDaNuvem(id, bytes, a => {
        if (a.etapa !== 'lendo') aoAndamento?.({ etapa: a.etapa, atual: a.atual, total: a.total })
      })
      if ('erro' in pronto) {
        return {
          ok: false,
          mensagem:
            pronto.erro === 'arquivo-invalido'
              ? 'O arquivo que veio da nuvem não confere com este livro. Tente de novo.'
              : MENSAGENS_DE_ERRO[pronto.erro],
        }
      }
      this.#avisar(true)
      return { ok: true, livro: pronto.livro }
    } catch (erro) {
      if (erro instanceof SemConexaoComANuvem) return { ok: false, mensagem: MENSAGENS_DA_CONTA['sem-conexao'] }
      if (erro instanceof NaoEstaNaNuvem) return { ok: false, mensagem: 'O arquivo deste livro não está mais na nuvem.' }
      if (erro instanceof SessaoTerminada) {
        this.#sessaoTerminou()
        return { ok: false, mensagem: 'Sua sessão terminou. Entre de novo na sua conta para baixar este livro.' }
      }
      console.warn('Não deu para baixar o livro', erro)
      return { ok: false, mensagem: 'Algo deu errado ao baixar o livro. Tente de novo.' }
    }
  }
}
