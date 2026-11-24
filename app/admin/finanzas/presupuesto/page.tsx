import { requireFinPage } from '@/lib/impuestos/auth';
import PresupuestoClient from './PresupuestoClient';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Presupuesto 2027 · Internet Operadores' };
export default async function PresupuestoPage() {
  const auth = await requireFinPage('presupuesto');
  return <PresupuestoClient puedeEditar={auth.puedeEditar} puedeAprobar={auth.puedeAprobar} />;
}
