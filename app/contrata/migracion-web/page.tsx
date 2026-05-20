import { Metadata } from 'next';
import MigracionWebFormulario from './MigracionWebFormulario';

export const metadata: Metadata = {
  title: 'Migración Web Profesional | Internet Operadores',
  description: 'Moderniza tu web WordPress con tecnología de última generación. Solicita tu auditoría web gratuita y recibe una propuesta personalizada.',
};

export default function MigracionWebPage() {
  return <MigracionWebFormulario />;
}
