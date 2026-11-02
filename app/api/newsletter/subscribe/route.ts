import { NextRequest, NextResponse } from 'next/server';
import { guardarCaptacionWeb } from '@/lib/crm-captacion-web';

const BREVO_API_KEY = (process.env.BREVO_API_KEY || '').trim();

const BREVO_LISTA_EMPRESAS = 30;
const BREVO_LISTA_PARTICULARES = 31;
const BREVO_LISTA_PARTNERS = 32;

/** Añade a Brevo únicamente una suscripción con consentimiento explícito. */
async function addToBrevo(email: string, nombre: string, telefono: string, tipo: string): Promise<boolean> {
  if (!BREVO_API_KEY) return false;

  const listId = tipo === 'partners' ? BREVO_LISTA_PARTNERS : tipo === 'particulares' ? BREVO_LISTA_PARTICULARES : BREVO_LISTA_EMPRESAS;
  const attributes: Record<string, string> = { NOMBRE: nombre };
  if (telefono.trim()) attributes.TELEFONO = telefono.trim();

  try {
    const createRes = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email, attributes, listIds: [listId], updateEnabled: true }),
    });

    if (createRes.ok) return true;

    if (createRes.status === 400) {
      const errData = await createRes.json();
      if (errData.code === 'duplicate_parameter') {
        const addRes = await fetch(`https://api.brevo.com/v3/contacts/lists/${listId}/contacts/add`, {
          method: 'POST',
          headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ emails: [email] }),
        });
        return addRes.ok;
      }
    }

    console.error('[Newsletter] Brevo no ha completado la suscripción:', createRes.status);
    return false;
  } catch {
    console.error('[Newsletter] No se pudo conectar con Brevo');
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'El formulario debe ser un objeto válido' }, { status: 400 });
    }
    const { email, nombre, telefono, tipo } = body;

    if (![email, nombre, telefono, tipo].every(value => value == null || typeof value === 'string')) {
      return NextResponse.json({ error: 'Los campos del formulario deben ser texto' }, { status: 400 });
    }
    if (!email?.trim() || !nombre?.trim()) {
      return NextResponse.json({ error: 'Email y nombre son obligatorios' }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return NextResponse.json({ error: 'El email no es válido' }, { status: 400 });
    }

    const newsletter = body.newsletter === true;
    const privacidad = typeof body.privacidad === 'boolean'
      ? body.privacidad
      : typeof body.acepta === 'boolean' ? body.acepta : null;
    const tipoNewsletter = tipo || 'empresas';

    // El registro local es la fuente de verdad; nunca depende de un proveedor externo.
    const captacion = await guardarCaptacionWeb(request, {
      formulario: '/api/newsletter/subscribe',
      segmentoCrm: tipoNewsletter === 'partners' ? 'PARTNER' : tipoNewsletter === 'particulares' ? 'PARTICULAR' : 'EMPRESA',
      nombre,
      email,
      telefono: telefono || undefined,
      datos: { nombre, email, telefono: telefono || null, tipo: tipoNewsletter },
      newsletter,
      privacidad,
    });

    const resultadoLocal = {
      success: true,
      contactId: captacion.contactoId,
      contactoId: captacion.contactoId,
      captacionId: captacion.captacionId,
      repetido: captacion.repetido,
      newsletter,
    };

    // Una repetición devuelve los mismos identificadores sin nuevas acciones externas.
    if (captacion.repetido) return NextResponse.json({ ...resultadoLocal, brevo: false });

    const brevo = newsletter
      ? await addToBrevo(email, nombre, telefono || '', tipoNewsletter)
      : false;
    return NextResponse.json({ ...resultadoLocal, brevo });
  } catch {
    // No registrar el error bruto: puede contener datos personales de la solicitud.
    console.error('[Newsletter] Error al guardar la captación local');
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
