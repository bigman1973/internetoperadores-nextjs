export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { encode } from 'next-auth/jwt'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.redirect(new URL('/login?error=invalid_link', request.url))
    }

    // Buscar el magic link
    const magicLink = await prisma.magicLink.findUnique({
      where: { token }
    })

    if (!magicLink) {
      return NextResponse.redirect(new URL('/login?error=invalid_link', request.url))
    }

    if (magicLink.used) {
      return NextResponse.redirect(new URL('/login?error=link_used', request.url))
    }

    if (new Date() > magicLink.expiresAt) {
      return NextResponse.redirect(new URL('/login?error=link_expired', request.url))
    }

    // Marcar como usado
    await prisma.magicLink.update({
      where: { id: magicLink.id },
      data: { used: true }
    })

    // Buscar el cliente
    const cliente = await prisma.clienteWeb.findFirst({
      where: { email: magicLink.email, activo: true }
    })

    if (!cliente) {
      return NextResponse.redirect(new URL('/login?error=account_not_found', request.url))
    }

    // Actualizar último acceso
    await prisma.clienteWeb.update({
      where: { id: cliente.id },
      data: { ultimoAcceso: new Date() }
    })

    // Crear JWT token para la sesión
    const secret = process.env.NEXTAUTH_SECRET
    if (!secret) {
      return NextResponse.redirect(new URL('/login?error=config_error', request.url))
    }

    const jwtToken = await encode({
      token: {
        id: cliente.id.toString(),
        email: cliente.email,
        name: cliente.nombre,
        userType: 'cliente',
        sub: cliente.id.toString(),
      },
      secret,
      maxAge: 30 * 24 * 60 * 60, // 30 días
    })

    // Redirigir al panel de cliente con la cookie de sesión
    const response = NextResponse.redirect(new URL('/cliente', request.url))
    
    // Establecer la cookie de sesión de NextAuth
    const cookieName = process.env.NODE_ENV === 'production' 
      ? '__Secure-next-auth.session-token' 
      : 'next-auth.session-token'
    
    response.cookies.set(cookieName, jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 días
    })

    return response

  } catch (error: any) {
    console.error('Error verificando magic link:', error)
    return NextResponse.redirect(new URL('/login?error=verification_failed', request.url))
  }
}
