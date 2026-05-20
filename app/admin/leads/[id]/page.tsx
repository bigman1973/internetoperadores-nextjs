import { Metadata } from 'next';
import LeadDetalleClient from '@/components/admin/LeadDetalleClient';

export const metadata: Metadata = {
  title: 'Detalle Lead | Admin',
};

export default async function LeadDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LeadDetalleClient leadId={id} />;
}
