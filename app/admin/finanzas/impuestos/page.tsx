import { requireFinPage } from '@/lib/impuestos/auth';
import ImpuestosClient from './ImpuestosClient';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Impuestos · Internet Operadores' };
export default async function ImpuestosPage() {
  const auth = await requireFinPage('impuestos');
  return <ImpuestosClient puedeEditar={auth.puedeEditar} />;
}
