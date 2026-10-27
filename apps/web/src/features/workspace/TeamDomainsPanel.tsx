import { useEffect, useState, type FormEvent } from 'react';
import { formatApiError, type PolyCostClient } from '../../api-client';
import { Button } from '../../components/Button';
import { Badge } from '../../components/ui';
import type { TeamDomainRecord } from '../../types';

/**
 * Audit H-01: the email domains this team owns. SCIM provisions only
 * addresses on a verified domain, so an identity provider cannot create or
 * take over accounts that belong to another organisation. Owners and admins
 * add a domain, publish the TXT record shown here, then verify it.
 */
export function TeamDomainsPanel({
  client,
  teamId,
  token,
  onNotice,
}: {
  client: PolyCostClient;
  teamId: string;
  token: string;
  onNotice: (message: string | null) => void;
}) {
  const [domains, setDomains] = useState<TeamDomainRecord[] | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setDomains(null);
    client
      .listTeamDomains(teamId, token)
      .then((next) => {
        if (live) setDomains(next);
      })
      .catch((loadError) => {
        if (live) {
          setDomains([]);
          setError(formatApiError(loadError));
        }
      });
    return () => {
      live = false;
    };
  }, [client, teamId, token]);

  function replace(record: TeamDomainRecord) {
    setDomains((current) =>
      [...(current ?? []).filter((item) => item.id !== record.id), record].sort((a, b) =>
        a.domain.localeCompare(b.domain),
      ),
    );
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy('add');
    setError(null);
    try {
      const record = await client.addTeamDomain(teamId, draft.trim(), token);
      replace(record);
      setDraft('');
      onNotice(`Added ${record.domain}. Publish the TXT record, then verify it.`);
    } catch (addError) {
      setError(formatApiError(addError));
    } finally {
      setBusy(null);
    }
  }

  async function verify(record: TeamDomainRecord) {
    setBusy(record.id);
    setError(null);
    try {
      const verified = await client.verifyTeamDomain(teamId, record.id, token);
      replace(verified);
      onNotice(`${verified.domain} is verified. SCIM can now provision its users.`);
    } catch (verifyError) {
      setError(formatApiError(verifyError));
    } finally {
      setBusy(null);
    }
  }

  async function remove(record: TeamDomainRecord) {
    setBusy(record.id);
    setError(null);
    try {
      await client.removeTeamDomain(teamId, record.id, token);
      setDomains((current) => (current ?? []).filter((item) => item.id !== record.id));
      onNotice(`Removed ${record.domain}. SCIM can no longer provision its users.`);
    } catch (removeError) {
      setError(formatApiError(removeError));
    } finally {
      setBusy(null);
    }
  }

  const verifiedCount = domains?.filter((item) => item.status === 'verified').length ?? 0;

  return (
    <section className="team-domains" aria-label="Verified domains">
      <div className="workspace-sso-status">
        <span>Verified domains</span>
        <strong>
          {domains === null
            ? 'Loading…'
            : `${verifiedCount} verified · ${domains.length - verifiedCount} pending`}
        </strong>
        <small>
          SCIM only provisions addresses on a domain this team has verified with a DNS TXT record.
        </small>
      </div>

      <form className="workspace-inline-form" onSubmit={(event) => void add(event)}>
        <label className="workspace-field">
          <span>Domain</span>
          <input
            value={draft}
            placeholder="acme.com"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setDraft(event.currentTarget.value)}
          />
        </label>
        <Button
          type="submit"
          variant="secondary"
          loading={busy === 'add'}
          loadingLabel="Adding..."
          disabled={!draft.trim()}
        >
          Add domain
        </Button>
      </form>

      {error ? (
        <p className="team-domains-error" role="alert">
          {error}
        </p>
      ) : null}

      {domains && domains.length > 0 ? (
        <ul className="team-domains-list">
          {domains.map((record) => (
            <li key={record.id}>
              <div className="team-domains-head">
                <strong>{record.domain}</strong>
                <Badge tone={record.status === 'verified' ? 'success' : 'warning'}>
                  {record.status === 'verified' ? 'Verified' : 'Pending'}
                </Badge>
              </div>
              {record.status === 'pending' ? (
                <p className="team-domains-record">
                  Add a <code>TXT</code> record at <code>{record.verificationRecord.name}</code>{' '}
                  with the value <code>{record.verificationRecord.value}</code>
                </p>
              ) : null}
              <div className="team-domains-actions">
                {record.status === 'pending' ? (
                  <Button
                    type="button"
                    variant="secondary"
                    loading={busy === record.id}
                    loadingLabel="Checking..."
                    onClick={() => void verify(record)}
                  >
                    Verify {record.domain}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="destructiveQuiet"
                  disabled={busy === record.id}
                  onClick={() => void remove(record)}
                >
                  Remove {record.domain}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : domains ? (
        <p className="workspace-empty-state">
          No domains yet. Add the domain your identity provider manages, such as acme.com.
        </p>
      ) : null}
    </section>
  );
}
