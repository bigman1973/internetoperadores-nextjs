import type { Area4MenuGroup } from './section-registry'

export type ApprovedRoleKey = 'superadmin' | 'gerente' | 'contabilidad' | 'comercial' | 'draxton' | 'empleado'
export type ActionLetter = 'V' | 'E' | 'C' | 'X'
export type PermissionMap = Record<string, string>
export type ApprovedRole = { key: ApprovedRoleKey; name: string; description: string; permissions: PermissionMap }
export type UsersSection = { key: string; label: string; group: Area4MenuGroup; codes: string[] }
export type UsersPerson = {
  id: number; name: string; email: string; active: boolean; lastAccess: string | null;
  currentRoleLabel: string; role: ApprovedRoleKey; extras: PermissionMap;
  current: PermissionMap; next: PermissionMap; protected: boolean; protectionReason?: string;
}
export type PermissionDifference = { section: string; label: string; lost: string; gained: string }
export type UsersDraft = { userId: number; role: ApprovedRoleKey; extras: PermissionMap; active: boolean }
export type UsersProposalRow = {
  userId: number; name: string; currentRoleLabel: string; role: ApprovedRoleKey;
  extras: PermissionMap; active: boolean; differences: PermissionDifference[];
  changes: boolean; blockedReason?: string;
}
export type UsersProposal = { revision: string; drafts: UsersDraft[]; rows: UsersProposalRow[] }
export type UsersSnapshot = {
  users: UsersPerson[]; roles: ApprovedRole[]; sections: UsersSection[];
  proposal: UsersProposal; applyingAllowed: boolean; environmentLabel: string;
  warnings: string[];
}
export type UsersAuditEvent = {
  id: string; createdAt: string; operation: string; actorName: string;
  targetUserId: number | null; targetName: string | null; detail: string;
}
