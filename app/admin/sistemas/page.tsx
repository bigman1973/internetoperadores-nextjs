import { requireSistemasPage } from '@/lib/sistemas/auth';
import { sistemasDisponible } from '@/lib/sistemas/data';
import SistemasClient from './SistemasClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function SistemasPage() {
  await requireSistemasPage();
  const listo = await sistemasDisponible();
  return <SistemasClient migracionLista={listo} />;
}
