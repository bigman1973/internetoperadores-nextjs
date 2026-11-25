'use client'

import { useState } from 'react'
import type { UsersProposal, UsersSnapshot } from '@/lib/area4/users-contract'
import Dialog from './Dialog'
import { ChangesTable } from './Tables'

export default function ApplyDialog({ snapshot, proposal, busy, error, onClose, onApply }: {
  snapshot: UsersSnapshot; proposal: UsersProposal; busy: boolean; error: string;
  onClose: () => void; onApply: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false)
  const changes = proposal.rows.filter(row => row.changes)
  const blocked = changes.filter(row => row.blockedReason)
  return <Dialog title="Confirmar cambios de usuarios y permisos" onClose={onClose} busy={busy} wide>
    <div className="note"><b>Revisión del servidor preparada.</b> Se aplicarán únicamente los borradores de esta revisión, con comprobación de concurrencia. Revisa todas las pérdidas y ganancias por acción, los roles y las activaciones o desactivaciones.</div>
    <p className="small muted">Destino: <b>{snapshot.environmentLabel}</b> · {changes.length} personas con cambios · revisión <span className="mono">{proposal.revision}</span></p>
    {snapshot.warnings.map((warning, index) => <p className="small muted" key={index}>{warning}</p>)}
    <ChangesTable snapshot={snapshot} rows={proposal.rows} drafts={proposal.drafts} />
    {!snapshot.applyingAllowed && <p className="area4-error">Aplicación deshabilitada en este entorno. En producción, solo publicación autorizada con copia previa e informe.</p>}
    {blocked.length > 0 && <div className="area4-error" role="alert"><p>No se puede aplicar el lote: contiene cambios bloqueados por los contratos vivos.</p><ul>{blocked.map(row => <li key={row.userId}>{row.name}: {row.blockedReason}</li>)}</ul></div>}
    <label className="chk area4-confirmation"><input type="checkbox" checked={confirmed} disabled={busy || blocked.length > 0 || !snapshot.applyingAllowed} onChange={event => setConfirmed(event.target.checked)} />Confirmo que he revisado todas las pérdidas, ganancias, cambios de rol y cambios de estado de esta revisión. Las cuentas protegidas no se modificarán.</label>
    {error && <p className="area4-error" role="alert">{error}</p>}
    <div className="row area4-buttons"><button className="btn" type="button" disabled={busy} onClick={onClose}>Cancelar, conservar borrador</button><button className="btn primary" type="button" disabled={busy || !confirmed || !snapshot.applyingAllowed || blocked.length > 0 || !changes.length} onClick={onApply}>{busy ? 'Aplicando…' : 'Confirmar y aplicar esta revisión'}</button></div>
  </Dialog>
}
