import type { ApprovedRoleKey } from './users-contract'
export type DashboardRow = { badge: string; tone?: 'g' | 'w' | 'b' | 'a'; title: string; detail: string; href?: string; action?: string }
export type DashboardPoint = { month: string; value: number | null; provisional?: boolean; reliability?: number | null }
export type DashboardCheck = { label: string; detail: string; done: boolean | null; href?: string }
export type DashboardGoal = { label: string; current: number | null; target: number | null; unit?: string }
export type DashboardData = { state: 'ready' | 'empty' | 'unavailable' | 'soon'; message?: string; rows?: DashboardRow[]; points?: DashboardPoint[]; checks?: DashboardCheck[]; goals?: DashboardGoal[] }
export type DashboardBlock = DashboardData & { id: string; sectionKey: string; title: string; help: string; href?: string; chart?: 'money' | 'percent' }
export type DashboardKpi = { id: string; sectionKey: string; label: string; value: string; sub: string; tone?: 'g' | 'w' | 'b' | 'a'; href?: string }
export type DashboardPerson = { id: number; name: string; role: ApprovedRoleKey }
export type DashboardModel = { version: 1; role: ApprovedRoleKey; roleLabel: string; userName: string; greeting: string; dateLabel: string; month: string; owner: boolean; acting: boolean; actorId: number; kpis: DashboardKpi[]; columns: DashboardBlock[][]; notice: string; permissionText: string; viewerId?: number; previewingPerson?: boolean; people?: DashboardPerson[] }
