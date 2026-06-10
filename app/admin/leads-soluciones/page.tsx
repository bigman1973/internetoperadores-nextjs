import { Metadata } from 'next';
import LeadsSolucionesClient from '@/components/admin/LeadsSolucionesClient';

export const metadata: Metadata = {
  title: 'Leads Soluciones | Admin',
  description: 'Gestión de leads de soluciones empresariales',
};

export default function LeadsSolucionesPage() {
  return <LeadsSolucionesClient />;
}
