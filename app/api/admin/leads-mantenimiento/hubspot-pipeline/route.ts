import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const HUBSPOT_API_KEY = (process.env.HUBSPOT_API_KEY || '').trim();
const HUBSPOT_BASE = 'https://api.hubapi.com';

const PIPELINE_NAME = 'IO-mantenimiento IT';
const PIPELINE_STAGES = [
  { label: 'Lead nuevo', displayOrder: 0, metadata: { probability: '0.1' } },
  { label: 'Propuesta enviada', displayOrder: 1, metadata: { probability: '0.2' } },
  { label: 'Cuestionario completado', displayOrder: 2, metadata: { probability: '0.3' } },
  { label: 'Oferta precio cerrado', displayOrder: 3, metadata: { probability: '0.5' } },
  { label: 'Propuesta pre-aceptada', displayOrder: 4, metadata: { probability: '0.7' } },
  { label: 'Reunión/Visita agendada', displayOrder: 5, metadata: { probability: '0.8' } },
  { label: 'Ganado', displayOrder: 6, metadata: { probability: '1.0' } },
  { label: 'Perdido', displayOrder: 7, metadata: { probability: '0.0' } },
];

// GET: Verificar si el pipeline existe
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  if (!HUBSPOT_API_KEY) {
    return NextResponse.json({ error: 'HUBSPOT_API_KEY no configurada' }, { status: 500 });
  }

  try {
    const res = await fetch(`${HUBSPOT_BASE}/crm/v3/pipelines/deals`, {
      headers: { Authorization: `Bearer ${HUBSPOT_API_KEY}` },
    });

    if (!res.ok) {
      const err = await res.json();
      return NextResponse.json({ error: 'Error consultando HubSpot', details: err }, { status: 500 });
    }

    const data = await res.json();
    const pipeline = data.results?.find((p: any) => p.label === PIPELINE_NAME);

    if (pipeline) {
      return NextResponse.json({
        exists: true,
        pipelineId: pipeline.id,
        stages: pipeline.stages,
      });
    }

    return NextResponse.json({ exists: false });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Crear el pipeline en HubSpot
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  if (!HUBSPOT_API_KEY) {
    return NextResponse.json({ error: 'HUBSPOT_API_KEY no configurada' }, { status: 500 });
  }

  try {
    // Verificar si ya existe
    const checkRes = await fetch(`${HUBSPOT_BASE}/crm/v3/pipelines/deals`, {
      headers: { Authorization: `Bearer ${HUBSPOT_API_KEY}` },
    });

    if (checkRes.ok) {
      const checkData = await checkRes.json();
      const existing = checkData.results?.find((p: any) => p.label === PIPELINE_NAME);
      if (existing) {
        return NextResponse.json({
          success: true,
          message: 'Pipeline ya existe',
          pipelineId: existing.id,
          stages: existing.stages,
        });
      }
    }

    // Crear pipeline
    const createRes = await fetch(`${HUBSPOT_BASE}/crm/v3/pipelines/deals`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HUBSPOT_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        label: PIPELINE_NAME,
        displayOrder: 10,
        stages: PIPELINE_STAGES,
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.json();
      return NextResponse.json({ error: 'Error creando pipeline', details: err }, { status: 500 });
    }

    const pipeline = await createRes.json();
    return NextResponse.json({
      success: true,
      message: 'Pipeline creado correctamente',
      pipelineId: pipeline.id,
      stages: pipeline.stages,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
