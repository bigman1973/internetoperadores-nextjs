import type { PrismaClient } from '@prisma/client'
import { isArea4Owner, type Area4Principal } from './policy'

export type Area4MenuPresentation = 'historico' | 'agrupado'

export type Area4MenuConfiguration = Readonly<{
  menuAgrupadoParaPropietario: boolean
  menuAgrupadoParaTodos: boolean
}>

export const AREA4_MENU_CONFIGURATION_ID = 'global'
const DISABLED: Area4MenuConfiguration = Object.freeze({
  menuAgrupadoParaPropietario: false,
  menuAgrupadoParaTodos: false,
})

export function resolveArea4MenuPresentation(
  config: Area4MenuConfiguration | null | undefined,
  principal: Area4Principal,
): Area4MenuPresentation {
  if (!config) return 'historico'
  if (config.menuAgrupadoParaTodos) return 'agrupado'
  return config.menuAgrupadoParaPropietario && isArea4Owner(principal) ? 'agrupado' : 'historico'
}

/** La tabla puede no existir antes de aplicar la migración: se conserva el menú histórico. */
export async function readArea4MenuConfiguration(
  database: Pick<PrismaClient, 'configuracionPanelArea4'>,
): Promise<Area4MenuConfiguration> {
  try {
    const config = await database.configuracionPanelArea4.findUnique({
      where: { id: AREA4_MENU_CONFIGURATION_ID },
      select: { menuAgrupadoParaPropietario: true, menuAgrupadoParaTodos: true },
    })
    return config || DISABLED
  } catch {
    return DISABLED
  }
}
