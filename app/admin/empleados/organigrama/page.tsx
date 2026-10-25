import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import OrganizationChartPanelLoader from '@/components/empleados/OrganizationChartPanelLoader';

export default async function OrganigramaPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/login');
  const role = session.user.role || '';

  return (
    <div className="mx-auto max-w-[1600px]">
      <OrganizationChartPanelLoader isSuperAdmin={role === 'SUPER_ADMIN'} />
    </div>
  );
}
