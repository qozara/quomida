import type { SyncAdapter, SyncStatus, UXSyncState } from './types.js';

export interface ResolveUXStatusParams {
  isOnline: boolean;
  adapter?: SyncAdapter | { getStatus(): SyncStatus } | null;
  adapterStatus?: SyncStatus;
}

/**
 * Pure State Evaluator function conforming to the Information Architecture & State Flow:
 *
 * NET & ADAPTER --> EVAL{Resolve UX Status}
 * - Sync in progress               --> ST_SYNCING (Syncing)
 * - Device Offline                 --> ST_OFFLINE (Paused - Device Offline)
 * - 429 Rate Limit / Transient 5xx --> ST_WAITING (Paused - Retrying)
 * - Auth Revoked / Persistent Error--> ST_ERROR   (Action Required)
 * - All clean & synced             --> ST_IDLE    (Synced)
 * - No adapter configured          --> ST_LOCAL   (Local Only)
 */
export function resolveUXStatus(params: ResolveUXStatusParams): UXSyncState {
  const { isOnline, adapter } = params;
  const status: SyncStatus =
    params.adapterStatus !== undefined
      ? params.adapterStatus
      : adapter
        ? adapter.getStatus()
        : 'disconnected';

  // No adapter configured or disconnected
  if (adapter === null || status === 'disconnected') {
    return 'local';
  }

  // Device Offline takes precedence over adapter syncing/waiting/idle
  if (!isOnline) {
    return 'offline';
  }

  // Active sync in progress
  if (status === 'syncing') {
    return 'syncing';
  }

  // 429 Rate Limit / Transient 5xx
  if (status === 'throttled') {
    return 'waiting';
  }

  // Auth Revoked / Persistent Error / Schema Remediation Needed
  if (status === 'auth_failed' || status === 'error' || status === 'corrupted' || status === 'upgrade_required') {
    return 'error';
  }

  // All clean & synced
  if (status === 'idle' || status === 'synced') {
    return 'idle';
  }

  return 'local';
}

export interface ProviderDiagnostic {
  statusKey: 'notConnected' | 'needsAttention' | 'paused' | 'syncing' | 'connected';
  variant: 'offline' | 'attention' | 'paused' | 'online';
  hasAlertBadge?: boolean;
}

/**
 * Resolves the unified visual and diagnostic status for a cloud provider.
 * Ensures consistent diagnostic labels and indicators across the Popover and Settings panels.
 */
export function resolveProviderDiagnostic(
  uxSyncState: UXSyncState,
  hasAdapter: boolean
): ProviderDiagnostic {
  if (!hasAdapter || uxSyncState === 'local') {
    return { statusKey: 'notConnected', variant: 'offline' };
  }
  if (uxSyncState === 'error') {
    return { statusKey: 'needsAttention', variant: 'attention', hasAlertBadge: true };
  }
  if (uxSyncState === 'offline' || uxSyncState === 'waiting') {
    return { statusKey: 'paused', variant: 'paused' };
  }
  if (uxSyncState === 'syncing') {
    return { statusKey: 'syncing', variant: 'online' };
  }
  return { statusKey: 'connected', variant: 'online' };
}

