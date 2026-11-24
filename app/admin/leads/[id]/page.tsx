import { Metadata } from 'next';
import LeadDetalleClient from '@/components/admin/LeadDetalleClient';
import LeadCrmLink from '@/components/crm/LeadCrmLink';
import { requireAdminAreaRead } from '@/lib/admin-area-auth';
import prisma from '@/lib/prisma';

export const metadata: Metadata = {
  title: 'Detalle Lead | Admin',
};

export default async function LeadDetallePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminAreaRead('admin.leads', ['MARKETING', 'VENTAS']);
  const { id } = await params;
  const lead = await prisma.leadMigracionWeb.findUnique({
    where: { id },
    select: { id: true, crmContactoId: true },
  });
  return (
    <>
      {lead && <div className="px-4 pt-4 sm:px-6"><LeadCrmLink tipo="MIGRACION" id={lead.id} contactoId={lead.crmContactoId} /></div>}
      <LeadDetalleClient leadId={id} />
    </>
  );
}
