import {
  AREA4_GROUPED_MENU, AREA4_HISTORICAL_MENU, AREA4_MENU_GROUP_METADATA,
  area4EasyMenu, area4RegisteredSurface, area4SectionByKey, type Area4MenuItem,
} from '@/lib/area4/section-registry'

export type FinanceEnvironment = 'staging' | 'production' | null
export type SidebarPresentation = 'historico' | 'agrupado'

export type SidebarIconName =
  | 'academicCap' | 'arrowPath' | 'arrowTrendingUp' | 'arrowsRightLeft'
  | 'banknotes' | 'bookOpen' | 'briefcase' | 'buildingLibrary' | 'buildingOffice'
  | 'calendarDays' | 'calculator' | 'chartBar' | 'chatBubbleLeftEllipsis' | 'chatBubbleLeftRight'
  | 'circleStack' | 'clipboardDocumentList' | 'cloudArrowUp' | 'clock' | 'cog' | 'creditCard'
  | 'documentDuplicate' | 'documentText' | 'folder' | 'globeAlt' | 'home' | 'inboxStack'
  | 'lightBulb' | 'link' | 'megaphone' | 'queueList' | 'receiptPercent' | 'rocketLaunch'
  | 'shieldCheck' | 'signal' | 'sparkles' | 'sun' | 'user' | 'userGroup' | 'users' | 'wrenchScrewdriver'

export interface SidebarNavigationItem {
  name: string
  href: string
  icon: SidebarIconName
  section?: string
  exact?: boolean
  collapsible?: boolean
  preserveContainer?: boolean
  /** Canonical href remains metadata only; a denied container never renders a link. */
  containerOnly?: boolean
  subitems?: SidebarNavigationItem[]
}
export interface SidebarNavigationGroup {
  name: string
  icon: SidebarIconName
  section?: string
  children: SidebarNavigationItem[]
}
export type SidebarNavigationEntry = SidebarNavigationItem | SidebarNavigationGroup
export function isSidebarNavigationGroup(entry: SidebarNavigationEntry): entry is SidebarNavigationGroup {
  return 'children' in entry
}

/** Descendants can live outside the canonical parent's URL prefix. */
export function sidebarItemContainsActivePath(item: SidebarNavigationItem, pathname: string): boolean {
  return pathname === item.href || (!item.exact && item.href !== '/admin' && pathname.startsWith(item.href + '/'))
    || (item.subitems || []).some(child => sidebarItemContainsActivePath(child, pathname))
}

function registryItem(item: Area4MenuItem): SidebarNavigationItem {
  const section = area4SectionByKey(item.section)
  if (!section) throw new Error(`Sección no registrada en el menú: ${item.section}`)
  return { name: item.name, href: item.href, icon: item.icon as SidebarIconName, section: section.areaCode,
    ...(item.exact ? { exact: true } : {}),
    ...(item.collapsible ? { collapsible: true } : {}),
    ...(item.preserveContainer ? { preserveContainer: true } : {}),
    subitems: item.subitems?.map(registryItem) }
}
function groupedNavigation(): SidebarNavigationEntry[] {
  return AREA4_MENU_GROUP_METADATA.map(({ name, icon }) => ({ name, icon, section: 'admin',
    children: AREA4_GROUPED_MENU[name].map(registryItem) }))
}
function historicalNavigation(): SidebarNavigationEntry[] {
  return AREA4_HISTORICAL_MENU.map(entry => 'children' in entry
    ? { name: entry.name, icon: entry.icon as SidebarIconName, section: area4SectionByKey(entry.section)?.areaCode,
      children: entry.children.map(registryItem) }
    : registryItem(entry))
}

/** Presentation and availability are projections; neither grants a parent permission. */
export function getSidebarNavigation(
  financeEnvironment: FinanceEnvironment,
  conciliarEnabled = financeEnvironment === 'staging',
  presentation: SidebarPresentation = 'historico',
  /** Explicit server-derived production read-only availability; never an ACL. */
  rentabilidadReadonlyEnabled = false,
): SidebarNavigationEntry[] {
  const adaptItem = (item: SidebarNavigationItem): SidebarNavigationItem | null => {
    if (financeEnvironment !== 'staging' && ['/admin/sistemas', '/admin/finanzas/impuestos', '/admin/finanzas/presupuesto']
      .some(path => item.href === path || item.href.startsWith(path + '/'))) return null
    const match = area4RegisteredSurface(item.href, 'page')
    if (!match) return null
    const availability = match.surface.availability
    const rentabilidadReadonly = item.href === '/admin/rentabilidad' && rentabilidadReadonlyEnabled === true && financeEnvironment !== 'staging'
    if (availability?.stagingOnly && financeEnvironment !== 'staging' && !rentabilidadReadonly) return null
    if (availability?.conciliarOnly && !conciliarEnabled) return null
    if (availability?.needsFinance && financeEnvironment === null) return null
    return { ...item,
      name: rentabilidadReadonly ? 'Rentabilidad · solo lectura'
        : availability?.financeSuffix && financeEnvironment === 'staging' ? `${item.name} · staging` : item.name,
      subitems: item.subitems?.map(adaptItem).filter((child): child is SidebarNavigationItem => child !== null) }
  }
  const base = presentation === 'agrupado' ? groupedNavigation() : historicalNavigation()
  return base.map(entry => !isSidebarNavigationGroup(entry) ? adaptItem(entry)
    : { ...entry, children: entry.children.map(adaptItem).filter((child): child is SidebarNavigationItem => child !== null) })
    .filter((entry): entry is SidebarNavigationEntry => entry !== null)
}

export function getEasyOnlySidebarNavigation(financeEnvironment: FinanceEnvironment, conciliarEnabled = financeEnvironment === 'staging'): SidebarNavigationItem[] {
  return area4EasyMenu(conciliarEnabled).map(registryItem)
}

function filterItem(
  item: SidebarNavigationItem,
  hasAccess: (section: string) => boolean,
  hasSurfaceAccess: (href: string) => boolean,
): SidebarNavigationItem[] {
  const subitems = item.subitems?.flatMap(subitem => filterItem(subitem, hasAccess, hasSurfaceAccess))
  // Opt-in containers retain structure, never convert child V into a parent link.
  if (!hasSurfaceAccess(item.href) || (item.section && !hasAccess(item.section))) {
    if (item.preserveContainer && subitems?.length) return [{ ...item, containerOnly: true, subitems }]
    return subitems || []
  }
  return [{ ...item, subitems }]
}

/** The optional surface-aware evaluator must enforce live owner/assignment/adoption evidence.
 * Without it, new descriptors remain closed even if a broad hasAccess returns true.
 */
export function filterAuthorizedSidebarNavigation(
  financeEnvironment: FinanceEnvironment,
  hasAccess: (section: string) => boolean,
  conciliarEnabled = financeEnvironment === 'staging',
  presentation: SidebarPresentation = 'historico',
  hasSurfaceAccess: (href: string) => boolean = href => area4RegisteredSurface(href, 'page')?.baseline === true,
  rentabilidadReadonlyEnabled = false,
): SidebarNavigationEntry[] {
  return getSidebarNavigation(financeEnvironment, conciliarEnabled, presentation, rentabilidadReadonlyEnabled)
    .flatMap((entry): SidebarNavigationEntry[] => {
      if (!isSidebarNavigationGroup(entry)) return filterItem(entry, hasAccess, hasSurfaceAccess)
      const children = entry.children.flatMap(child => filterItem(child, hasAccess, hasSurfaceAccess))
      return children.length > 0 ? [{ ...entry, children }] : []
    })
}
