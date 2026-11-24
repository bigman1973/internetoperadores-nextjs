import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { esRevisor } from '@/lib/area5/core';
import GastosNominasClient from '@/components/area5/GastosNominasClient';

export const dynamic = 'force-dynamic';

/** Revisión de gastos, cierre mensual y cuadre con nóminas. Solo David y Víctor (no por rol: Lorena no entra). */
export default async function GastosNominasPage() {
  const session: any = await getServerSession(authOptions);
  if (!esRevisor(session?.user?.email) || session?.impersonation) redirect('/admin');
  return <GastosNominasClient />;
}
