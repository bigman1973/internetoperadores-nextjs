import { NextResponse } from 'next/server'
import { Area8InputError } from '@/lib/area8/validation'
import { Area9Error } from './core'
export const area9Headers = { 'Cache-Control': 'private, no-store' }
export function area9Failure(error: unknown) {
  if (error instanceof Area9Error || error instanceof Area8InputError) return NextResponse.json({ error: error.message }, { status: error.status, headers: area9Headers })
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null
  if (code === 'P2034' || code === 'P2002') return NextResponse.json({ error: 'El registro cambió o ya existe. Actualiza y vuelve a comprobarlo.' }, { status: 409, headers: area9Headers })
  if (code === 'P2021' || code === 'P2022' || code === 'P2010') return NextResponse.json({ error: 'El historial no está disponible. El integrador debe comprobar el esquema y las migraciones aplicadas.' }, { status: 503, headers: area9Headers })
  return NextResponse.json({ error: 'No se pudo completar la operación del historial.' }, { status: 500, headers: area9Headers })
}
