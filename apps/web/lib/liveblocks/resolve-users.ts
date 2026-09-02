interface ResolvedLiveblocksUser {
  readonly name: string;
  readonly avatar?: string;
  readonly role: 'buyer' | 'provider';
  readonly color: string;
}

function isResolvedUser(value: unknown): value is ResolvedLiveblocksUser {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'name') === 'string' &&
    (Reflect.get(value, 'role') === 'buyer' || Reflect.get(value, 'role') === 'provider') &&
    typeof Reflect.get(value, 'color') === 'string'
  );
}

export function workspaceUserResolver(roomId: string) {
  return async ({ userIds }: { readonly userIds: string[] }) => {
    const response = await fetch('/api/liveblocks-users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ roomId, userIds }),
    });
    if (!response.ok) return userIds.map(() => undefined);
    const body: unknown = await response.json();
    const users =
      typeof body === 'object' && body !== null && Array.isArray(Reflect.get(body, 'users'))
        ? Reflect.get(body, 'users')
        : [];
    return userIds.map((_, index) => {
      const user = users[index];
      return isResolvedUser(user) ? user : undefined;
    });
  };
}

export function dashboardUserResolver() {
  return async ({ userIds }: { readonly userIds: string[] }) => {
    const response = await fetch('/api/liveblocks-users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userIds }),
    });
    if (!response.ok) return userIds.map(() => undefined);
    const body: unknown = await response.json();
    const users =
      typeof body === 'object' && body !== null && Array.isArray(Reflect.get(body, 'users'))
        ? Reflect.get(body, 'users')
        : [];
    return userIds.map((_, index) => {
      const user = users[index];
      return isResolvedUser(user) ? user : undefined;
    });
  };
}
