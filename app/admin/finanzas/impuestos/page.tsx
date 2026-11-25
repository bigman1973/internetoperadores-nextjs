import { notFound } from 'next/navigation';
import { extrasProduccionCerrados } from '@/lib/produccion-disponibilidad';
import { requireFinPage } from '@/lib/impuestos/auth';
import ImpuestosClient from './ImpuestosClient';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Impuestos · Internet Operadores' };
export default async function ImpuestosPage() {
  if (extrasProduccionCerrados()) notFound();
  const auth = await requireFinPage('impuestos');
  return <ImpuestosClient puedeEditar={auth.puedeEditar} />;
}
