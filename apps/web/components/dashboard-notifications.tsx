'use client';

import { Button } from '@cloudflare/kumo/components/button';
import { Popover } from '@cloudflare/kumo/components/popover';
import {
  LiveblocksProvider,
  useInboxNotifications,
  useMarkAllInboxNotificationsAsRead,
  useUnreadInboxNotificationsCount,
} from '@liveblocks/react';
import {
  InboxNotification,
  InboxNotificationList,
  type InboxNotificationCustomKindProps,
} from '@liveblocks/react-ui';
import { BellIcon } from '@phosphor-icons/react';
import { useMemo } from 'react';

import { dashboardUserResolver } from '../lib/liveblocks/resolve-users';

import styles from './dashboard-notifications.module.css';

function AttuneActivityNotification({
  inboxNotification,
  ...props
}: InboxNotificationCustomKindProps<'$attuneActivity'>) {
  const activity = inboxNotification.activities.at(-1)?.data;
  return (
    <InboxNotification.Custom
      {...props}
      inboxNotification={inboxNotification}
      href={
        activity?.workspaceId
          ? `/workspace/${encodeURIComponent(activity.workspaceId)}`
          : '/dashboard'
      }
      title={activity?.title ?? 'Attune activity'}
      aside={
        <InboxNotification.Icon>
          <BellIcon size={18} />
        </InboxNotification.Icon>
      }
    >
      {activity?.description ?? 'Workspace activity was recorded.'}
    </InboxNotification.Custom>
  );
}

function NotificationTray() {
  const result = useInboxNotifications();
  const unread = useUnreadInboxNotificationsCount();
  const unreadCount = unread.count ?? 0;
  const markAllAsRead = useMarkAllInboxNotificationsAsRead();
  const kinds = useMemo(() => ({ $attuneActivity: AttuneActivityNotification }), []);
  return (
    <div className={styles.anchor}>
      <Popover>
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
              <InboxNotification
                key={notification.id}
                inboxNotification={notification}
                kinds={kinds}
              />
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
