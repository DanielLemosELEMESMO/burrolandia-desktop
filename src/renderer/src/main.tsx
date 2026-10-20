import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/literata/wght.css'
import '@fontsource-variable/literata/wght-italic.css'
import '@fontsource-variable/atkinson-hyperlegible-next/wght.css'
import '@fontsource-variable/fraunces/opsz.css'
import '@fontsource-variable/inter/wght.css'
import './estilos/tokens.css'
import './estilos/base.css'
import './estilos/marca.css'
import './estilos/dialogos.css'
import './estilos/biblioteca.css'
import './estilos/leitor.css'
import { App } from './App'

// O processo principal manda o tema e a tela na URL, para a primeira pintura já sair na cor certa.
const parametros = new URLSearchParams(location.search)
const temaInicial = parametros.get('tema')
if (temaInicial && ['papel', 'sepia', 'noite'].includes(temaInicial)) document.documentElement.dataset.tema = temaInicial
document.documentElement.dataset.tela = parametros.get('tela') === 'leitor' ? 'leitor' : 'marca'

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
