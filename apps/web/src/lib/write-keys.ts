/*
  Edit keys for anonymous data (ADR-0001 §3.4).

  The API returns an edit key once, when an anonymous comparison or workload is
  created; changing that resource later (budgets, alerts, share links, live
  refresh) needs the key in the X-PolyCost-Write-Key header. This browser keeps
  the keys so whoever created something can keep changing it, while a forwarded
  read link cannot. Alerts and share links are changed by their own id, so we
  also remember which workload each belongs to.

  Storage is per-browser convenience: wrapped in try/catch with an in-memory
  fallback (private windows, blocked storage), and bounded so it never grows
  without limit.
*/

export const WRITE_KEY_HEADER = 'X-PolyCost-Write-Key';

const STORAGE_KEY = 'polycost-write-keys-v1';
const MAX_ENTRIES = 100;

interface WriteKeyStore {
  comparisons: Record<string, string>;
  workloads: Record<string, string>;
  /** share token -> workload id */
  shareLinks: Record<string, string>;
  /** alert id -> workload id */
  alerts: Record<string, string>;
}

let memory: WriteKeyStore | undefined;

function emptyStore(): WriteKeyStore {
  return { comparisons: {}, workloads: {}, shareLinks: {}, alerts: {} };
}

function load(): WriteKeyStore {
  if (memory) return memory;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<WriteKeyStore>) : {};
    memory = { ...emptyStore(), ...parsed };
  } catch {
    memory = emptyStore();
  }
  return memory;
}

function save(store: WriteKeyStore) {
  memory = store;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage unavailable: the in-memory copy still serves this session.
  }
}

/** Insert while keeping only the newest MAX_ENTRIES (insertion order). */
function bounded(map: Record<string, string>, id: string, value: string) {
  const next = { ...map };
  delete next[id];
  next[id] = value;
  const ids = Object.keys(next);
  for (const stale of ids.slice(0, Math.max(0, ids.length - MAX_ENTRIES))) {
    delete next[stale];
  }
  return next;
}

export const writeKeys = {
  rememberComparison(comparisonId: string, writeKey: string) {
    const store = load();
    save({ ...store, comparisons: bounded(store.comparisons, comparisonId, writeKey) });
  },
  comparisonKey(comparisonId: string): string | undefined {
    return load().comparisons[comparisonId];
  },
  rememberWorkload(workloadId: string, writeKey: string) {
    const store = load();
    save({ ...store, workloads: bounded(store.workloads, workloadId, writeKey) });
  },
  workloadKey(workloadId: string): string | undefined {
    return load().workloads[workloadId];
  },
  linkShareToken(token: string, workloadId: string) {
    const store = load();
    save({ ...store, shareLinks: bounded(store.shareLinks, token, workloadId) });
  },
  shareLinkKey(token: string): string | undefined {
    const store = load();
    const workloadId = store.shareLinks[token];
    return workloadId ? store.workloads[workloadId] : undefined;
  },
  linkAlerts(alerts: Array<{ id: string; workloadId: string }>) {
    const store = load();
    let next = store.alerts;
    for (const alert of alerts) next = bounded(next, alert.id, alert.workloadId);
    save({ ...store, alerts: next });
  },
  alertKey(alertId: string): string | undefined {
    const store = load();
    const workloadId = store.alerts[alertId];
    return workloadId ? store.workloads[workloadId] : undefined;
  },
  /** Forget every key (signing out on a shared machine, ADR-0001 §3.7). */
  clear() {
    save(emptyStore());
  },
};

/** The header object for a write, or nothing when no key is held. */
export function writeKeyHeaders(writeKey: string | undefined): Record<string, string> {
  return writeKey ? { [WRITE_KEY_HEADER]: writeKey } : {};
}

/** Test hook: drop the in-memory cache so the next read reloads storage. */
export function resetWriteKeyCacheForTests() {
  memory = undefined;
}
