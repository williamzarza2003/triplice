// Cálculo de la compra (lib/compra): impuestos por país y categoría, redondeo por moneda, cupones, envío por
// peso y el carrito del invitado. Los números son los de docs/arquitectura.md (fase 2): tienen que dar exacto.
import { describe, expect, it } from 'vitest'
import { agregar, cambiarCantidad, conCupon, enCarrito, escribirCarrito, fusionar, guardados, leerCarrito, MAX_CANTIDAD, paraDespues, quitar, unidades, vacio } from '@/lib/compra/carrito'
import { costoEnvio, desglose, kilosCobrables, montoStripe, type Cupon, type ItemCompra } from '@/lib/compra/desglose'
import { precioFinal, reglaDe, type Impuestos } from '@/lib/compra/impuestos'
import type { Tasas } from '@/lib/precios'

const TASAS: Tasas = { PYG: 7350, BRL: 5.45, ARS: 1180 }
const PY: Impuestos = { reglas: [{ categoria: null, nombre: 'IVA 10 %', tasa: 0.1 }, { categoria: 'supermercado', nombre: 'IVA 5 %', tasa: 0.05 }] }
const AR: Impuestos = { reglas: [{ categoria: null, nombre: 'IVA 21 %', tasa: 0.21 }, { categoria: 'informatica', nombre: 'IVA 10,5 %', tasa: 0.105 }] }
const BR: Impuestos = { reglas: [{ categoria: null, nombre: 'Impostos estimados', tasa: 0.25 }] }
const XX: Impuestos = { reglas: [] }

const item = (id: string, usd: number, cantidad = 1, regla = PY.reglas[0], extra: Partial<ItemCompra> = {}): ItemCompra =>
  ({ id, cantidad, baseUsdCent: Math.round(usd * 100), regla, tienda: 'casa-nubla', pesoG: 1200, envioGratis: false, ...extra })

describe('impuestos', () => {
  it('elige la regla de la subcategoría, después la de la categoría principal y si no la general', () => {
    expect(reglaDe(PY, { sub: 'panaderia', padre: 'supermercado' }).tasa).toBe(0.05)
    expect(reglaDe(PY, { sub: 'smartphones', padre: 'celulares' }).tasa).toBe(0.1)
    expect(reglaDe(AR, { sub: 'notebooks', padre: 'informatica' }).nombre).toBe('IVA 10,5 %')
    expect(reglaDe(XX, { sub: 'notebooks', padre: 'informatica' }).tasa).toBe(0)
  })

  it('la misma pava en los tres países (etiqueta de frontera)', () => {
    expect(precioFinal(2900, 0.1, 'PYG', TASAS)).toBe(234000)
    expect(precioFinal(2900, 0.25, 'BRL', TASAS)).toBe(197.6)
    expect(precioFinal(2900, 0.21, 'ARS', TASAS)).toBe(41400)
    expect(precioFinal(2900, 0, 'USD', TASAS)).toBe(29)
  })
})

describe('desglose', () => {
  const carrito = [
    item('pava', 29), item('te', 48), item('llave', 9, 2), item('medialunas', 4.2, 1, PY.reglas[1]),
  ]

  it('Paraguay con retiro en el local: el total es la suma de lo que se ve y el IVA va incluido', () => {
    const d = desglose({ items: carrito, moneda: 'PYG', tasas: TASAS, entrega: { modo: 'retiro' } })
    expect(d.lineas.map((l) => l.total)).toEqual([234000, 388000, 146000, 32000])
    expect(d.productos).toBe(800000)
    expect(d.envio).toBe(0)
    expect(d.total).toBe(800000)
    expect(d.impuestos).toEqual([
      { nombre: 'IVA 10 %', tasa: 0.1, monto: 70000 }, // 768.000 × 0,1 / 1,1 = 69.818 → 70.000
      { nombre: 'IVA 5 %', tasa: 0.05, monto: 2000 }, // 32.000 × 0,05 / 1,05 = 1.524 → 2.000
    ])
  })

  it('un cupón del 10 % baja también el impuesto incluido', () => {
    const cupon: Cupon = { codigo: 'BIENVENIDA10', tipo: 'porcentaje', valor: 10, minimoUsdCent: 2000 }
    const d = desglose({ items: carrito, moneda: 'PYG', tasas: TASAS, cupon, entrega: { modo: 'retiro' } })
    expect(d.descuento).toBe(80000)
    expect(d.total).toBe(720000)
    expect(d.impuestos.map((x) => x.monto)).toEqual([63000, 1000])
  })

  it('un cupón no se aplica si no se llega al mínimo, y uno de monto nunca deja el total negativo', () => {
    const minimo: Cupon = { codigo: 'PUENTE', tipo: 'monto', valor: 500, minimoUsdCent: 5000 }
    expect(desglose({ items: [item('pava', 29)], moneda: 'PYG', tasas: TASAS, cupon: minimo }).cuponRechazado).toBe('minimo')
    const grande: Cupon = { codigo: 'TODO', tipo: 'monto', valor: 100000, minimoUsdCent: 0 }
    const d = desglose({ items: [item('pava', 29)], moneda: 'PYG', tasas: TASAS, cupon: grande })
    expect(d.descuento).toBe(234000)
    expect(d.total).toBe(0)
  })

  it('redondea cada moneda con su paso: reales de a 10 centavos, pesos de a 100, dólares al centavo', () => {
    expect(desglose({ items: [item('pava', 29, 3, BR.reglas[0])], moneda: 'BRL', tasas: TASAS }).total).toBe(592.8)
    expect(desglose({ items: [item('pava', 29, 1, AR.reglas[0])], moneda: 'ARS', tasas: TASAS }).total).toBe(41400)
    const usd = desglose({ items: [item('a', 0.1, 1, XX.reglas[0] ?? { categoria: null, nombre: '', tasa: 0 }), item('b', 0.2)], moneda: 'USD', tasas: TASAS })
    expect(usd.total).toBe(0.32) // 0,10 + 0,22 (IVA 10 %): sin errores de coma flotante
  })

  it('el envío se cobra por tienda, por peso, y gratis si todo lo de esa tienda tiene envío gratis', () => {
    const zona = { baseUsdCent: 300, porKgUsdCent: 50 }
    const items = [
      item('pava', 29, 2), // 2,4 kg en Casa Nubla → 2,5 kg cobrables
      item('reloj', 79, 1, PY.reglas[0], { tienda: 'perfumeria-jasy', pesoG: 160, envioGratis: true }),
    ]
    const d = desglose({ items, moneda: 'PYG', tasas: TASAS, entrega: { modo: 'domicilio', zona } })
    expect(d.envioPorTienda).toEqual({ 'casa-nubla': 31000, 'perfumeria-jasy': 0 }) // (3 + 0,5 × 2,5) USD × 7.350 = 31.237 → 31.000
    expect(d.total).toBe(d.productos + 31000)
    expect(kilosCobrables(100)).toBe(0.5)
    expect(kilosCobrables(1001)).toBe(1.5)
    expect(costoEnvio(zona, 0, 'BRL', TASAS)).toBe(17.7) // 3,25 USD × 5,45 = 17,71 → 17,70
  })

  it('pasa el total a la unidad mínima que pide Stripe', () => {
    expect(montoStripe(800000, 'PYG')).toBe(800000)
    expect(montoStripe(197.6, 'BRL')).toBe(19760)
    expect(montoStripe(0.32, 'USD')).toBe(32)
    expect(montoStripe(41400, 'ARS')).toBe(4140000)
  })
})

describe('carrito del invitado', () => {
  const A = '11111111-1111-4111-a111-111111111111'
  const B = '22222222-2222-4222-a222-222222222222'

  it('se escribe y se lee igual, y descarta lo manipulado', () => {
    const c = conCupon(agregar(agregar(vacio(), A, 2), B), 'BIENVENIDA10')
    expect(leerCarrito(escribirCarrito(c))).toEqual(c)
    expect(leerCarrito('no-es-base64')).toEqual(vacio())
    expect(leerCarrito(btoa(JSON.stringify({ v: 1, i: [{ o: 'x', c: 1 }, { o: A, c: 99 }] }))).i).toEqual([{ o: A, c: MAX_CANTIDAD }])
  })

  it('suma, cambia cantidades, guarda para después y quita', () => {
    let c = agregar(vacio(), A)
    c = agregar(c, A, 2)
    expect(c.i).toEqual([{ o: A, c: 3 }])
    c = agregar(c, B)
    c = paraDespues(c, B, true)
    expect(unidades(c)).toBe(3)
    expect(guardados(c).map((x) => x.o)).toEqual([B])
    c = agregar(c, B) // agregar algo guardado lo devuelve al carrito
    expect(enCarrito(c).map((x) => x.o)).toEqual([A, B])
    c = cambiarCantidad(c, A, 0)
    expect(c.i[0].c).toBe(1)
    expect(quitar(c, A).i.map((x) => x.o)).toEqual([B])
  })

  it('al iniciar sesión se fusiona con el de la cuenta', () => {
    const invitado = conCupon(agregar(agregar(vacio(), A, 2), B), 'PUENTE')
    const cuenta = paraDespues(agregar(agregar(vacio(), A, 9), B), B, true)
    const r = fusionar(invitado, cuenta)
    expect(r.i).toEqual([{ o: A, c: MAX_CANTIDAD }, { o: B, c: 2 }])
    expect(r.cupon).toBe('PUENTE')
  })
})

describe('datos de entrega por país', async () => {
  const { validarDatos, direccionEnUnaLinea } = await import('@/lib/compra/direccion')
  const contacto = { nombre: 'Lucía Benítez', email: 'lucia@ejemplo.com.py', telefono: '0981 000 000' }

  it('para retirar en el local alcanzan nombre, correo y teléfono', () => {
    expect(validarDatos('PY', 'retiro', contacto).ok).toBe(true)
    const r = validarDatos('PY', 'retiro', { ...contacto, email: 'lucia@', telefono: '12' })
    expect(r.ok ? {} : r.errores).toEqual({ email: 'email', telefono: 'telefono' })
  })

  it('en Paraguay pide ciudad, barrio y calle (la referencia es opcional)', () => {
    const r = validarDatos('PY', 'domicilio', { ...contacto, ciudad: 'Ciudad del Este', direccion: "Pa'i Pérez 450" })
    expect(r.ok ? {} : r.errores).toEqual({ zona: 'requerido' })
    const ok = validarDatos('PY', 'domicilio', { ...contacto, ciudad: 'Ciudad del Este', zona: 'San José', direccion: "Pa'i Pérez 450", referencia: 'Casa de rejas verdes' })
    expect(ok.ok).toBe(true)
    expect(direccionEnUnaLinea('PY', ok.datos)).toBe("Pa'i Pérez 450, San José, Ciudad del Este, Casa de rejas verdes")
  })

  it('en Brasil valida el CEP de 8 dígitos y el estado de 2 letras, y los normaliza', () => {
    const malo = validarDatos('BR', 'domicilio', { ...contacto, codigo: '8585', zona: 'Paraná', ciudad: 'Foz do Iguaçu', direccion: 'Av. JK 100' })
    expect(malo.ok ? {} : malo.errores).toEqual({ codigo: 'codigo', zona: 'zona' })
    const bien = validarDatos('BR', 'domicilio', { ...contacto, codigo: '85851000', zona: 'pr', ciudad: 'Foz do Iguaçu', direccion: 'Av. JK 100' })
    expect(bien.ok && bien.datos).toMatchObject({ codigo: '85851-000', zona: 'PR' })
  })

  it('en Argentina acepta el código postal de 4 dígitos o el CPA', () => {
    const base = { ...contacto, zona: 'Misiones', ciudad: 'Puerto Iguazú', direccion: 'Av. Victoria Aguirre 320' }
    expect(validarDatos('AR', 'domicilio', { ...base, codigo: '3370' }).ok).toBe(true)
    expect(validarDatos('AR', 'domicilio', { ...base, codigo: 'N3370ABC' }).ok).toBe(true)
    expect(validarDatos('AR', 'domicilio', { ...base, codigo: '33700' }).ok).toBe(false)
  })
})
