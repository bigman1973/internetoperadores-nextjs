import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const HUBSPOT_API_KEY = (process.env.HUBSPOT_API_KEY || '').trim();
const HUBSPOT_BASE = 'https://api.hubapi.com';
const PIPELINE_NAME = 'IO-mantenimiento IT';

// Mapeo de estados internos a etapas de HubSpot
const ESTADO_TO_STAGE: Record<string, string> = {
  NUEVO: 'Lead nuevo',
  EN_PROCESO: 'Propuesta enviada',
  CUESTIONARIO_COMPLETADO: 'Cuestionario completado',
  PRESUPUESTO_ENVIADO: 'Oferta precio cerrado',
  PROPUESTA_PREACEPTADA: 'Propuesta pre-aceptada',
  REUNION_AGENDADA: 'Reunión/Visita agendada',
  CONTRATO_FIRMADO: 'Ganado',
  GANADO: 'Ganado',
  PERDIDO: 'Perdido',
};

async function getPipelineId(): Promise<{ pipelineId: string; stages: any[] } | null> {
  const res = await fetch(`${HUBSPOT_BASE}/crm/v3/pipelines/deals`, {
    headers: { Authorization: `Bearer ${HUBSPOT_API_KEY}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const pipeline = data.results?.find((p: any) => p.label === PIPELINE_NAME);
  if (!pipeline) return null;
  return { pipelineId: pipeline.id, stages: pipeline.stages };
}

// POST: Crear o actualizar deal en HubSpot
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  if (!HUBSPOT_API_KEY) {
    return NextResponse.json({ error: 'HUBSPOT_API_KEY no configurada' }, { status: 500 });
  }

  try {
    const { id } = await params;
    const lead = await prisma.leadSolucion.findUnique({ where: { id } });
    if (!lead) {
      return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 });
    }

    const datos = lead.datos as any;
    const oferta = datos?.ofertaGenerada;

    // Obtener pipeline
    const pipelineInfo = await getPipelineId();
    if (!pipelineInfo) {
      return NextResponse.json({ error: 'Pipeline IO-mantenimiento IT no encontrado en HubSpot. Créelo primero.' }, { status: 400 });
    }

    // Determinar stage
    const stageLabel = ESTADO_TO_STAGE[lead.estado] || 'Lead nuevo';
    const stage = pipelineInfo.stages.find((s: any) => s.label === stageLabel);
    if (!stage) {
      return NextResponse.json({ error: `Stage "${stageLabel}" no encontrado en el pipeline` }, { status: 400 });
    }

    // Calcular amount - priorizar propuesta económica cerrada sobre estimación de rango
    let amount = '';
    if (datos?.propuestaEconomica?.totalAnualEstimado) {
      amount = String(Math.round(datos.propuestaEconomica.totalAnualEstimado));
    } else if (datos?.propuestaEconomica?.totalMensual) {
      amount = String(Math.round(datos.propuestaEconomica.totalMensual * 12));
    } else if (oferta?.estimacionRango) {
      const avg = ((oferta.estimacionRango.min || 0) + (oferta.estimacionRango.max || 0)) / 2;
      amount = String(Math.round(avg * 12)); // Valor anual
    }

    const dealProperties: any = {
      dealname: `MIT - ${lead.empresa}`,
      pipeline: pipelineInfo.pipelineId,
      dealstage: stage.id,
      amount,
      description: `Lead Mantenimiento IT: ${lead.empresa}\nContacto: ${lead.nombre} (${lead.email})\nTipo: ${datos?.tipoNegocio || 'Mediana/Grande'}\nEquipos: ${datos?.numEquipos || 'N/A'}\nServidores: ${datos?.numServidores || 'N/A'}`,
    };

    // Verificar si ya tiene un deal creado
    if (datos?.hubspotDealId) {
      // Actualizar deal existente
      const updateRes = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/deals/${datos.hubspotDealId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${HUBSPOT_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ properties: dealProperties }),
      });

      if (!updateRes.ok) {
        const err = await updateRes.json();
        return NextResponse.json({ error: 'Error actualizando deal', details: err }, { status: 500 });
      }

      return NextResponse.json({ success: true, action: 'updated', dealId: datos.hubspotDealId });
    }

    // Crear nuevo deal
    const createRes = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/deals`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HUBSPOT_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ properties: dealProperties }),
    });

    if (!createRes.ok) {
      const err = await createRes.json();
      return NextResponse.json({ error: 'Error creando deal', details: err }, { status: 500 });
    }

    const deal = await createRes.json();

    // Guardar dealId en el lead
    const datosActualizados = { ...datos, hubspotDealId: deal.id };
    await prisma.leadSolucion.update({
      where: { id },
      data: { datos: datosActualizados },
    });

    // Intentar asociar contacto si existe en HubSpot
    try {
      const searchRes = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/contacts/search`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${HUBSPOT_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filterGroups: [{
            filters: [{ propertyName: 'email', operator: 'EQ', value: lead.email }],
          }],
        }),
      });

      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.total > 0) {
          const contactId = searchData.results[0].id;
          await fetch(`${HUBSPOT_BASE}/crm/v3/objects/deals/${deal.id}/associations/contacts/${contactId}/deal_to_contact`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${HUBSPOT_API_KEY}` },
          });
        }
      }
    } catch {
      // No es crítico si falla la asociación
    }

    return NextResponse.json({ success: true, action: 'created', dealId: deal.id });
  } catch (error: any) {
    console.error('[HUBSPOT-DEAL] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
