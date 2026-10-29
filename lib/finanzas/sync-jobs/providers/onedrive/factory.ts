/*
 * Production-only OneDrive provider assembly for the parent P2 factory.
 *
 * Do not invoke this from staging. `p2-service/runtime.createProviderFactory`
 * deliberately returns EmptyStagingProvider before it can call this builder.
 */
import { extraerDatosFactura } from '@/lib/finanzas/ocr-facturas'
import { validarResultadoOcrNuevo } from '@/lib/finanzas/invoice-quality'
import type { PrismaClient } from '@prisma/client'
import { GraphOneDriveReadPort } from './graph-read'
import { createPrismaOneDriveDomain } from './prisma-domain'
import { OneDriveSyncProvider } from './provider'

export type OneDriveEnvironment = Record<string, string | undefined>

/**
 * Returns a real adapter only after the parent runtime factory has established
 * production mode and source flags. It has no staging fallback and never seeds
 * fake data from environment values.
 */
export function createProductionOneDriveProvider(prisma: PrismaClient, env: OneDriveEnvironment) {
  if (env.VERCEL_ENV !== 'production' || env.FINANCE_BACKGROUND_SYNC_ENABLED !== '1' || env.FINANCE_ONEDRIVE_SYNC_ENABLED !== '1') {
    throw new Error('FINANCE_ONEDRIVE_SYNC_DISABLED')
  }
  const read = new GraphOneDriveReadPort({
    credentials: {
      tenantId: env.MICROSOFT_GRAPH_TENANT_ID || '',
      clientId: env.MICROSOFT_GRAPH_CLIENT_ID || '',
      clientSecret: env.MICROSOFT_GRAPH_CLIENT_SECRET || '',
      siteId: env.SHAREPOINT_SITE_ID || '',
      driveId: env.SHAREPOINT_DRIVE_ID || env.DRIVE_ID || '',
    },
  })
  return new OneDriveSyncProvider({
    read,
    domain: createPrismaOneDriveDomain(prisma),
    // This legacy factory does not own the P2 authorization callback. Keeping
    // the hook absent makes controlled confirming sources fail closed here; the
    // production assembly binds the live permission in its fenced transaction.
    // Existing project OCR only; no Manus/built-in model or new model call.
    ocr: { extract: extraerDatosFactura, validateNew: validarResultadoOcrNuevo },
    // Required exact acknowledgement per job scope for legacy null-library rows.
    // Parent service must copy this only from its server-side job scope, never UI.
    historicalLibraryConfirmedDriveId: null,
  })
}
