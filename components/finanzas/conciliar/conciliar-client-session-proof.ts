'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const SESSION_PROOF_API = '/api/auth/session';

type RecordValue = Record<string, unknown>;

type ConciliarActuationIdentity = Readonly<{
  sessionId: string;
  actorId: string;
  targetId: string;
  expiresAt: number;
}>;

export type ConciliarSessionIdentity = Readonly<{
  userId: string;
  userType: string;
  role: string | null;
  roles: readonly string[];
  impersonation: ConciliarActuationIdentity | null;
}>;

export type ConciliarSessionProof =
  | Readonly<{ ok: true; expiresAt: number }>
  | Readonly<{ ok: false; reason: 'context-invalid' | 'identity-changed' | 'actuation-changed' | 'expired' | 'malformed' }>;

export type ConciliarSessionProofState = Readonly<{
  status: 'not-required' | 'pending' | 'valid' | 'rejected';
  expiresAt: number | null;
  requestKey: string | null;
}>;

function record(value: unknown): RecordValue | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : null;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function roleList(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.some((role) => !nonEmptyString(role))) return null;
  return [...new Set(value.map((role) => role.trim()))].sort();
}

function canonicalUserId(value: unknown): string | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric > 0 && String(numeric) === value ? value : null;
}

function readActuation(value: unknown): ConciliarActuationIdentity | null | undefined {
  if (value === undefined) return null;
  const source = record(value);
  if (!source || !nonEmptyString(source.sessionId) || !nonEmptyString(source.expiresAt)) return undefined;
  const actorId = canonicalUserId(source.actorId);
  const targetId = canonicalUserId(source.targetId);
  if (!actorId || !targetId || actorId === targetId) return undefined;
  const expiresAt = Date.parse(source.expiresAt);
  if (!Number.isFinite(expiresAt)) return undefined;
  return {
    sessionId: source.sessionId,
    actorId,
    targetId,
    expiresAt,
  };
}

/**
 * Extrae sólo la identidad ya proyectada por NextAuth. No concede permisos ni
 * adopta ningún campo de una respuesta nueva; esa comparación ocurre abajo.
 */
export function readConciliarSessionIdentity(value: unknown): ConciliarSessionIdentity | null {
  const session = record(value);
  const user = record(session?.user);
  if (!session || !user || !nonEmptyString(user.id) || !nonEmptyString(user.userType)) return null;
  if (!canonicalUserId(user.id)) return null;
  const roles = roleList(user.roles ?? []);
  if (!roles || (user.role !== undefined && !nonEmptyString(user.role))) return null;
  const impersonation = readActuation(session.impersonation);
  if (impersonation === undefined) return null;
  // El usuario de una actuación siempre es el destino efectivo. No se admite
  // una prueba que mezcle una identidad visual y un destino distinto.
  if (impersonation && impersonation.targetId !== user.id) return null;
  return {
    userId: user.id,
    userType: user.userType,
    role: typeof user.role === 'string' ? user.role : null,
    roles,
    impersonation,
  };
}

/** Clave sin secretos para invalidar una respuesta iniciada por otro contexto. */
export function conciliarSessionIdentityKey(identity: ConciliarSessionIdentity | null): string | null {
  if (!identity) return null;
  return JSON.stringify([
    identity.userId,
    identity.userType,
    identity.role,
    identity.roles,
    identity.impersonation && [
      identity.impersonation.sessionId,
      identity.impersonation.actorId,
      identity.impersonation.targetId,
      identity.impersonation.expiresAt,
    ],
  ]);
}

/** Clave de la actuación viva que acompaña a la proyección de sesión. */
export function conciliarActiveActuationKey(value: unknown): string {
  if (value === null || value === undefined) return 'none';
  const source = record(value);
  if (!source || !nonEmptyString(source.sessionId) || source.targetId === null || source.targetId === undefined || !nonEmptyString(source.expiresAt)) return 'invalid';
  const expiresAt = Date.parse(source.expiresAt);
  if (!Number.isFinite(expiresAt)) return 'invalid';
  return JSON.stringify([source.sessionId, String(source.targetId), expiresAt]);
}

/** La sesión NextAuth y el control de actuación deben describir el mismo destino. */
export function conciliarSessionProofMatchesActiveActuation(identity: ConciliarSessionIdentity | null, active: unknown): boolean {
  if (!identity?.impersonation) return active === null || active === undefined;
  const source = record(active);
  if (!source || !nonEmptyString(source.sessionId) || source.targetId === null || source.targetId === undefined || !nonEmptyString(source.expiresAt)) return false;
  const activeExpiresAt = Date.parse(source.expiresAt);
  return Number.isFinite(activeExpiresAt)
    && identity.impersonation.sessionId === source.sessionId
    && identity.impersonation.targetId === String(source.targetId)
    && identity.impersonation.expiresAt === activeExpiresAt;
}

function sameRoles(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((role, index) => role === right[index]);
}

function sameActuation(left: ConciliarActuationIdentity | null, right: ConciliarActuationIdentity | null): boolean {
  return left === right || Boolean(left && right
    && left.sessionId === right.sessionId
    && left.actorId === right.actorId
    && left.targetId === right.targetId
    && left.expiresAt === right.expiresAt);
}

/** El GET normal de NextAuth debe traer una caducidad real, finita y futura. */
function proofExpiry(value: RecordValue, now: number): number | null {
  if (!nonEmptyString(value.expires)) return null;
  const expiresAt = Date.parse(value.expires);
  return Number.isFinite(expiresAt) && expiresAt > now ? expiresAt : null;
}

/**
 * Acepta la caducidad de /api/auth/session sólo tras conservar exactamente
 * usuario efectivo, tipo, rol, roles y la actuación completa del contexto.
 */
export function normalizeConciliarClientSessionProof(
  contextValue: unknown,
  responseValue: unknown,
  now = Date.now(),
): ConciliarSessionProof {
  const context = readConciliarSessionIdentity(contextValue);
  return normalizeConciliarSessionProofForIdentity(context, responseValue, now);
}

/** Igual que el normalizador público, para el hook tras estabilizar su contexto. */
export function normalizeConciliarSessionProofForIdentity(
  context: ConciliarSessionIdentity | null,
  responseValue: unknown,
  now = Date.now(),
): ConciliarSessionProof {
  const response = readConciliarSessionIdentity(responseValue);
  const rawResponse = record(responseValue);
  if (!context || !response || !rawResponse) return { ok: false, reason: 'context-invalid' };
  if (context.impersonation && context.impersonation.expiresAt <= now) return { ok: false, reason: 'expired' };
  if (response.impersonation && response.impersonation.expiresAt <= now) return { ok: false, reason: 'expired' };
  if (context.userId !== response.userId || context.userType !== response.userType || context.role !== response.role || !sameRoles(context.roles, response.roles)) {
    return { ok: false, reason: 'identity-changed' };
  }
  if (!sameActuation(context.impersonation, response.impersonation)) return { ok: false, reason: 'actuation-changed' };
  const expiresAt = proofExpiry(rawResponse, now);
  if (expiresAt === null) return { ok: false, reason: 'malformed' };
  return { ok: true, expiresAt };
}

/** Una respuesta tardía o abortada jamás puede habilitar un scope posterior. */
export function isCurrentConciliarSessionProof(input: Readonly<{
  signal?: AbortSignal;
  requestKey: string;
  currentKey: string | null;
}>): boolean {
  return !input.signal?.aborted && input.currentKey === input.requestKey;
}

/** NextAuth sólo puede acreditar esta lectura con su respuesta normal 200. */
export function isSuccessfulConciliarSessionProofResponse(status: number): boolean {
  return status === 200;
}

/** Una sesión ya visible sólo se usa directamente si trae una fecha futura real. */
export function directConciliarSessionExpiry(value: unknown, now = Date.now()): number | null {
  const session = record(value);
  if (!session || !nonEmptyString(session.expires)) return null;
  const expiresAt = Date.parse(session.expires);
  return Number.isFinite(expiresAt) && expiresAt > now ? expiresAt : null;
}

/**
 * Repara el hueco de RSC de NextAuth v4: si el proveedor inicial llegó sin
 * `expires`, hace un único GET de control autenticado. No usa storage, no
 * actualiza roles y no toca ninguna API financiera.
 */
export function useConciliarClientSessionProof(session: unknown, sessionStatus: string, contextKey = 'none', activeActuation: unknown = null, enabled = true): Readonly<{
  expiresAt: number | null;
  pending: boolean;
  rejected: boolean;
  identity: ConciliarSessionIdentity | null;
}> {
  const identity = useMemo(() => readConciliarSessionIdentity(session), [session]);
  const identityKey = conciliarSessionIdentityKey(identity);
  const identitySnapshot = useMemo(() => identity, [identityKey]);
  const activeSnapshot = useMemo(() => activeActuation, [contextKey]);
  const directExpiry = directConciliarSessionExpiry(session);
  const required = enabled && sessionStatus === 'authenticated' && identityKey !== null && directExpiry === null;
  const requestKey = required ? `${identityKey}\u0000${contextKey}` : null;
  const latestRequestKey = useRef<string | null>(requestKey);
  latestRequestKey.current = requestKey;
  const [state, setState] = useState<ConciliarSessionProofState>({ status: 'not-required', expiresAt: null, requestKey: null });

  useEffect(() => {
    if (!required || !requestKey) {
      setState({ status: 'not-required', expiresAt: null, requestKey: null });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'pending', expiresAt: null, requestKey });
    void fetch(SESSION_PROOF_API, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    }).then(async (response) => {
      const body: unknown = await response.json().catch(() => null);
      if (!isCurrentConciliarSessionProof({ signal: controller.signal, requestKey, currentKey: latestRequestKey.current })) return;
      if (!isSuccessfulConciliarSessionProofResponse(response.status)) {
        setState({ status: 'rejected', expiresAt: null, requestKey });
        return;
      }
      const proof = normalizeConciliarSessionProofForIdentity(identitySnapshot, body);
      const matchesActiveActuation = conciliarSessionProofMatchesActiveActuation(identitySnapshot, activeSnapshot);
      setState(proof.ok && matchesActiveActuation
        ? { status: 'valid', expiresAt: proof.expiresAt, requestKey }
        : { status: 'rejected', expiresAt: null, requestKey });
    }).catch(() => {
      if (!isCurrentConciliarSessionProof({ signal: controller.signal, requestKey, currentKey: latestRequestKey.current })) return;
      setState({ status: 'rejected', expiresAt: null, requestKey });
    });
    return () => controller.abort();
  }, [activeSnapshot, identitySnapshot, required, requestKey]);

  const proofValid = required && state.requestKey === requestKey && state.status === 'valid' && state.expiresAt !== null && Number.isFinite(state.expiresAt) && state.expiresAt > Date.now();
  return {
    expiresAt: directExpiry ?? (proofValid ? state.expiresAt : null),
    pending: required && !proofValid && !(state.requestKey === requestKey && state.status === 'rejected'),
    rejected: required && state.requestKey === requestKey && state.status === 'rejected',
    identity,
  };
}
