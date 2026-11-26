// Comparación de vendedores (lib/ofertas.ts): desempate por entrega y etiqueta "Más barato" sin empates.
import { describe, expect, it } from 'vitest'
import { masBarata, ordenarOfertas } from '@/lib/ofertas'

const o = (id: string, precio: number, preparacionH: number, stock = 10, recomendacion = 90) => ({ id, precio, preparacionH, stock, recomendacion })

describe('ordenarOfertas', () => {
  it('ordena por precio', () => {
    const r = ordenarOfertas([o('a', 140_000, 2), o('b', 132_000, 48), o('c', 150_000, 1)])
    expect(r.map((x) => x.id)).toEqual(['b', 'a', 'c'])
  })

  it('con el mismo precio gana la entrega más rápida', () => {
    const r = ordenarOfertas([o('lenta', 132_000, 48), o('rapida', 132_000, 3), o('cara', 140_000, 1)])
    expect(r.map((x) => x.id)).toEqual(['rapida', 'lenta', 'cara'])
  })

  it('si también empata la entrega, gana la tienda mejor recomendada', () => {
    const r = ordenarOfertas([o('a', 132_000, 3, 5, 91), o('b', 132_000, 3, 5, 98)])
    expect(r.map((x) => x.id)).toEqual(['b', 'a'])
  })

  it('no cambia el arreglo original', () => {
    const lista = [o('a', 2, 1), o('b', 1, 1)]
    ordenarOfertas(lista)
    expect(lista.map((x) => x.id)).toEqual(['a', 'b'])
  })
})

describe('masBarata', () => {
  it('marca a la única más barata', () => {
    expect(masBarata([o('a', 140_000, 2), o('b', 132_000, 48)])?.id).toBe('b')
  })

  it('no marca a nadie si hay empate de precio, aunque una entregue antes', () => {
    expect(masBarata([o('lenta', 132_000, 48), o('rapida', 132_000, 3), o('cara', 140_000, 1)])).toBeNull()
  })

  it('compara solo las que tienen stock', () => {
    // la más barata está agotada: la etiqueta va a la siguiente si es única
    expect(masBarata([o('agotada', 120_000, 2, 0), o('b', 132_000, 3), o('c', 140_000, 1)])?.id).toBe('b')
    // y si la agotada era la que desempataba, sigue habiendo empate entre las disponibles
    expect(masBarata([o('agotada', 120_000, 2, 0), o('b', 132_000, 3), o('c', 132_000, 1)])).toBeNull()
  })

  it('con una sola oferta disponible no hay con quién comparar', () => {
    expect(masBarata([o('a', 132_000, 3)])).toBeNull()
    expect(masBarata([o('a', 132_000, 3), o('b', 120_000, 3, 0)])).toBeNull()
  })
})
