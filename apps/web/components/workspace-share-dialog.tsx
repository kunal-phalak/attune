'use client';

import { Button } from '@cloudflare/kumo/components/button';
import { Dialog } from '@cloudflare/kumo/components/dialog';
import { Input } from '@cloudflare/kumo/components/input';
import { useEffect, useState, type FormEvent } from 'react';

import type { AttuneShareRole } from '../lib/liveblocks/access';
import { AppIcons } from './ui/app-icons';

interface SharedUser {
  readonly id: string;
  readonly name: string;
  readonly role: AttuneShareRole | null;
  readonly currentUser: boolean;
}

function sharedUser(value: unknown): SharedUser | null {
  if (typeof value !== 'object' || value === null) return null;
  const id = Reflect.get(value, 'id');
  const name = Reflect.get(value, 'name');
  const role = Reflect.get(value, 'role');
  const currentUser = Reflect.get(value, 'currentUser');
  if (
    typeof id !== 'string' ||
    typeof name !== 'string' ||
    (role !== null && role !== 'viewer' && role !== 'commenter' && role !== 'editor')
  ) {
    return null;
  }
  return { id, name, role, currentUser: currentUser === true };
}

async function responseJson(response: Response) {
  const payload: unknown = await response.json();
  if (response.ok) return payload;
  const message =
    typeof payload === 'object' && payload !== null ? Reflect.get(payload, 'error') : undefined;
  throw new Error(typeof message === 'string' ? message : 'Sharing could not be updated.');
}

export function WorkspaceShareDialog({ roomId }: { readonly roomId: string }) {
  const [open, setOpen] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [role, setRole] = useState<AttuneShareRole>('commenter');
  const [users, setUsers] = useState<readonly SharedUser[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return () => undefined;
    let active = true;
    void fetch(`/api/liveblocks-share?room_id=${encodeURIComponent(roomId)}`, {
      cache: 'no-store',
    })
      .then(responseJson)
      .then((payload) => {
        const candidates =
          typeof payload === 'object' && payload !== null ? Reflect.get(payload, 'users') : [];
        if (active && Array.isArray(candidates)) {
          setUsers(candidates.map(sharedUser).filter((user) => user !== null));
        }
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Sharing is unavailable.');
      });
    return () => {
      active = false;
    };
  }, [open, roomId]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!identifier.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const payload = await responseJson(
        await fetch('/api/liveblocks-share', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId, identifier: identifier.trim(), role }),
        }),
      );
      const user =
        typeof payload === 'object' && payload !== null ? Reflect.get(payload, 'user') : null;
      const next = sharedUser(user);
      if (next) {
        setUsers((current) => [
          ...current.filter(({ id }) => id !== next.id),
          { ...next, currentUser: false },
        ]);
      }
      setIdentifier('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Sharing could not be updated.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        render={
          <Button
            type="button"
            variant="secondary"
            size="base"
            shape="square"
            icon={<AppIcons.Share size={17} />}
            aria-label="Share workspace"
          ></Button>
        }
      />
      <Dialog size="base" className="workspace-share-dialog">
        <div className="workspace-share-header">
          <div>
            <Dialog.Title>Share workspace</Dialog.Title>
            <Dialog.Description>
              Room access updates connected collaborators immediately.
            </Dialog.Description>
          </div>
          <Dialog.Close
            render={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                shape="square"
                icon={<AppIcons.Close size={16} />}
                aria-label="Close sharing dialog"
              />
            }
          />
        </div>
        <form className="workspace-share-form" onSubmit={(event) => void submit(event)}>
          <Input
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            aria-label="Email or Attune user ID"
            placeholder="Email or Attune user ID"
          />
          <div className="workspace-share-roles" aria-label="Access role">
            {(['viewer', 'commenter', 'editor'] as const).map((candidate) => (
              <Button
                key={candidate}
                type="button"
                size="sm"
                variant={role === candidate ? 'primary' : 'secondary'}
                aria-pressed={role === candidate}
                onClick={() => setRole(candidate)}
              >
                {candidate[0].toUpperCase() + candidate.slice(1)}
              </Button>
            ))}
          </div>
          <Button type="submit" variant="primary" loading={busy} disabled={!identifier.trim()}>
            Invite
          </Button>
        </form>
        {error ? <p className="workspace-share-error">{error}</p> : null}
        <ul className="workspace-share-members">
          {users.map((user) => (
            <li key={user.id}>
              <span>
                <strong>{user.name}</strong>
                <small>{user.currentUser ? 'You' : user.id}</small>
              </span>
              <small>{user.role ?? 'No access'}</small>
            </li>
          ))}
        </ul>
      </Dialog>
    </Dialog.Root>
  );
}
