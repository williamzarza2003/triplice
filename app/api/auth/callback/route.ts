// Vuelta de Supabase Auth (enlace del email o Google): cambia el código por la sesión y aplica las preferencias
// guardadas en el perfil. Si el enlace venció o ya se usó, vuelve a /entrar con el aviso.
import { NextResponse, type NextRequest } from 'next/server'
import { alEntrar, perfil } from '@/lib/cuenta/sesion'
import { despuesDeEntrar } from '@/lib/descubrir/servidor'
import { supabaseServidor } from '@/lib/supabase/servidor'

export async function GET(req: NextRequest) {
  const url = req.nextUrl
  const pedido = url.searchParams.get('volver') ?? ''
  const volver = /^\/(es|pt|en)(\/[^/\\]|$)/.test(pedido) && !pedido.includes('//') ? pedido : '/es/cuenta'
  const idioma = volver.slice(1, 3)
  const code = url.searchParams.get('code')
  if (code) {
    const sb = await supabaseServidor()
    const { error } = await sb.auth.exchangeCodeForSession(code)
    if (!error) {
      await alEntrar(await perfil())
      await despuesDeEntrar() // fase 5: vistos de la cookie, favorito pendiente y alertas
      return NextResponse.redirect(new URL(volver, url.origin))
    }
    console.error('Supabase no aceptó el código de acceso', error.message)
  }
  return NextResponse.redirect(new URL(`/${idioma}/entrar?error=enlace&volver=${encodeURIComponent(volver)}`, url.origin))
}
