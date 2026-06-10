import { Metadata } from 'next'
import MigracionAdamoClient from '@/components/admin/MigracionAdamoClient'

export const metadata: Metadata = {
  title: 'Migración ADAMO | Panel Admin',
}

export default function MigracionAdamoPage() {
  return <MigracionAdamoClient />
}
