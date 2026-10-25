import { useEffect, useState } from 'react';
import { formatApiError, type PolyCostClient } from '../../api-client';
import { Button } from '../../components/Button';
import { Badge } from '../../components/ui';
import { writeKeys } from '../../lib/write-keys';
import type { ResourceOwnership } from '../../types';
import { accessSummary, expiryLabel } from './ownership-copy';

/**
 * Who owns this comparison and what this browser may do with it (ADR-0001
 * §3.7): "Team: Acme", or "Anonymous" with its expiry, plus the two anonymous
 * actions - copy the edit key to another device, or move the comparison into
 * the signed-in team. The API stays the authority; this only explains it.
 */
export function OwnershipBar({
  client,
  comparisonId,
  onOwnershipChange,
  onNotice,
}: {
  client: PolyCostClient;
  comparisonId: string;
  onOwnershipChange?: (ownership: ResourceOwnership | null) => void;
  onNotice?: (message: string) => void;
}) {
  const [ownership, setOwnership] = useState<ResourceOwnership | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [keyState, setKeyState] = useState<'idle' | 'copied' | 'shown'>('idle');
  const [actionError, setActionError] = useState<string | null>(null);
  const [pastedKey, setPastedKey] = useState('');

  useEffect(() => {
    let live = true;
    setOwnership(null);
    setKeyState('idle');
    setActionError(null);
    client
      .getComparisonOwnership(comparisonId)
      .then((next) => {
        if (!live) return;
        setOwnership(next);
        onOwnershipChange?.(next);
      })
      .catch(() => {
        // Older API or a transient failure: say nothing rather than guess.
        // Change routes still enforce access, so the page stays safe.
        if (!live) return;
        onOwnershipChange?.(null);
      });
    return () => {
      live = false;
    };
    // onOwnershipChange is deliberately not a dependency: it is a callback
    // from the page, and re-fetching on its identity would loop.
  }, [client, comparisonId]);

  if (!ownership) {
    return null;
  }

  const editKey = writeKeys.comparisonKey(comparisonId);

  async function copyEditKey() {
    if (!editKey) return;
    try {
      await navigator.clipboard.writeText(editKey);
      setKeyState('copied');
    } catch {
      // No clipboard permission: show it so it can be copied by hand.
      setKeyState('shown');
    }
  }

  // The other half of "copy edit key": another browser takes the key and,
  // if the API accepts it, can change and claim the comparison from here on.
  async function usePastedKey() {
    const key = pastedKey.trim();
    if (!key) return;
    setActionError(null);
    writeKeys.rememberComparison(comparisonId, key);
    try {
      const next = await client.getComparisonOwnership(comparisonId);
      if (!next.canChange) {
        writeKeys.forgetComparison(comparisonId);
        setActionError('That edit key does not match this comparison.');
        return;
      }
      setPastedKey('');
      setOwnership(next);
      onOwnershipChange?.(next);
      onNotice?.('Edit key saved in this browser.');
    } catch (keyError) {
      writeKeys.forgetComparison(comparisonId);
      setActionError(formatApiError(keyError));
    }
  }

  async function claim() {
    setClaiming(true);
    setActionError(null);
    try {
      await client.claimComparison(comparisonId);
      const next = await client.getComparisonOwnership(comparisonId);
      setOwnership(next);
      onOwnershipChange?.(next);
      onNotice?.(
        `Moved to ${next.teamName ?? 'your team'}. Team members can see it, and it no longer expires.`,
      );
    } catch (claimError) {
      setActionError(formatApiError(claimError));
    } finally {
      setClaiming(false);
    }
  }

  return (
    <section className="ownership-bar" aria-label="Ownership">
      <div className="ownership-bar-status">
        {ownership.owner === 'team' ? (
          <Badge tone="brand">Team: {ownership.teamName ?? 'your team'}</Badge>
        ) : (
          <>
            <Badge tone="estimate">Anonymous</Badge>
            <Badge tone="warning">{expiryLabel(ownership.expiresAt)}</Badge>
          </>
        )}
        {ownership.role === 'viewer' ? <Badge tone="neutral">Viewer</Badge> : null}
        <span className="ownership-bar-summary">{accessSummary(ownership)}</span>
      </div>

      {ownership.owner === 'anonymous' && (editKey || ownership.canClaim) ? (
        <div className="ownership-bar-actions">
          {editKey ? (
            <Button type="button" variant="ghost" onClick={() => void copyEditKey()}>
              {keyState === 'copied' ? 'Edit key copied' : 'Copy edit key'}
            </Button>
          ) : null}
          {ownership.canClaim ? (
            <Button
              type="button"
              variant="secondary"
              loading={claiming}
              loadingLabel="Moving..."
              onClick={() => void claim()}
            >
              Move to team
            </Button>
          ) : null}
        </div>
      ) : null}

      {ownership.owner === 'anonymous' && !editKey ? (
        <form
          className="ownership-bar-paste"
          onSubmit={(event) => {
            event.preventDefault();
            void usePastedKey();
          }}
        >
          <label htmlFor={`edit-key-${comparisonId}`}>Have the edit key?</label>
          <input
            id={`edit-key-${comparisonId}`}
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={pastedKey}
            onChange={(event) => setPastedKey(event.target.value)}
          />
          <Button type="submit" variant="ghost" disabled={pastedKey.trim() === ''}>
            Use key
          </Button>
        </form>
      ) : null}

      {keyState === 'shown' && editKey ? (
        <p className="ownership-bar-key">
          Copy this edit key and keep it private: <code>{editKey}</code>
        </p>
      ) : null}
      {actionError ? (
        <p className="ownership-bar-error" role="alert">
          {actionError}
        </p>
      ) : null}
    </section>
  );
}
