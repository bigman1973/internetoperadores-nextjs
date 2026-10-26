import { assistantPublicEnabled } from '@/lib/asistente/public-flag'
import AssistantLauncher from './AssistantLauncher'

/** Punto de montaje de servidor: no hidrata ni carga el launcher si el asistente público está apagado. */
export default function AssistantMount() {
  if (!assistantPublicEnabled()) return null
  return <AssistantLauncher />
}
