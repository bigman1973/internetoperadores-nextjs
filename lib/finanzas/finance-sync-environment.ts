export type FinanceSyncKind = 'onedrive' | 'isp';
export type FinanceSyncInput = Readonly<{
  oneDriveSyncEnabled?: string;
  ispSyncEnabled?: string;
}>;

/** Sin valor por defecto: cualquier sync queda bloqueado hasta una autorización explícita. */
export function financeSyncEnabled(input: FinanceSyncInput, kind: FinanceSyncKind): boolean {
  return kind === 'onedrive' ? input.oneDriveSyncEnabled === '1' : input.ispSyncEnabled === '1';
}
