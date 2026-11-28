// Íconos de trazo (1,75 px, 24 × 24), dibujados para Tríplice con el estilo de la fase 0.
// Son decorativos: el texto al lado (o un aria-label en el botón) dice qué hacen.

const TRAZOS = {
  buscar: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  carrito: <><path d="M3 4h2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 8H6.2" /><circle cx="9.5" cy="20" r="1.3" /><circle cx="17" cy="20" r="1.3" /></>,
  abajo: <path d="m6 9 6 6 6-6" />,
  derecha: <path d="m9 6 6 6-6 6" />,
  izquierda: <path d="m15 6-6 6 6 6" />,
  estrella: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />,
  camion: <><path d="M3 6h11v10H3zM14 9h4l3 3.5V16h-7" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17.5" cy="17.5" r="1.8" /></>,
  tienda: <path d="M4 9h16l-1.5-5h-13zM5 9v11h14V9M9 20v-6h6v6" />,
  escudo: <><path d="M12 3 4 6v6c0 4.5 3.4 7.9 8 9 4.6-1.1 8-4.5 8-9V6z" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>,
  mapa: <><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  cerrar: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  frontera: <path d="M4 7h13l-3-3M20 17H7l3 3" />,
  caja: <><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" /><path d="M3 7.5 12 12l9-4.5M12 12v9" /></>,
  filtro: <path d="M4 5h16l-6 7.5V19l-4 1.5v-8z" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.5v.5" /></>,
  reloj: <><circle cx="12" cy="12" r="8" /><path d="M12 7.5V12l3 2" /></>,
  globo: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.6 3.9 5.6 3.9 9s-1.3 6.4-3.9 9c-2.6-2.6-3.9-5.6-3.9-9s1.3-6.4 3.9-9z" /></>,
  conversa: <path d="M5 5h14v10H10l-4 4v-4H5z" />,
  // cuenta (fase 3)
  persona: <><circle cx="12" cy="8.5" r="3.8" /><path d="M4.5 20.5c.8-3.9 3.8-6 7.5-6s6.7 2.1 7.5 6" /></>,
  descarga: <path d="M12 4v11m-4.5-4.5L12 15l4.5-4.5M5 19.5h14" />,
  camara: <><path d="M4 8h3.2L9 5.5h6L16.8 8H20v11H4z" /><circle cx="12" cy="13.2" r="3.4" /></>,
  devolver: <path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />,
  pulgar: <path d="M7.5 10.5v9.5h-3v-9.5zM7.5 19.5h9.2a2 2 0 0 0 2-1.6l1.1-5.6a2 2 0 0 0-2-2.3H13l.8-3.6A1.8 1.8 0 0 0 12 4.2l-4.5 6.3" />,
  // panel del vendedor (fase 4)
  grafico: <path d="M4 20h16M7 16.5V11M12 16.5V6M17 16.5v-8" />,
  mas: <path d="M12 5v14M5 12h14" />,
  externo: <path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5" />,
  // descubrimiento (fase 5)
  corazon: <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z" />,
  comparar: <><rect x="3.5" y="4.5" width="7" height="15" rx="1.5" /><rect x="13.5" y="4.5" width="7" height="15" rx="1.5" /><path d="M6 9h2M16 9h2M6 13h2M16 13h2" /></>,
  campana: <><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z" /><path d="M10 20.5a2.2 2.2 0 0 0 4 0" /></>,
  lista: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.5M4.5 12h.5M4.5 18h.5" />,
  enlace: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  historial: <><path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5" /><path d="M4 4v4.5h4.5M12 8v4.5l3 1.8" /></>,
  // categorías
  celular: <><rect x="7" y="2.5" width="10" height="19" rx="2.2" /><path d="M11 18.5h2" /></>,
  notebook: <><rect x="5" y="5" width="14" height="10" rx="1.2" /><path d="M2.5 18.5h19L20 15H4z" /></>,
  auricular: <><path d="M4.5 15v-3a7.5 7.5 0 0 1 15 0v3" /><rect x="3.5" y="14" width="4.5" height="6.5" rx="1.6" /><rect x="16" y="14" width="4.5" height="6.5" rx="1.6" /></>,
  perfume: <><rect x="6" y="9.5" width="12" height="11.5" rx="2.2" /><path d="M10 9.5V7h4v2.5M9 3.5h6V7H9zM9.5 14.5h5" /></>,
  pantalla: <><rect x="3" y="4" width="18" height="12" rx="1.5" /><path d="M8 20h8M12 16v4" /></>,
  enchufe: <><path d="M9 3v4M15 3v4M6 7h12v3a6 6 0 0 1-12 0z" /><path d="M12 16v5" /></>,
  olla: <><path d="M4 10h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" /><path d="M2 10h2M20 10h2M8 10V8a4 4 0 0 1 8 0v2M12 4V3" /></>,
  sillon: <><path d="M5 11V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3" /><path d="M3 12a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v5H3z" /><path d="M5 17v2M19 17v2" /></>,
  florero: <path d="M9 3h6M10 3v3c-3 2-4 4.5-4 7.5A6.5 6.5 0 0 0 12 21a6.5 6.5 0 0 0 6-7.5C18 10.5 17 8 14 6V3" />,
  lampara: <><path d="M8 3h8l3 8H5z" /><path d="M12 11v7M8 21h8M12 18v3" /></>,
  llave: <><path d="M14.5 5.5a4 4 0 0 0 4.9 4.9l-9 9a2.1 2.1 0 0 1-3-3l9-9a4 4 0 0 1-1.9-1.9z" /><path d="m17 3-2.5 2.5 1.5 3 3 1.5L21.5 7.5" /></>,
  hoja: <><path d="M5 19c0-8 5-14 15-15-1 10-7 15-15 15z" /><path d="M5 19 13 11" /></>,
  canasta: <><path d="M4 9h16l-1.6 9.2a2 2 0 0 1-2 1.8H7.6a2 2 0 0 1-2-1.8z" /><path d="m8 9 3-5M16 9l-3-5M9 13v3M15 13v3" /></>,
  gota: <path d="M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11z" />,
  pelota: <><circle cx="12" cy="12" r="9" /><path d="m12 7 4 3-1.5 4.5h-5L8 10z" /><path d="M12 3v4M21 10h-5M3 10h5M9.5 14.5 7 19M14.5 14.5 17 19" /></>,
  dado: <><rect x="4" y="4" width="16" height="16" rx="3" /><circle cx="9" cy="9" r=".8" /><circle cx="15" cy="15" r=".8" /><circle cx="15" cy="9" r=".8" /><circle cx="9" cy="15" r=".8" /></>,
  lapiz: <><path d="M15 4l5 5L9 20H4v-5z" /><path d="M13 6l5 5" /></>,
  auto: <><path d="M4 16v-4l2-5h12l2 5v4z" /><path d="M4 12h16" /><circle cx="7.5" cy="16.5" r="1.8" /><circle cx="16.5" cy="16.5" r="1.8" /></>,
} as const

export type NombreIcono = keyof typeof TRAZOS

export function Icono({ nombre, tam = 22, className }: { nombre: NombreIcono | string; tam?: number; className?: string }) {
  const trazo = TRAZOS[nombre as NombreIcono] ?? TRAZOS.caja
  return (
    <svg className={className} width={tam} height={tam} viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none"
      stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      {trazo}
    </svg>
  )
}
