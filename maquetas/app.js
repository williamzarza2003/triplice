// Tríplice · lógica compartida de las maquetas (fase 0). Script clásico: depende de datos.js.
// En la fase 1 el cálculo de precios se hace en el servidor (ver docs/arquitectura.md); acá es solo para mostrar.
/* global MONEDAS, COTIZACION, REGIONES, VENDEDORES, PRODUCTOS, CATEGORIAS */

const NOMBRE = 'Tríplice'

// ---------------------------------------------------------------- estado: región, moneda e idioma
function leer(clave, porDefecto) {
  try { return localStorage.getItem(clave) || porDefecto } catch { return porDefecto }
}
function guardar(clave, valor) {
  try { localStorage.setItem(clave, valor) } catch { /* modo privado: se usa el valor en memoria */ }
}
function regionInicial() {
  const l = (navigator.language || 'es').toLowerCase()
  if (l.startsWith('pt')) return 'BR'
  if (l === 'es-ar') return 'AR'
  if (l.startsWith('es')) return 'PY'
  return 'INT'
}
const estado = {
  region: new URLSearchParams(location.search).get('region') || leer('triplice.region', regionInicial()),
}
estado.moneda = leer('triplice.moneda', REGIONES[estado.region].moneda)

// ---------------------------------------------------------------- precios
/** Precio final en la región elegida: base USD + impuesto del país, convertido y redondeado como se cobra. */
function precioEn(usd, regionId, moneda, reducido = false) {
  const r = REGIONES[regionId]
  const tasa = reducido ? r.ivaReducido : r.iva
  const conImpuesto = usd * (1 + tasa)
  const m = MONEDAS[moneda]
  const valor = conImpuesto * COTIZACION[moneda]
  return Math.round(valor / m.redondeo) * m.redondeo
}
function formato(valor, moneda) {
  const m = MONEDAS[moneda]
  const n = valor.toLocaleString(m.locale, { minimumFractionDigits: m.decimales, maximumFractionDigits: m.decimales })
  return `${m.simbolo} ${n}`
}
const precioProducto = (p, region = estado.region, moneda = estado.moneda) => precioEn(p.usd, region, moneda, p.reducido)
const fmt = (v) => formato(v, estado.moneda)

/** Las otras dos monedas de la frontera, cada una con el impuesto de su país (para la etiqueta de frontera). */
function otrasFronteras(p) {
  return ['PY', 'BR', 'AR'].filter((r) => r !== estado.region).map((r) => {
    const mon = REGIONES[r].moneda
    return { region: r, texto: formato(precioEn(p.usd, r, mon, p.reducido), mon) }
  })
}

function textoEnvio(tipo) {
  const ciudad = REGIONES[estado.region].ciudad || 'tu ciudad'
  if (tipo === 'hoy') return { clase: 'envio--hoy', texto: estado.region === 'PY' ? 'Retiralo hoy en CDE' : `Llega mañana a ${ciudad}` }
  if (tipo === 'manana') return { clase: 'envio--rapido', texto: `Llega mañana a ${ciudad}` }
  return { clase: '', texto: 'Llega el jueves 4' }
}

// ---------------------------------------------------------------- íconos (trazo 1,75; estilo Lucide, dibujados a mano)
const ICONOS = {
  buscar: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  carrito: '<path d="M3 4h2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 8H6.2"/><circle cx="9.5" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/>',
  usuario: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  abajo: '<path d="m6 9 6 6 6-6"/>',
  estrella: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  camion: '<path d="M3 6h11v10H3zM14 9h4l3 3.5V16h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17.5" cy="17.5" r="1.8"/>',
  tienda: '<path d="M4 9h16l-1.5-5h-13zM5 9v11h14V9M9 20v-6h6v6"/>',
  escudo: '<path d="M12 3 4 6v6c0 4.5 3.4 7.9 8 9 4.6-1.1 8-4.5 8-9V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  mapa: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  corazon: '<path d="M12 20s-7.5-4.6-9-9.4C1.8 6.8 4.3 4 7.2 4c2 0 3.6 1.1 4.8 2.8C13.2 5.1 14.8 4 16.8 4c2.9 0 5.4 2.8 4.2 6.6C19.5 15.4 12 20 12 20z"/>',
  comparar: '<path d="M7 4v16M17 4v16M3 8l4-4 4 4M13 16l4 4 4-4"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  cerrar: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  frontera: '<path d="M4 7h13l-3-3M20 17H7l3 3"/>',
  caja: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>',
  grafico: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
  filtro: '<path d="M4 5h16l-6 7.5V19l-4 1.5v-8z"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  menos: '<path d="M5 12h14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/>',
  canasta: '<path d="M4 9h16l-1.6 9.2a2 2 0 0 1-2 1.8H7.6a2 2 0 0 1-2-1.8z"/><path d="m8 9 3-5M16 9l-3-5M9 13v3M15 13v3"/>',
  pantalla: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>',
  casa: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10M10 20v-6h4v6"/>',
  llave: '<path d="M14.5 5.5a4 4 0 0 0 4.9 4.9l-9 9a2.1 2.1 0 0 1-3-3l9-9a4 4 0 0 1-1.9-1.9z"/><path d="m17 3-2.5 2.5 1.5 3 3 1.5L21.5 7.5"/>',
  remera: '<path d="M8 3 3 6l2 4 2-1v12h10V9l2 1 2-4-5-3a4 4 0 0 1-8 0z"/>',
  pelota: '<circle cx="12" cy="12" r="9"/><path d="m12 7 4 3-1.5 4.5h-5L8 10z"/><path d="M12 3v4M21 10l-5 0M3 10h5M9.5 14.5 7 19M14.5 14.5 17 19"/>',
  libro: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M8 7h7"/>',
  candado: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
}
function icono(nombre, clase = 'icono') {
  return `<svg class="${clase}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${ICONOS[nombre]}</svg>`
}

// ---------------------------------------------------------------- piezas
function estrellas(valor, opiniones) {
  return `<span class="estrellas" aria-label="${valor.toLocaleString('es')} de 5 estrellas, ${opiniones.toLocaleString('es')} opiniones">`
    + `${icono('estrella', 'icono icono--estrella')}<b>${valor.toLocaleString('es', { minimumFractionDigits: 1 })}</b>`
    + `<span class="estrellas__n">(${opiniones.toLocaleString('es')})</span></span>`
}

/** Tarjeta de producto: mucha información en tres niveles de lectura (qué es → cuánto → cuándo y quién). */
function tarjeta(p, { compacta = false } = {}) {
  const precio = precioProducto(p)
  const antes = p.antes ? precioEn(p.antes, estado.region, estado.moneda, p.reducido) : null
  const desc = antes ? Math.round((1 - precio / antes) * 100) : 0
  const envio = textoEnvio(p.envio)
  const v = VENDEDORES[p.vendedor]
  const cuota = p.cuotas > 1 ? `<p class="tarjeta__cuotas">${p.cuotas} × ${fmt(Math.ceil(precio / p.cuotas / MONEDAS[estado.moneda].redondeo) * MONEDAS[estado.moneda].redondeo)} sin interés</p>` : ''
  const otras = otrasFronteras(p)
  return `<article class="tarjeta${compacta ? ' tarjeta--compacta' : ''}">
    <a class="tarjeta__foto" href="producto.html?id=${p.id}" tabindex="-1" aria-hidden="true">
      <img src="img/${p.id}.webp" alt="" width="450" height="450" loading="lazy" decoding="async" onerror="this.closest('.tarjeta__foto').classList.add('sin-foto')">
      ${desc ? `<span class="sello sello--oferta">−${desc} %</span>` : ''}
    </a>
    <div class="tarjeta__cuerpo">
      <h3 class="tarjeta__titulo"><a href="producto.html?id=${p.id}">${p.nombre}</a></h3>
      ${estrellas(p.estrellas, p.opiniones)}
      <div class="tarjeta__precio">
        <p class="precio${desc ? ' precio--oferta' : ''}"><span class="sr-only">Precio: </span>${fmt(precio)}${antes ? ` <s class="precio__antes"><span class="sr-only">antes </span>${fmt(antes)}</s>` : ''}</p>
        <button type="button" class="frontera" aria-expanded="false" title="Ver en las otras monedas de la frontera">${icono('frontera', 'icono icono--chico')}<span class="sr-only">Ver el precio en las otras monedas de la frontera</span></button>
      </div>
      <p class="frontera__otras" hidden>${otras.map((o) => `<span><abbr title="${REGIONES[o.region].nombre}">${o.region}</abbr> ${o.texto}</span>`).join('')}</p>
      ${cuota}
      <p class="tarjeta__envio ${envio.clase}">${icono('camion', 'icono icono--chico')}${envio.texto}</p>
      <p class="tarjeta__vendedor">${v.nombre} · <span class="${v.reputacion >= 97 ? 'rep rep--alta' : 'rep'}">${v.reputacion} % recomendado</span></p>
    </div>
  </article>`
}

// ---------------------------------------------------------------- encabezado y pie
function encabezado() {
  const r = REGIONES[estado.region]
  const actual = location.pathname.split('/').pop() || 'index.html'
  return `<a class="saltar" href="#contenido">Saltar al contenido</a>
  <div class="aviso-demo">${NOMBRE} es una tienda de demostración: productos, vendedores y pagos son de prueba.</div>
  <div class="encabezado__fila contenedor">
    <button type="button" class="encabezado__menu" aria-label="Categorías" aria-expanded="false" aria-controls="cajon">${icono('menu')}</button>
    <a class="logo" href="index.html" aria-label="${NOMBRE}, inicio"><img src="../marca/logotipo-claro.svg" alt="" width="132" height="37"></a>
    <form class="buscador" role="search" action="buscar.html">
      <label class="sr-only" for="q">Buscar en ${NOMBRE}</label>
      <input id="q" name="q" type="search" placeholder="Buscá productos, marcas o tiendas" autocomplete="off" aria-controls="sugerencias" aria-autocomplete="list" aria-expanded="false">
      <button class="buscador__boton" type="submit" aria-label="Buscar">${icono('buscar')}</button>
      <ul id="sugerencias" class="sugerencias" role="listbox" hidden></ul>
    </form>
    <button type="button" class="region" aria-haspopup="dialog" aria-controls="dialogo-region">
      <span class="region__pais">${r.nombre}</span><span class="region__moneda">${MONEDAS[estado.moneda].simbolo} ${estado.moneda} · ES</span>${icono('abajo', 'icono icono--chico')}
    </button>
    <a class="encabezado__accion" href="#">${icono('usuario')}<span>Ingresar</span></a>
    <a class="encabezado__accion encabezado__carrito" href="carrito.html" ${actual === 'carrito.html' ? 'aria-current="page"' : ''}>${icono('carrito')}<span>Carrito</span><b class="contador" aria-label="3 productos">3</b></a>
  </div>
  <nav class="categorias" aria-label="Categorías principales">
    <div class="contenedor categorias__fila">
      <a href="buscar.html" class="categorias__todas">${icono('menu', 'icono icono--chico')}Todas</a>
      ${['Ofertas del día', 'Supermercado', 'Electrónica', 'Hogar', 'Cocina', 'Herramientas', 'Moda', 'Deportes', 'Retiro en CDE'].map((c) => `<a href="buscar.html?cat=${encodeURIComponent(c)}">${c}</a>`).join('')}
      <a class="categorias__vender" href="panel.html">Vender en ${NOMBRE}</a>
    </div>
  </nav>
  <dialog id="dialogo-region" class="dialogo" aria-labelledby="titulo-region">
    <form method="dialog" class="dialogo__cuerpo">
      <h2 id="titulo-region">¿Dónde comprás?</h2>
      <p class="dialogo__ayuda">Cambia la moneda, los impuestos que ves y los plazos de envío. Lo podés cambiar cuando quieras.</p>
      <fieldset class="opciones-region"><legend>Región</legend>
        ${Object.entries(REGIONES).map(([id, x]) => `<label><input type="radio" name="region" value="${id}" ${id === estado.region ? 'checked' : ''}><span><b>${x.nombre}</b><small>${formato(1, x.moneda).replace(/\d.*/, '')} ${x.moneda} · ${x.etiqueta}</small></span></label>`).join('')}
      </fieldset>
      <div class="dialogo__fila">
        <label>Moneda <select name="moneda">${Object.keys(MONEDAS).map((m) => `<option ${m === estado.moneda ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
        <label>Idioma <select name="idioma"><option selected>Español</option><option>Português</option><option>English</option></select></label>
      </div>
      <div class="dialogo__acciones"><button value="cancelar" class="boton boton--sec">Cancelar</button><button value="ok" class="boton boton--marca">Ver precios en esta región</button></div>
    </form>
  </dialog>`
}

function pie() {
  return `<div class="contenedor pie__grilla">
    <div><img src="../marca/logotipo-claro.svg" alt="${NOMBRE}" width="132" height="37"><p class="pie__lema">Los tres mercados de la frontera, en una sola tienda.</p></div>
    <div><h2>Comprar</h2><a href="#">Cómo se calculan los impuestos</a><a href="#">Envíos y retiro en CDE</a><a href="#">Devoluciones</a></div>
    <div><h2>Vender</h2><a href="panel.html">Panel del vendedor</a><a href="#">Comisiones</a><a href="#">Reglas de la tienda</a></div>
    <div><h2>Ayuda</h2><a href="#">Centro de ayuda</a><a href="#">Hablá con nosotros</a><a href="#">Accesibilidad</a></div>
  </div>
  <p class="contenedor pie__legal">Proyecto de portafolio de William Zarza. Productos, vendedores, reseñas y pagos son ficticios o de prueba. Los impuestos son una simulación aproximada. Fotos: modelos 3D CC0 de Poly Haven.</p>`
}

// ---------------------------------------------------------------- carrito de ejemplo y desglose de impuestos
const CARRITO = [
  { id: 'vintage_electric_kettle', cant: 1, variante: 'Crema · 1,7 L' },
  { id: 'tea_set_01', cant: 1, variante: 'Blanco con borde dorado' },
  { id: 'adjustable_wrench', cant: 2, variante: '10"' },
  { id: 'croissant', cant: 1, variante: 'Caja de 6' },
]

/** Desglose como en el checkout real: subtotal sin impuestos, cada tasa por separado, envío y total.
    (En la fase 1 esto lo calcula el servidor; el navegador solo lo muestra.) */
function desglose(envioUsd = 0) {
  const r = REGIONES[estado.region]
  const conv = (usd) => usd * COTIZACION[estado.moneda]
  let neto = 0
  const porTasa = {}
  for (const l of CARRITO) {
    const p = PRODUCTOS.find((x) => x.id === l.id)
    const tasa = p.reducido ? r.ivaReducido : r.iva
    neto += conv(p.usd) * l.cant
    porTasa[tasa] = (porTasa[tasa] || 0) + conv(p.usd) * l.cant * tasa
  }
  const red = (v) => Math.round(v / MONEDAS[estado.moneda].redondeo) * MONEDAS[estado.moneda].redondeo
  const impuestos = Object.entries(porTasa).filter(([t]) => Number(t) > 0)
  const envio = envioUsd ? red(conv(envioUsd)) : 0
  const total = red(neto) + impuestos.reduce((a, [, v]) => a + red(v), 0) + envio
  const nombreImp = estado.region === 'BR' ? 'Impuestos estimados' : 'IVA'
  return `<dl>
    <dt>Productos (${CARRITO.reduce((a, l) => a + l.cant, 0)})<small>sin impuestos</small></dt><dd>${fmt(red(neto))}</dd>
    ${impuestos.map(([t, v]) => `<dt>${nombreImp} ${(Number(t) * 100).toLocaleString('es')} %<small>${Number(t) === r.ivaReducido ? 'alimentos' : 'resto de los productos'}</small></dt><dd>${fmt(red(v))}</dd>`).join('')}
    <dt>Envío</dt><dd>${envio ? fmt(envio) : '<span style="color:var(--exito);font-weight:700">Gratis</span>'}</dd>
    <dt class="total">Total</dt><dd class="total">${fmt(total)}</dd>
  </dl>`
}

// ---------------------------------------------------------------- comportamiento
function montar() {
  const enc = document.querySelector('[data-encabezado]')
  if (enc) enc.innerHTML = encabezado()
  const p = document.querySelector('[data-pie]')
  if (p) p.innerHTML = pie()

  document.querySelectorAll('[data-grilla]').forEach((g) => {
    const ids = g.dataset.grilla.split(',').map((s) => s.trim()).filter(Boolean)
    const lista = ids.length ? ids.map((id) => PRODUCTOS.find((x) => x.id === id)).filter(Boolean) : PRODUCTOS
    g.innerHTML = lista.map((x) => tarjeta(x, { compacta: g.hasAttribute('data-compacta') })).join('')
  })
  document.querySelectorAll('[data-precio]').forEach((el) => {
    const prod = PRODUCTOS.find((x) => x.id === el.dataset.precio)
    const mult = Number(el.dataset.cantidad || 1)
    if (prod) el.textContent = fmt(precioProducto(prod) * mult)
  })
  document.querySelectorAll('[data-desglose]').forEach((el) => { el.innerHTML = desglose(Number(el.dataset.desglose || 0)) })
  document.querySelectorAll('[data-icono]').forEach((el) => { el.insertAdjacentHTML('afterbegin', icono(el.dataset.icono, el.dataset.iconoClase || 'icono')) })

  // Etiqueta de frontera: muestra el mismo producto con el precio final de los otros dos países
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.frontera')
    if (!b) return
    const otras = b.closest('.tarjeta').querySelector('.frontera__otras')
    const abierta = b.getAttribute('aria-expanded') === 'true'
    b.setAttribute('aria-expanded', String(!abierta))
    otras.hidden = abierta
  })

  // Región, moneda e idioma
  const dlg = document.getElementById('dialogo-region')
  document.querySelector('.region')?.addEventListener('click', () => dlg.showModal())
  dlg?.addEventListener('close', () => {
    if (dlg.returnValue !== 'ok') return
    const f = dlg.querySelector('form')
    const region = f.region.value
    const monedaElegida = f.moneda.value
    // si cambió la región y no se tocó la moneda, la moneda sigue a la región
    const moneda = monedaElegida === estado.moneda && region !== estado.region ? REGIONES[region].moneda : monedaElegida
    guardar('triplice.region', region)
    guardar('triplice.moneda', moneda)
    location.search = ''
    location.reload()
  })

  // Menú de categorías en el celular
  const menu = document.querySelector('.encabezado__menu')
  menu?.addEventListener('click', () => {
    const nav = document.querySelector('.categorias')
    const abierto = menu.getAttribute('aria-expanded') === 'true'
    menu.setAttribute('aria-expanded', String(!abierto))
    nav.classList.toggle('categorias--abiertas', !abierto)
  })

  // Autocompletado de ejemplo: tolera tildes y algunos errores de tipeo
  const q = document.getElementById('q')
  const sug = document.getElementById('sugerencias')
  const normal = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  q?.addEventListener('input', () => {
    const t = normal(q.value.trim())
    if (t.length < 2) { sug.hidden = true; q.setAttribute('aria-expanded', 'false'); return }
    const lista = PRODUCTOS.filter((x) => normal(x.nombre + ' ' + x.cat + ' ' + x.marca).includes(t) || parecido(normal(x.nombre), t)).slice(0, 5)
    const cats = [...new Set(lista.map((x) => x.cat))].slice(0, 2)
    sug.innerHTML = cats.map((c) => `<li role="option"><a href="buscar.html?cat=${encodeURIComponent(c)}">${icono('buscar', 'icono icono--chico')}<b>${q.value}</b> en ${c}</a></li>`).join('')
      + lista.map((x) => `<li role="option"><a href="producto.html?id=${x.id}"><img src="img/${x.id}.webp" alt="" width="36" height="36">${x.nombre}<span>${fmt(precioProducto(x))}</span></a></li>`).join('')
      || `<li class="sugerencias__vacio">No encontramos "${q.value}". Probá con otra palabra o mirá las categorías.</li>`
    sug.hidden = false
    q.setAttribute('aria-expanded', 'true')
  })
  q?.addEventListener('blur', () => setTimeout(() => { sug.hidden = true; q.setAttribute('aria-expanded', 'false') }, 150))
}

/** Coincidencia aproximada: alguna palabra del nombre está a una letra cambiada o traspuesta del término. */
function parecido(texto, t) {
  return texto.split(/\s+/).some((w) => {
    if (Math.abs(w.length - t.length) > 1 || t.length < 4) return false
    let dif = 0
    for (let i = 0; i < Math.max(w.length, t.length); i++) if (w[i] !== t[i]) dif++
    const traspuesta = [...t].some((_, i) => i < t.length - 1 && t.slice(0, i) + t[i + 1] + t[i] + t.slice(i + 2) === w)
    return dif <= 1 || traspuesta
  })
}

document.addEventListener('DOMContentLoaded', montar)
