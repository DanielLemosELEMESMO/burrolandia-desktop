// A sua conta: o botão no alto das telas e o diálogo "Sua conta" (entrar, criar a conta, ver como
// está a nuvem, sincronizar agora, sair). A senha vai direto para o processo principal e para o
// Supabase; a tela não guarda nada.

import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { haQuantoTempo } from '@nucleo/tempo'
import type { EstadoDaNuvem, UsoDaNuvem } from '@nucleo/tipos'
import { api } from '../api'
import { Dialogo } from './Dialogo'
import { Icone } from './Icone'

const megabytes = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0).replace('.', ',')} MB`

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/** Como está a nuvem, numa frase. */
export function situacao(estado: EstadoDaNuvem): string {
  if (estado.sincronizando) return 'Sincronizando…'
  if (estado.problema === 'sem-conexao') {
    const esperando = estado.pendentes ? ` ${plural(estado.pendentes, 'mudança espera', 'mudanças esperam')} para subir.` : ''
    return `Sem conexão com a nuvem: tento de novo daqui a pouco.${esperando}`
  }
  if (estado.problema === 'falhou') return 'A última sincronização não deu certo; tento de novo daqui a pouco.'
  if (estado.ultimaVez) return `Tudo sincronizado · ${haQuantoTempo(estado.ultimaVez)}`
  return 'Ainda não sincronizado.'
}

/** O botão da conta no alto das telas: "Entrar", ou a inicial do e-mail com um sinal de como está. */
export function BotaoDaConta({ estado, aoAbrir }: { estado: EstadoDaNuvem | null; aoAbrir: () => void }) {
  if (!estado?.disponivel) return null
  if (!estado.conta) {
    const deNovo = estado.problema === 'sessao-terminada'
    return (
      <button type="button" className="botao-conta botao-conta-entrar" onClick={aoAbrir}>
        <Icone nome="nuvem" />
        {deNovo ? 'Entrar de novo' : 'Entrar'}
        {deNovo && <span className="botao-conta-sinal botao-conta-sinal-problema" aria-hidden="true" />}
      </button>
    )
  }
  const sinal = estado.sincronizando ? 'sincronizando' : estado.problema ? 'problema' : 'ok'
  return (
    <button
      type="button"
      className="botao-conta"
      aria-label={`Sua conta: ${estado.conta.email}. ${situacao(estado)}`}
      title={`${estado.conta.email} · ${situacao(estado)}`}
      onClick={aoAbrir}
    >
      <span className="botao-conta-inicial" aria-hidden="true">
        {estado.conta.email.slice(0, 1).toUpperCase()}
      </span>
      <span className={`botao-conta-sinal botao-conta-sinal-${sinal}`} aria-hidden="true" />
    </button>
  )
}

function Entrar({ estado }: { estado: EstadoDaNuvem }) {
  const [modo, setModo] = useState<'entrar' | 'criar'>('entrar')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const idDaDica = useId()
  const idDoErro = useId()
  const campoDoEmail = useRef<HTMLInputElement>(null)
  const descricaoDaSenha = [modo === 'criar' ? idDaDica : null, erro ? idDoErro : null].filter(Boolean).join(' ') || undefined

  useEffect(() => campoDoEmail.current?.focus(), [])

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault()
    if (enviando) return
    setEnviando(true)
    setErro(null)
    try {
      const resultado = modo === 'entrar' ? await api.nuvem.entrar(email, senha) : await api.nuvem.criarConta(email, senha)
      // Entrou: o estado novo chega pela nuvem (nuvem:mudou) e o diálogo mostra a conta.
      if (!resultado.ok) setErro(resultado.mensagem)
    } catch (falha) {
      console.warn('A conta não abriu', falha)
      setErro('Algo deu errado. Tente de novo em instantes.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form className="conta-form" onSubmit={evento => void enviar(evento)}>
      {estado.problema === 'sessao-terminada' ? (
        <p className="conta-aviso">
          <Icone nome="aviso" />
          Sua sessão terminou (você saiu em outro lugar ou trocou a senha). Entre de novo: os livros deste computador
          continuam aqui.
        </p>
      ) : (
        <p>
          Com uma conta, seus livros, as capas e a página onde você parou vão com você para qualquer aparelho. Os arquivos
          ficam numa pasta só sua.
        </p>
      )}
      <div className="segmentos" role="radiogroup" aria-label="Você já tem conta?">
        {(
          [
            ['entrar', 'Já tenho conta'],
            ['criar', 'Criar conta'],
          ] as const
        ).map(([valor, rotulo]) => (
          <label key={valor} className="segmento">
            <input
              type="radio"
              name="modo-da-conta"
              checked={modo === valor}
              onChange={() => {
                setModo(valor)
                setErro(null)
              }}
            />
            <span>{rotulo}</span>
          </label>
        ))}
      </div>
      <label className="campo">
        <span>E-mail</span>
        <input
          ref={campoDoEmail}
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? idDoErro : undefined}
          value={email}
          onChange={evento => setEmail(evento.target.value)}
        />
      </label>
      <label className="campo">
        <span>Senha</span>
        <input
          type="password"
          autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
          required
          minLength={modo === 'criar' ? 8 : undefined}
          maxLength={72}
          aria-invalid={erro ? true : undefined}
          aria-describedby={descricaoDaSenha}
          value={senha}
          onChange={evento => setSenha(evento.target.value)}
        />
      </label>
      {modo === 'criar' && (
        <p id={idDaDica} className="dica">
          Pelo menos 8 caracteres. Por enquanto não há “esqueci a senha”: guarde-a bem.
        </p>
      )}
      {erro && (
        <p id={idDoErro} className="conta-erro" role="alert">
          {erro}
        </p>
      )}
      <div className="botoes">
        <button type="submit" className="botao principal" aria-disabled={enviando || undefined}>
          {enviando ? 'Um instante…' : modo === 'entrar' ? 'Entrar' : 'Criar conta'}
        </button>
      </div>
    </form>
  )
}

function DentroDaConta({ estado }: { estado: EstadoDaNuvem }) {
  const [uso, setUso] = useState<UsoDaNuvem | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [saindo, setSaindo] = useState(false)
  const idDaPergunta = useId()
  const linhaDoEmail = useRef<HTMLParagraphElement>(null)
  const botaoDeSair = useRef<HTMLButtonElement>(null)
  const botaoDeCancelar = useRef<HTMLButtonElement>(null)

  // Acabou de entrar (o formulário sumiu) ou abriu o diálogo: o foco vai para a conta, e o leitor de
  // tela diz em qual conta você está.
  useEffect(() => linhaDoEmail.current?.focus(), [])
  useEffect(() => {
    if (confirmando) botaoDeCancelar.current?.focus()
  }, [confirmando])

  const sair = () => {
    if (saindo) return
    setSaindo(true)
    void api.nuvem.sair().finally(() => setSaindo(false))
  }

  // O uso muda depois de cada sincronização.
  useEffect(() => {
    if (estado.sincronizando) return
    let ativo = true
    api.nuvem
      .uso()
      .then(atual => ativo && setUso(atual))
      .catch(() => {})
    return () => {
      ativo = false
    }
  }, [estado.sincronizando, estado.ultimaVez])

  return (
    <div className="conta-dentro">
      <p className="conta-email" ref={linhaDoEmail} tabIndex={-1}>
        <Icone nome="pessoa" />
        <span className="so-leitor-de-tela">Você está na conta </span>
        {estado.conta!.email}
      </p>
      <p className="conta-situacao" role="status">
        {situacao(estado)}
      </p>
      {uso && (
        <p className="dica">
          {plural(uso.livros, 'livro', 'livros')} na conta · {megabytes(uso.bytes)} guardados na nuvem
        </p>
      )}
      {estado.semEspaco > 0 && (
        <p className="dica">
          {plural(estado.semEspaco, 'livro ficou', 'livros ficaram')} só neste computador: a nuvem desta conta chegou ao
          limite{uso && Number.isFinite(uso.limite) ? ` de ${megabytes(uso.limite)}` : ''}. A posição de leitura sincroniza
          mesmo assim.
        </p>
      )}
      {estado.grandesDemais > 0 && (
        <p className="dica">
          {plural(estado.grandesDemais, 'livro ficou', 'livros ficaram')} só neste computador: o arquivo passa de 50 MB, o
          limite por arquivo da nuvem. A posição de leitura sincroniza mesmo assim.
        </p>
      )}
      {confirmando ? (
        <div className="conta-confirmar" role="group" aria-labelledby={idDaPergunta}>
          <p id={idDaPergunta} className="conta-pergunta">
            Sair da conta neste computador?
          </p>
          <p className="dica">
            Os livros que vieram da nuvem saem deste computador; os que você adicionou aqui ficam. Nos outros aparelhos,
            nada muda.
          </p>
          {estado.pendentes > 0 && (
            <p className="conta-aviso">
              <Icone nome="aviso" />
              {plural(estado.pendentes, 'mudança ainda não subiu', 'mudanças ainda não subiram')}. Saindo, o app tenta mandar
              antes; sem conexão, elas não chegam aos outros aparelhos.
            </p>
          )}
          <div className="botoes">
            <button type="button" className="botao principal" aria-disabled={saindo || undefined} onClick={sair}>
              {saindo ? 'Saindo…' : 'Sair'}
            </button>
            <button
              ref={botaoDeCancelar}
              type="button"
              className="botao"
              aria-disabled={saindo || undefined}
              onClick={() => {
                if (saindo) return
                setConfirmando(false)
                requestAnimationFrame(() => botaoDeSair.current?.focus())
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="botoes">
          <button
            type="button"
            className="botao"
            aria-disabled={estado.sincronizando || undefined}
            onClick={() => !estado.sincronizando && void api.nuvem.sincronizar()}
          >
            <Icone nome="sincronizar" />
            Sincronizar agora
          </button>
          <button ref={botaoDeSair} type="button" className="botao" onClick={() => setConfirmando(true)}>
            Sair da conta
          </button>
        </div>
      )}
    </div>
  )
}

export function DialogoDaConta({ aberto, estado, aoFechar }: { aberto: boolean; estado: EstadoDaNuvem | null; aoFechar: () => void }) {
  return (
    <Dialogo aberto={aberto && !!estado} titulo="Sua conta" aoFechar={aoFechar} comFechar>
      {aberto && estado && (estado.conta ? <DentroDaConta estado={estado} /> : <Entrar estado={estado} />)}
    </Dialogo>
  )
}
