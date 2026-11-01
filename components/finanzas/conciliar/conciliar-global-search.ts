'use client'

import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { CONCILIAR_TABS, type ConciliarReadResponse, type ConciliarTab } from './conciliar-contract'

/** Tiempo de espera perceptible pero corto; no hay lectura automática ni fuentes live. */
export const CONCILIAR_SEARCH_DEBOUNCE_MS = 180

export type ConciliarSearchPhase = 'idle' | 'pending' | 'loading' | 'error'
type ConciliarSearchHistoryMode = 'none' | 'push' | 'replace'

/** Vista canónica: la caja y el parámetro q comparten siempre el mismo valor. */
export type ConciliarSearchView = Readonly<{
  tab: ConciliarTab
  query: string
  offset: number
}>

export type ConciliarSearchMachineState = Readonly<{
  view: ConciliarSearchView
  generation: number
  phase: ConciliarSearchPhase
  historyMode: ConciliarSearchHistoryMode
  error: Error | null
}>

export type ConciliarSearchMachineAction =
  | Readonly<{ type: 'INPUT'; query: string }>
  | Readonly<{ type: 'CLEAR' }>
  | Readonly<{ type: 'SUBMIT' }>
  | Readonly<{ type: 'TAB'; tab: ConciliarTab }>
  | Readonly<{ type: 'OFFSET'; offset: number }>
  | Readonly<{ type: 'FILTERS' }>
  | Readonly<{ type: 'HISTORY'; view: ConciliarSearchView }>
  | Readonly<{ type: 'REFRESH' }>
  | Readonly<{ type: 'DEBOUNCE_ELAPSED'; generation: number }>
  | Readonly<{ type: 'RESOLVED'; generation: number }>
  | Readonly<{ type: 'FAILED'; generation: number; error: Error }>

export type ConciliarSearchRead = (
  view: ConciliarSearchView,
  context: Readonly<{ signal: AbortSignal; generation: number }>,
) => Promise<ConciliarReadResponse>

/**
 * Guarda sólo fotos ya autorizadas para una vista completa. El integrador debe
 * separar por identidad y capability window; el hook nunca persiste ni comparte
 * las respuestas fuera de la instancia de Workspace que recibe estas funciones.
 */
export type ConciliarSearchRevalidationCache = Readonly<{
  get: (view: ConciliarSearchView) => ConciliarReadResponse | undefined
  set: (view: ConciliarSearchView, data: ConciliarReadResponse) => void
  /** Una navegación puede compartir una precarga privada de la misma foto. */
  pendingFor?: (view: ConciliarSearchView) => Promise<ConciliarReadResponse> | undefined
}>

export type UseConciliarGlobalSearchOptions = Readonly<{
  initialTab: ConciliarTab
  initialQuery?: string
  initialOffset?: number
  /** La foto SSR, si existe, debe contener filas y los cuatro resúmenes de la misma respuesta. */
  initialData?: ConciliarReadResponse | null
  read: ConciliarSearchRead
  cache?: ConciliarSearchRevalidationCache
}>

export type ConciliarGlobalSearch = Readonly<{
  tab: ConciliarTab
  /** Se enlaza directamente al input: también es el único q de las lecturas. */
  query: string
  /** Alias explícito para value de la caja; conserva el espacio que se está tecleando. */
  queryBox: string
  /** Alias explícito para q de la petición; el lector lo normaliza al serializar. */
  appliedQuery: string
  offset: number
  generation: number
  /** Sólo es visible una foto aceptada para la generación actual. */
  dataGeneration: number | null
  data: ConciliarReadResponse | null
  phase: ConciliarSearchPhase
  /** Hay una lectura privada no-store pendiente, incluso si ya se pinta un hit de memoria. */
  revalidating: boolean
  /** La UI no tiene una foto exacta mientras espera la lectura autorizada. */
  searching: boolean
  error: Error | null
  onQueryChange: (value: string) => void
  submitSearch: () => void
  clearSearch: () => void
  changeTab: (tab: ConciliarTab) => void
  changeOffset: (offset: number) => void
  /** Los filtros del Workspace cambian de una vez y reinician la página. */
  refreshForFilters: () => void
  refresh: () => void
  /** Descarta la foto visible y cualquier lectura de la generación anterior. */
  invalidate: () => void
  /** Descarta la foto y aborta la lectura sin iniciar una petición nueva. */
  discard: () => void
  /** Adopta sólo una foto ya autorizada para la vista/generación actualmente visible. */
  adopt: (data: ConciliarReadResponse) => boolean
}>

export function normalizeConciliarSearchQuery(value: string): string {
  return value.trim().slice(0, 120)
}

/** La caja conserva espacios internos/finales mientras se escribe; el límite se aplica igual. */
function inputConciliarSearchQuery(value: string): string {
  return value.slice(0, 120)
}

function normalizeOffset(value: number): number {
  return Number.isSafeInteger(value) && value > 0 ? value : 0
}

function nextState(
  state: ConciliarSearchMachineState,
  view: ConciliarSearchView,
  phase: ConciliarSearchPhase,
  historyMode: ConciliarSearchHistoryMode,
): ConciliarSearchMachineState {
  return { view, phase, historyMode, generation: state.generation + 1, error: null }
}

/** Máquina pura, exportada para probar las transiciones sin DOM, red ni React. */
export function createConciliarSearchMachineState(
  initialTab: ConciliarTab,
  initialQuery = '',
  initialOffset = 0,
  hasInitialData = false,
): ConciliarSearchMachineState {
  return {
    view: { tab: initialTab, query: normalizeConciliarSearchQuery(initialQuery), offset: normalizeOffset(initialOffset) },
    generation: 0,
    phase: hasInitialData ? 'idle' : 'loading',
    historyMode: 'none',
    error: null,
  }
}

export function reduceConciliarSearchMachine(
  state: ConciliarSearchMachineState,
  action: ConciliarSearchMachineAction,
): ConciliarSearchMachineState {
  switch (action.type) {
    case 'INPUT': {
      const query = inputConciliarSearchQuery(action.query)
      if (!query.trim()) {
        // Los espacios permanecen visibles hasta confirmar o cambiar URL; el
        // lector del servidor los trata como búsqueda vacía.
        if (query === state.view.query && state.view.offset === 0) return state
        return nextState(state, { ...state.view, query, offset: 0 }, 'loading', 'replace')
      }
      if (query === state.view.query && state.view.offset === 0) return state
      // El debounce actualiza la foto, pero no crea una entrada por pulsación.
      // Sólo SUBMIT (Enter o botón Buscar) confirma la búsqueda con pushState.
      return nextState(state, { ...state.view, query, offset: 0 }, 'pending', 'replace')
    }
    case 'CLEAR':
      // Clear es explícito aun cuando la caja ya esté vacía: invalida una lectura en curso.
      return nextState(state, { ...state.view, query: '', offset: 0 }, 'loading', 'replace')
    case 'SUBMIT':
      return nextState(state, { ...state.view, query: normalizeConciliarSearchQuery(state.view.query), offset: 0 }, 'loading', 'push')
    case 'TAB':
      if (action.tab === state.view.tab) return state
      return nextState(state, { tab: action.tab, query: state.view.query, offset: 0 }, 'loading', 'replace')
    case 'OFFSET': {
      const offset = normalizeOffset(action.offset)
      if (offset === state.view.offset) return state
      return nextState(state, { ...state.view, offset }, 'loading', 'replace')
    }
    case 'FILTERS':
      return nextState(state, { ...state.view, offset: 0 }, 'loading', 'none')
    case 'HISTORY':
      return nextState(state, {
        tab: action.view.tab,
        query: normalizeConciliarSearchQuery(action.view.query),
        offset: normalizeOffset(action.view.offset),
      }, 'loading', 'none')
    case 'REFRESH':
      return nextState(state, state.view, 'loading', 'none')
    case 'DEBOUNCE_ELAPSED':
      return state.phase === 'pending' && action.generation === state.generation
        ? { ...state, phase: 'loading' }
        : state
    case 'RESOLVED':
      return state.phase === 'loading' && action.generation === state.generation
        ? { ...state, phase: 'idle', error: null }
        : state
    case 'FAILED':
      return state.phase === 'loading' && action.generation === state.generation
        ? { ...state, phase: 'error', error: action.error }
        : state
    default:
      return state
  }
}

/** Lee sólo tab, q y offset para popstate; filtros ajenos permanecen propiedad del Workspace. */
export function readConciliarSearchHistory(search: string, fallback: ConciliarSearchView): ConciliarSearchView {
  const params = new URLSearchParams(search)
  const candidateTab = params.get('tab')
  const tab = CONCILIAR_TABS.includes(candidateTab as ConciliarTab) ? candidateTab as ConciliarTab : fallback.tab
  const query = normalizeConciliarSearchQuery(params.get('q') ?? '')
  const rawOffset = Number(params.get('offset') ?? '0')
  return { tab, query, offset: normalizeOffset(rawOffset) }
}

/** Conserva el resto del deep-link y no usa el router de Next, por lo que no fuerza RSC. */
export function conciliarSearchHistoryUrl(currentHref: string, view: ConciliarSearchView): string {
  const url = new URL(currentHref)
  url.searchParams.set('tab', view.tab)
  const query = normalizeConciliarSearchQuery(view.query)
  if (query) url.searchParams.set('q', query)
  else url.searchParams.delete('q')
  if (view.offset > 0) url.searchParams.set('offset', String(view.offset))
  else url.searchParams.delete('offset')
  return `${url.pathname}${url.search}${url.hash}`
}

function writeConciliarSearchHistory(view: ConciliarSearchView, mode: Exclude<ConciliarSearchHistoryMode, 'none'>): void {
  window.history[mode === 'push' ? 'pushState' : 'replaceState'](window.history.state, '', conciliarSearchHistoryUrl(window.location.href, view))
}

/**
 * Coordina una única lectura privada de proyección. Un hit de memoria sólo pinta
 * una foto ya autorizada mientras se revalida el mismo GET no-store: así ninguna
 * mutación se habilita contra una fila en caché antes de que el servidor vuelva a
 * comprobar identidad, ACL y decisionHash vigente.
 */
export function useConciliarGlobalSearch(options: UseConciliarGlobalSearchOptions): ConciliarGlobalSearch {
  const initial = useRef(options)
  const [state, dispatch] = useReducer(
    reduceConciliarSearchMachine,
    undefined,
    () => createConciliarSearchMachineState(
      initial.current.initialTab,
      initial.current.initialQuery,
      initial.current.initialOffset,
      initial.current.initialData != null,
    ),
  )
  const [acceptedData, setAcceptedData] = useState<ConciliarReadResponse | null>(initial.current.initialData ?? null)
  const [dataGeneration, setDataGeneration] = useState<number | null>(initial.current.initialData ? 0 : null)
  const stateRef = useRef(state)
  stateRef.current = state
  const readRef = useRef(options.read)
  readRef.current = options.read
  const cacheRef = useRef(options.cache)
  cacheRef.current = options.cache
  const controllerRef = useRef<AbortController | null>(null)
  const historyWrittenGeneration = useRef<number | null>(null)

  useEffect(() => {
    // La foto SSR ya pasó ACL en este render. Sólo se archiva al montar si el
    // integrador ya conoce la identidad; nunca tras una fase de auth incierta.
    if (initial.current.initialData) cacheRef.current?.set(stateRef.current.view, initial.current.initialData)
  }, [])

  const abortCurrentRead = useCallback(() => {
    controllerRef.current?.abort()
    controllerRef.current = null
  }, [])

  useEffect(() => {
    if (state.phase !== 'pending') return
    const timer = window.setTimeout(() => dispatch({ type: 'DEBOUNCE_ELAPSED', generation: state.generation }), CONCILIAR_SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [state.generation, state.phase])

  useEffect(() => {
    if (state.phase !== 'loading' || state.historyMode === 'none' || historyWrittenGeneration.current === state.generation) return
    writeConciliarSearchHistory(state.view, state.historyMode)
    historyWrittenGeneration.current = state.generation
  }, [state.generation, state.historyMode, state.phase, state.view])

  useEffect(() => {
    if (state.phase !== 'loading') return
    abortCurrentRead()
    const controller = new AbortController()
    controllerRef.current = controller
    const generation = state.generation
    const view = state.view
    // Se captura antes de la lectura: un render posterior con otros filtros no
    // puede rearchivar esta respuesta bajo una nueva clave privada.
    const cache = cacheRef.current
    const pending = cache?.pendingFor?.(view)
    // Aun con hit, se vuelve a leer no-store. El hit solamente evita una pantalla
    // vacía y las acciones siguen bloqueadas hasta RESOLVED.
    void (pending ?? readRef.current(view, { signal: controller.signal, generation }))
      .then((data) => {
        if (controller.signal.aborted) return
        cache?.set(view, data)
        setAcceptedData(data)
        setDataGeneration(generation)
        dispatch({ type: 'RESOLVED', generation })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        dispatch({ type: 'FAILED', generation, error: error instanceof Error ? error : new Error('No se pudo actualizar la conciliación.') })
      })
    return () => controller.abort()
  }, [abortCurrentRead, state.generation, state.phase, state.view])

  useEffect(() => () => abortCurrentRead(), [abortCurrentRead])

  const transition = useCallback((action: Exclude<ConciliarSearchMachineAction, { type: 'DEBOUNCE_ELAPSED' | 'RESOLVED' | 'FAILED' }>) => {
    const current = stateRef.current
    const next = reduceConciliarSearchMachine(current, action)
    abortCurrentRead()
    // Sólo una variante exacta puede mostrarse antes del GET. Clear y refresh
    // descartan expresamente la pantalla anterior para que q no quede oculto.
    if (next !== current && action.type !== 'CLEAR' && action.type !== 'REFRESH') {
      const cached = cacheRef.current?.get(next.view)
      if (cached) {
        setAcceptedData(cached)
        setDataGeneration(next.generation)
      } else {
        setAcceptedData(null)
        setDataGeneration(null)
      }
    } else if (next !== current && (action.type === 'CLEAR' || action.type === 'REFRESH')) {
      setAcceptedData(null)
      setDataGeneration(null)
    }
    dispatch(action)
  }, [abortCurrentRead])

  useEffect(() => {
    const onPopState = () => transition({ type: 'HISTORY', view: readConciliarSearchHistory(window.location.search, stateRef.current.view) })
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [transition])

  const invalidate = useCallback(() => {
    abortCurrentRead()
    setAcceptedData(null)
    setDataGeneration(null)
    dispatch({ type: 'REFRESH' })
  }, [abortCurrentRead])

  const discard = useCallback(() => {
    abortCurrentRead()
    setAcceptedData(null)
    setDataGeneration(null)
  }, [abortCurrentRead])

  /** Una mutación puede devolver la foto exacta del mismo servidor. No cambia
   * view, URL ni generación, y se rechaza si ya hay una lectura/transición. */
  const adopt = useCallback((data: ConciliarReadResponse): boolean => {
    const current = stateRef.current
    if (current.phase !== 'idle' || dataGeneration !== current.generation) return false
    cacheRef.current?.set(current.view, data)
    setAcceptedData(data)
    setDataGeneration(current.generation)
    return true
  }, [dataGeneration])

  const hasCurrentData = dataGeneration === state.generation && acceptedData !== null
  const visibleData = (state.phase === 'idle' || state.phase === 'pending' || state.phase === 'loading') && hasCurrentData ? acceptedData : null
  const onQueryChange = useCallback((query: string) => transition({ type: 'INPUT', query }), [transition])
  const submitSearch = useCallback(() => transition({ type: 'SUBMIT' }), [transition])
  const clearSearch = useCallback(() => transition({ type: 'CLEAR' }), [transition])
  const changeTab = useCallback((tab: ConciliarTab) => transition({ type: 'TAB', tab }), [transition])
  const changeOffset = useCallback((offset: number) => transition({ type: 'OFFSET', offset }), [transition])
  const refreshForFilters = useCallback(() => transition({ type: 'FILTERS' }), [transition])
  const refresh = useCallback(() => transition({ type: 'REFRESH' }), [transition])

  return {
    tab: state.view.tab,
    query: state.view.query,
    queryBox: state.view.query,
    appliedQuery: state.view.query,
    offset: state.view.offset,
    generation: state.generation,
    dataGeneration,
    data: visibleData,
    phase: state.phase,
    revalidating: state.phase === 'pending' || state.phase === 'loading',
    searching: (state.phase === 'pending' || state.phase === 'loading') && !hasCurrentData,
    error: state.error,
    onQueryChange,
    submitSearch,
    clearSearch,
    changeTab,
    changeOffset,
    refreshForFilters,
    refresh,
    invalidate,
    discard,
    adopt,
  }
}
