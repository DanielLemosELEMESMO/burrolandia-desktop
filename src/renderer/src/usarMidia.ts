import { useSyncExternalStore } from 'react'

/** Acompanha uma media query, por exemplo o tema escuro do sistema ou o movimento reduzido. */
export function usarMidia(consulta: string): boolean {
  return useSyncExternalStore(
    avisar => {
      const lista = matchMedia(consulta)
      lista.addEventListener('change', avisar)
      return () => lista.removeEventListener('change', avisar)
    },
    () => matchMedia(consulta).matches,
  )
}
