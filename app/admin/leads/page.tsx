import { Metadata } from 'next';
import LeadsPageClient from '@/components/admin/LeadsPageClient';

export const metadata: Metadata = {
  title: 'Leads Migración Web | Admin',
};

export default function LeadsPage() {
  return <LeadsPageClient />;
}
