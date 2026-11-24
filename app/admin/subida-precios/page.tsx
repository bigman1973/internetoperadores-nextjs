import { requireSubidaPage } from '@/lib/subida-precios/auth';
import { datasetDisponible } from '@/lib/subida-precios/data';
import SubidaClient from './SubidaClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function SubidaPreciosPage() {
  const auth = await requireSubidaPage();
  const listo = await datasetDisponible();
  return <SubidaClient puedeAprobar={auth.puedeAprobar} rol={auth.rol} migracionLista={listo} />;
}
