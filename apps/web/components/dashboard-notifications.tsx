'use client';

import { Button } from '@cloudflare/kumo/components/button';
import { Popover } from '@cloudflare/kumo/components/popover';
import {
  LiveblocksProvider,
  useDeleteInboxNotification,
  useInboxNotifications,
  useMarkAllInboxNotificationsAsRead,
  useMarkInboxNotificationAsRead,
  useUnreadInboxNotificationsCount,
} from '@liveblocks/react';
import { InboxNotification, InboxNotificationList } from '@liveblocks/react-ui';
import { BellIcon, ChatCircleIcon, TrashIcon } from '@phosphor-icons/react';
import { useEffect, useMemo, useState, type ComponentProps } from 'react';

import { dashboardUserResolver } from '../lib/liveblocks/resolve-users';

import styles from './dashboard-notifications.module.css';

type InboxNotificationData = ComponentProps<typeof InboxNotification>['inboxNotification'];

type ActivityData = {
  readonly title?: string;
  readonly description?: string;
  readonly workspaceId?: string;
  readonly actorId?: string;
  readonly route?: string;
};

function notificationRoute(notification: InboxNotificationData): string {
  if (notification.kind === '$attuneActivity') {
    const activity = notification.activities?.at(-1)?.data as ActivityData | undefined;
    if (activity?.route) return activity.route;
    if (activity?.workspaceId) {
      return `/workspace/${encodeURIComponent(activity.workspaceId)}`;
    }
  }
  return '/dashboard';
}

function NotificationRow({ notification }: { readonly notification: InboxNotificationData }) {
  const markAsRead = useMarkInboxNotificationAsRead();
  const deleteNotification = useDeleteInboxNotification();
  const unread = !notification.readAt || notification.notifiedAt > notification.readAt;

  const activity =
    notification.kind === '$attuneActivity'
      ? (notification.activities?.at(-1)?.data as ActivityData | undefined)
      : undefined;
  const title =
    activity?.title ?? (notification.kind === 'thread' ? 'New comment' : 'Notification');
  const description =
    activity?.description ?? (notification.kind === 'thread' ? 'A comment was posted.' : '');

  return (
    <div className="flex items-start justify-between gap-3" data-unread={unread ? '' : undefined}>
      <a
        href={notificationRoute(notification)}
        className="flex items-start gap-3"
        onClick={(event) => {
          event.preventDefault();
          if (unread) markAsRead(notification.id);
          window.location.assign(notificationRoute(notification));
        }}
      >
        <span
          className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-kumo-surface-2)] text-[var(--color-kumo-strong)]"
          aria-hidden
        >
          {notification.kind === 'thread' ? <ChatCircleIcon size={18} /> : <BellIcon size={18} />}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-medium text-[var(--color-kumo-strong)]">
            {title}
          </span>
          {description ? (
            <span className="line-clamp-2 text-xs text-[var(--color-kumo-subtle)]">
              {description}
            </span>
          ) : null}
        </span>
      </a>
      <span className="flex shrink-0 items-center gap-1">
        {unread ? (
          <span
            className="size-2 rounded-full bg-[var(--color-attune-conflict)]"
            aria-label="Unread"
          />
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          shape="square"
          icon={<TrashIcon size={16} />}
          aria-label="Delete notification"
          onClick={() => deleteNotification(notification.id)}
        />
      </span>
    </div>
  );
}

function NotificationTray() {
  const result = useInboxNotifications();
  const unread = useUnreadInboxNotificationsCount();
  const unreadCount = unread.count ?? 0;
  const markAllAsRead = useMarkAllInboxNotificationsAsRead();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const reveal = () => setOpen(true);
    window.addEventListener('attune:open-notifications', reveal);
    return () => window.removeEventListener('attune:open-notifications', reveal);
  }, []);

  return (
    <div className={styles.anchor}>
      <Popover open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          render={
            <Button
              type="button"
              variant="secondary"
              size="base"
              shape="square"
              icon={<BellIcon size={18} />}
              aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
            />
          }
        />
        {unreadCount > 0 ? <span className={styles.badge}>{unreadCount}</span> : null}
        <Popover.Content side="bottom" align="end" sideOffset={8} className={styles.popover}>
          <div className={styles.header}>
            <Popover.Title>Notifications</Popover.Title>
            <Button type="button" variant="ghost" size="sm" onClick={() => markAllAsRead()}>
              Mark all read
            </Button>
          </div>
          <InboxNotificationList className={styles.list}>
            {(result.inboxNotifications ?? []).map((notification) => (
              <NotificationRow key={notification.id} notification={notification} />
            ))}
          </InboxNotificationList>
          {!result.isLoading && (result.inboxNotifications?.length ?? 0) === 0 ? (
            <p className={styles.empty}>No notifications yet.</p>
          ) : null}
        </Popover.Content>
      </Popover>
    </div>
  );
}

export function DashboardNotifications() {
  const resolveUsers = useMemo(() => dashboardUserResolver(), []);
  return (
    <LiveblocksProvider authEndpoint="/api/liveblocks-auth" resolveUsers={resolveUsers}>
      <NotificationTray />
    </LiveblocksProvider>
  );
}
