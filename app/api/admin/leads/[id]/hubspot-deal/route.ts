import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const HUBSPOT_API_KEY = (process.env.HUBSPOT_API_KEY || '').trim();
const PIPELINE_ID = '3908836560'; // IO-MIGRACION WEB

// Mapeo de estados del lead a stages del pipeline
const ESTADO_TO_STAGE: Record<string, string> = {
  NUEVO: '5574400206',
  EN_REVISION: '5574400207',
  AUDITORIA_ENVIADA: '5574400208',
  CUESTIONARIO_ENVIADO: '5574400208',
  CUESTIONARIO_COMPLETADO: '5574400209',
  PROPUESTA_ENVIADA: '5574400210',
  CERRADO_GANADO: '5574400212',
  CERRADO_PERDIDO: '5574400213',
  DESCARTADO: '5574400213',
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!HUBSPOT_API_KEY) {
      return NextResponse.json({ success: false, error: 'HUBSPOT_API_KEY no configurada' }, { status: 500 });
    }

    const lead = await prisma.leadMigracionWeb.findUnique({ where: { id } });
    if (!lead) {
      return NextResponse.json({ success: false, error: 'Lead no encontrado' }, { status: 404 });
    }

    const stageId = ESTADO_TO_STAGE[lead.estado] || ESTADO_TO_STAGE['NUEVO'];

    // Calcular amount basado en presupuesto
    let amount = 0;
    if (lead.presupuesto) {
      const match = lead.presupuesto.match(/(\d[\d.]*)/);
      if (match) amount = parseFloat(match[1].replace('.', ''));
      // Para rangos, usar el valor medio
      if (lead.presupuesto.includes('3.000 - 6.000')) amount = 4500;
      else if (lead.presupuesto.includes('6.000 - 12.000')) amount = 9000;
      else if (lead.presupuesto.includes('Más de 12.000')) amount = 15000;
      else if (lead.presupuesto.includes('Menos de 3.000')) amount = 2000;
    }

    const dealName = `Migración Web - ${lead.nombreEmpresa}`;

    // Buscar contacto en HubSpot
    const searchRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
      method: 'POST',
      headers: { Authorization: `Bearer ${HUBSPOT_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: lead.email }] }],
      }),
    });
    const searchData = await searchRes.json();
    const contactId = searchData.results?.[0]?.id;

    // Buscar deal existente por nombre
    const dealSearchRes = await fetch('https://api.hubapi.com/crm/v3/objects/deals/search', {
      method: 'POST',
      headers: { Authorization: `Bearer ${HUBSPOT_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filterGroups: [{ filters: [{ propertyName: 'dealname', operator: 'EQ', value: dealName }] }],
      }),
    });
    const dealSearchData = await dealSearchRes.json();
    const existingDeal = dealSearchData.results?.[0];

    if (existingDeal) {
      // Actualizar deal existente
      await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${existingDeal.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${HUBSPOT_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          properties: {
            dealstage: stageId,
            amount: amount.toString(),
            pipeline: PIPELINE_ID,
          },
        }),
      });
      return NextResponse.json({ success: true, dealId: existingDeal.id, created: false });
    }

    // Crear nuevo deal
    const dealBody: any = {
      properties: {
        dealname: dealName,
        pipeline: PIPELINE_ID,
        dealstage: stageId,
        amount: amount.toString(),
        description: `Lead migración web: ${lead.nombreEmpresa}\nSector: ${lead.sector || 'N/A'}\nPresupuesto: ${lead.presupuesto || 'N/A'}`,
      },
    };

    // Asociar al contacto si existe
    if (contactId) {
      dealBody.associations = [{
        to: { id: contactId },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }],
      }];
    }

    const createRes = await fetch('https://api.hubapi.com/crm/v3/objects/deals', {
      method: 'POST',
      headers: { Authorization: `Bearer ${HUBSPOT_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(dealBody),
    });

    if (!createRes.ok) {
      const err = await createRes.json();
      return NextResponse.json({ success: false, error: err.message || 'Error al crear deal' }, { status: 500 });
    }

    const dealData = await createRes.json();
    return NextResponse.json({ success: true, dealId: dealData.id, created: true });
  } catch (error: any) {
    console.error('Error HubSpot deal migración:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
