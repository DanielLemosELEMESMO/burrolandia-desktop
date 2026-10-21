// O recorte da capa: a imagem com um retângulo por cima. Arrastar dentro move; puxar as bordas e os
// cantos muda o tamanho; arrastar fora desenha um novo. Pelo teclado, setas movem e Shift + setas
// mudam o tamanho. A conta (frações da imagem) mora em @nucleo/recorte.

import { useEffect, useId, useRef, useState, type Dispatch, type PointerEvent as EventoDePonteiro, type SetStateAction } from 'react'
import { emPixels, limitar, mover, pelaTecla, puxar, type Alca, type Retangulo } from '@nucleo/recorte'

export interface ImagemParaRecortar {
  url: string
  largura: number
  altura: number
}

const ALCAS: Alca[] = ['no', 'n', 'ne', 'l', 'se', 's', 'so', 'o']

type Arrasto = { modo: 'mover' | 'novo' | Alca; inicio: { x: number; y: number }; original: Retangulo }

export function Recorte({
  imagem,
  selecao,
  aoMudar,
}: {
  imagem: ImagemParaRecortar
  selecao: Retangulo
  /** Como o setState do React: aceita a seleção nova ou uma função da anterior. */
  aoMudar: Dispatch<SetStateAction<Retangulo>>
}) {
  const area = useRef<HTMLDivElement>(null)
  const arrasto = useRef<Arrasto | null>(null)
  const idDaDica = useId()

  /** Onde o ponteiro está, em frações da imagem; fora dela (o arrasto continua), na borda. */
  const ponto = (evento: EventoDePonteiro) => {
    const caixa = area.current!.getBoundingClientRect()
    const dentro = (valor: number) => Math.min(1, Math.max(0, valor))
    return { x: dentro((evento.clientX - caixa.left) / caixa.width), y: dentro((evento.clientY - caixa.top) / caixa.height) }
  }

  const comecar = (modo: Arrasto['modo']) => (evento: EventoDePonteiro) => {
    if (evento.button !== 0) return
    evento.preventDefault()
    evento.stopPropagation()
    area.current?.setPointerCapture(evento.pointerId)
    arrasto.current = { modo, inicio: ponto(evento), original: selecao }
  }

  const mexer = (evento: EventoDePonteiro) => {
    const atual = arrasto.current
    if (!atual) return
    const { x, y } = ponto(evento)
    const [dx, dy] = [x - atual.inicio.x, y - atual.inicio.y]
    if (atual.modo === 'mover') aoMudar(mover(atual.original, dx, dy))
    else if (atual.modo === 'novo') {
      aoMudar(limitar({ x: Math.min(x, atual.inicio.x), y: Math.min(y, atual.inicio.y), largura: Math.abs(dx), altura: Math.abs(dy) }))
    } else aoMudar(puxar(atual.original, atual.modo, dx, dy))
  }

  const soltar = () => {
    arrasto.current = null
  }

  const emPx = emPixels(selecao, imagem.largura, imagem.altura)
  const tamanho = `${emPx.largura} por ${emPx.altura} pixels`
  // O leitor de tela ouve o tamanho novo quando ele para de mudar (não a cada toque de seta).
  const [anunciado, setAnunciado] = useState('')
  useEffect(() => {
    const espera = window.setTimeout(() => setAnunciado(`Recorte de ${tamanho}`), 400)
    return () => window.clearTimeout(espera)
  }, [tamanho])
  const posicao = {
    left: `${selecao.x * 100}%`,
    top: `${selecao.y * 100}%`,
    width: `${selecao.largura * 100}%`,
    height: `${selecao.altura * 100}%`,
  }
  return (
    <div className="recorte-moldura">
      <div
        ref={area}
        className="recorte"
        onPointerDown={comecar('novo')}
        onPointerMove={mexer}
        onPointerUp={soltar}
        onPointerCancel={soltar}
      >
        <img src={imagem.url} alt="" draggable={false} />
        {/* O que fica de fora escurece numa camada própria; as alças podem passar da borda. */}
        <div className="recorte-escuro" aria-hidden="true">
          <div style={posicao} />
        </div>
        <div
          className="recorte-selecao"
          role="group"
          tabIndex={0}
          aria-label={`Área do recorte: ${tamanho}`}
          aria-roledescription="recorte"
          aria-describedby={idDaDica}
          style={posicao}
          onPointerDown={comecar('mover')}
          onKeyDown={evento => {
            const { key: tecla, shiftKey: comShift } = evento
            if (!pelaTecla(selecao, tecla, comShift)) return
            evento.preventDefault()
            // Pela anterior: com a tecla segurada, os toques chegam antes de a tela atualizar.
            aoMudar(anterior => pelaTecla(anterior, tecla, comShift) ?? anterior)
          }}
        >
          {ALCAS.map(alca => (
            <span key={alca} className={`recorte-alca recorte-alca-${alca}`} onPointerDown={comecar(alca)} />
          ))}
        </div>
      </div>
      <p id={idDaDica} className="dica">
        Arraste para mover; puxe as bordas e os cantos para mudar o tamanho. No teclado, as setas movem e Shift com as
        setas muda o tamanho. Recorte de {emPx.largura} × {emPx.altura} pixels.
      </p>
      <p className="so-leitor-de-tela" aria-live="polite">
        {anunciado}
      </p>
    </div>
  )
}

/** O recorte em JPEG, com no máximo `alturaMaxima` pixels de altura e `larguraMaxima` de largura. */
export async function recortarEmJpeg(
  imagem: ImagemParaRecortar,
  selecao: Retangulo,
  alturaMaxima = 1600,
  larguraMaxima = 1600,
): Promise<Uint8Array> {
  const elemento = new Image()
  elemento.src = imagem.url
  await elemento.decode()
  const px = emPixels(selecao, elemento.naturalWidth, elemento.naturalHeight)
  const escala = Math.min(1, alturaMaxima / px.altura, larguraMaxima / px.largura)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(px.largura * escala))
  canvas.height = Math.max(1, Math.round(px.altura * escala))
  const contexto = canvas.getContext('2d')
  if (!contexto) throw new Error('Sem canvas para recortar a capa')
  // Fundo branco: PNG com transparência não vira preto no JPEG.
  contexto.fillStyle = '#ffffff'
  contexto.fillRect(0, 0, canvas.width, canvas.height)
  contexto.drawImage(elemento, px.x, px.y, px.largura, px.altura, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>(pronto => canvas.toBlob(pronto, 'image/jpeg', 0.9))
  if (!blob) throw new Error('Não deu para gerar a imagem da capa')
  return new Uint8Array(await blob.arrayBuffer())
}
