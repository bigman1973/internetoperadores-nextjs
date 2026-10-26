import { Metadata } from 'next';
import LeadsWorkspace from '@/components/admin/LeadsWorkspace';

export const metadata: Metadata = {
  title: 'Leads | Admin',
};

export default function LeadsPage() {
  return <LeadsWorkspace />;
}
