// O painel Aa: os ajustes de leitura valem para o app inteiro e para todos os livros.

import { TAMANHO_MAXIMO, TAMANHO_MINIMO, type Preferencias } from '@nucleo/tipos'
import { Dialogo } from './Dialogo'

interface Opcao<V extends string> {
  valor: V
  rotulo: string
  amostra?: string
}

function Grupo<K extends keyof Preferencias>({
  legenda,
  chave,
  opcoes,
  preferencias,
  aoMudar,
  desativado,
  classe,
}: {
  legenda: string
  chave: K
  opcoes: Opcao<Extract<Preferencias[K], string>>[]
  preferencias: Preferencias
  aoMudar: (parcial: Partial<Preferencias>) => void
  desativado?: boolean
  classe?: string
}) {
  return (
    <fieldset className={`ajuste ${classe ?? ''}`} disabled={desativado}>
      <legend>{legenda}</legend>
      <div className="segmentos">
        {opcoes.map(opcao => (
          <label key={opcao.valor} className="segmento">
            <input
              type="radio"
              name={chave}
              value={opcao.valor}
              checked={preferencias[chave] === opcao.valor}
              onChange={() => aoMudar({ [chave]: opcao.valor } as Partial<Preferencias>)}
            />
            {opcao.amostra && <span className={`amostra amostra-${opcao.amostra}`} aria-hidden="true" />}
            <span>{opcao.rotulo}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export function AjustesLeitura({
  aberto,
  aoFechar,
  preferencias,
  aoMudar,
}: {
  aberto: boolean
  aoFechar: () => void
  preferencias: Preferencias
  aoMudar: (parcial: Partial<Preferencias>) => void
}) {
  const grupo = { preferencias, aoMudar }
  const tamanho = preferencias.tamanho

  return (
    <Dialogo aberto={aberto} titulo="Ajustes de leitura" aoFechar={aoFechar} variante="lateral-direita" comFechar>
      <div className="ajustes">
        <Grupo
          legenda="Tema"
          chave="tema"
          classe="ajuste-tema"
          opcoes={[
            { valor: 'automatico', rotulo: 'Automático', amostra: 'automatico' },
            { valor: 'papel', rotulo: 'Creme', amostra: 'papel' },
            { valor: 'sepia', rotulo: 'Sépia', amostra: 'sepia' },
            { valor: 'noite', rotulo: 'Noite', amostra: 'noite' },
          ]}
          {...grupo}
        />
        <Grupo
          legenda="Letra"
          chave="letra"
          classe="ajuste-letra"
          opcoes={[
            { valor: 'literata', rotulo: 'Literata' },
            { valor: 'atkinson', rotulo: 'Atkinson' },
            { valor: 'original', rotulo: 'A do livro' },
          ]}
          {...grupo}
        />

        <div className="ajuste" role="group" aria-labelledby="rotulo-tamanho">
          <span className="legenda" id="rotulo-tamanho">
            Tamanho da letra
          </span>
          <div className="tamanho">
            <button
              type="button"
              className="botao"
              aria-label="Diminuir a letra"
              disabled={tamanho <= TAMANHO_MINIMO}
              onClick={() => aoMudar({ tamanho: tamanho - 1 })}
            >
              A−
            </button>
            <output aria-live="polite" aria-label={`Tamanho ${tamanho}`}>
              {tamanho}
            </output>
            <button
              type="button"
              className="botao"
              aria-label="Aumentar a letra"
              disabled={tamanho >= TAMANHO_MAXIMO}
              onClick={() => aoMudar({ tamanho: tamanho + 1 })}
            >
              A+
            </button>
          </div>
        </div>

        <Grupo
          legenda="Espaço entre as linhas"
          chave="espacamento"
          opcoes={[
            { valor: 'compacto', rotulo: 'Menor' },
            { valor: 'confortavel', rotulo: 'Médio' },
            { valor: 'amplo', rotulo: 'Maior' },
          ]}
          {...grupo}
        />
        <Grupo
          legenda="Largura do texto"
          chave="largura"
          opcoes={[
            { valor: 'estreita', rotulo: 'Estreita' },
            { valor: 'media', rotulo: 'Média' },
            { valor: 'larga', rotulo: 'Larga' },
          ]}
          {...grupo}
        />
        <Grupo
          legenda="Alinhamento"
          chave="alinhamento"
          opcoes={[
            { valor: 'esquerda', rotulo: 'À esquerda' },
            { valor: 'justificado', rotulo: 'Justificado' },
          ]}
          {...grupo}
        />
        <Grupo
          legenda="Como virar"
          chave="fluxo"
          opcoes={[
            { valor: 'paginas', rotulo: 'Páginas' },
            { valor: 'rolagem', rotulo: 'Rolagem' },
          ]}
          {...grupo}
        />
        <Grupo
          legenda="Páginas na tela"
          chave="colunas"
          desativado={preferencias.fluxo === 'rolagem'}
          opcoes={[
            { valor: 'uma', rotulo: 'Uma' },
            { valor: 'duas', rotulo: 'Duas, se couber' },
          ]}
          {...grupo}
        />

        <p className="dica">
          Os ajustes valem para todos os livros. No livro, as setas viram a página, e Ctrl + e Ctrl − mudam o tamanho
          da letra.
        </p>
      </div>
    </Dialogo>
  )
}
