import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import OrganizationChartPanel from '@/components/empleados/OrganizationChartPanel';

export default async function OrganigramaPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/login');
  const role = session.user.role || '';

  return (
    <div className="mx-auto max-w-[1600px]">
      <OrganizationChartPanel isSuperAdmin={role === 'SUPER_ADMIN'} />
    </div>
  );
}
