import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const BREVO_API_KEY = (process.env.BREVO_API_KEY || '').trim();

async function sendBrevoEmail(to: { email: string; name: string }, subject: string, htmlContent: string) {
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Internet Operadores', email: 'noreply@internetoperadores.com' },
        to: [to],
        subject,
        htmlContent,
      }),
    });
    return res.ok;
  } catch { return false; }
}

// Este endpoint se ejecuta cada 6 horas via Vercel Cron
// Busca leads del formulario rápido creados hace más de 48h
// que NO han completado el wizard (sector es null = no pasaron del paso 1)
// y que NO se les ha enviado recordatorio todavía
export async function GET(request: NextRequest) {
  try {
    // Verificar que viene del cron de Vercel (seguridad)
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Buscar leads del formulario rápido:
    // - Creados hace más de 48h
    // - Creados hace menos de 7 días (no enviar recordatorios a leads muy antiguos)
    // - Que NO han completado el wizard (sector es null = solo rellenaron paso 1)
    // - Que NO se les ha enviado recordatorio
    // - Origen: formulario rápido
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const leadsParaRecordar = await prisma.leadMigracionWeb.findMany({
      where: {
        origenFormulario: 'rapido',
        createdAt: {
          lt: fortyEightHoursAgo,
          gt: sevenDaysAgo,
        },
        sector: null, // No completó el wizard (el wizard rellena sector en paso 2)
        recordatorioEnviado: null,
        estado: 'NUEVO', // Solo leads que no han sido gestionados manualmente
      },
      take: 20, // Máximo 20 por ejecución para no saturar
    });

    if (leadsParaRecordar.length === 0) {
      return NextResponse.json({ message: 'No hay leads pendientes de recordatorio', count: 0 });
    }

    let enviados = 0;

    for (const lead of leadsParaRecordar) {
      // Construir URL del wizard con datos pre-rellenados
      const wizardParams = new URLSearchParams();
      if (lead.nombreEmpresa) wizardParams.set('empresa', lead.nombreEmpresa);
      if (lead.contacto) wizardParams.set('contacto', lead.contacto);
      if (lead.email) wizardParams.set('email', lead.email);
      if (lead.telefono) wizardParams.set('telefono', lead.telefono);
      if (lead.urlWebActual) wizardParams.set('url', lead.urlWebActual);
      const wizardUrl = `https://www.internetoperadores.com/contrata/migracion-web?${wizardParams.toString()}`;

      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1a1a2e; padding: 20px; text-align: center;">
            <h1 style="color: #f97316; margin: 0; font-size: 20px;">Tu auditoría web está pendiente</h1>
          </div>
          <div style="padding: 24px;">
            <p style="color: #4b5563; line-height: 1.6;">Hola <strong>${lead.contacto}</strong>,</p>
            <p style="color: #4b5563; line-height: 1.6;">Hace unos días solicitaste una <strong>auditoría web gratuita</strong> para <strong>${lead.nombreEmpresa}</strong>. Estamos listos para preparar tu propuesta personalizada, pero necesitamos algunos datos adicionales.</p>
            <p style="color: #4b5563; line-height: 1.6;">Completa este breve cuestionario (3-5 minutos) para que podamos:</p>
            <ul style="color: #4b5563; line-height: 1.8;">
              <li>Analizar tu web actual en profundidad</li>
              <li>Preparar un presupuesto ajustado a tus necesidades</li>
              <li>Proponerte un cronograma realista</li>
            </ul>
            <div style="text-align: center; margin: 28px 0;">
              <a href="${wizardUrl}" style="display: inline-block; background: #f97316; color: white; padding: 16px 36px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">Completar cuestionario</a>
            </div>
            <p style="color: #9ca3af; font-size: 13px; text-align: center;">Solo te llevará 3-5 minutos. Tus datos ya están pre-rellenados.</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
            <p style="color: #4b5563; line-height: 1.6;">Si prefieres que te llamemos nosotros, responde a este email o llámanos al <strong>900 730 034</strong>.</p>
            <p style="color: #4b5563;">Un saludo,<br/><strong>Equipo de Internet Operadores</strong></p>
          </div>
          <div style="background: #f9fafb; padding: 12px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="margin: 0; color: #9ca3af; font-size: 12px;">Internet Operadores © 2026 — Si no deseas recibir más comunicaciones, responde con "BAJA".</p>
          </div>
        </div>
      `;

      const sent = await sendBrevoEmail(
        { email: lead.email, name: lead.contacto },
        `${lead.contacto}, tu auditoría web está pendiente - Internet Operadores`,
        emailHtml
      );

      if (sent) {
        // Marcar como recordatorio enviado
        await prisma.leadMigracionWeb.update({
          where: { id: lead.id },
          data: { recordatorioEnviado: new Date() },
        });
        enviados++;
      }
    }

    // Notificar a Victor si hay recordatorios enviados
    if (enviados > 0) {
      const resumenHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1a1a2e; padding: 20px; text-align: center;">
            <h1 style="color: #f97316; margin: 0; font-size: 18px;">Recordatorios de Auditoría Web enviados</h1>
          </div>
          <div style="padding: 20px;">
            <p>Se han enviado <strong>${enviados} recordatorio(s)</strong> a leads que solicitaron auditoría web hace más de 48h pero no completaron el cuestionario detallado.</p>
            <ul>
              ${leadsParaRecordar.slice(0, enviados).map(l => `<li><strong>${l.nombreEmpresa}</strong> (${l.contacto}) — ${l.email}</li>`).join('')}
            </ul>
            <p>Si alguno no responde en las próximas 24-48h, sería bueno llamarlos directamente.</p>
            <p><a href="https://www.internetoperadores.com/admin/leads" style="background: #f97316; color: white; padding: 8px 16px; text-decoration: none; border-radius: 5px;">Ver leads en el panel</a></p>
          </div>
        </div>
      `;

      await sendBrevoEmail(
        { email: 'victor@internetoperadores.com', name: 'Victor' },
        `[Cron] ${enviados} recordatorio(s) de auditoría web enviados`,
        resumenHtml
      );
    }

    return NextResponse.json({
      message: `Recordatorios enviados: ${enviados}/${leadsParaRecordar.length}`,
      count: enviados,
    });
  } catch (error: any) {
    console.error('Error en cron recordatorio-wizard:', error);
    return NextResponse.json(
      { error: 'Error interno', details: error.message },
      { status: 500 }
    );
  }
}
