export type AttuneNotificationType =
  | 'rfq_received'
  | 'quote_ready'
  | 'draft_order_changed'
  | 'acceptance_stale';

export interface AttuneNotificationEvent {
  readonly eventId: string;
  readonly workspaceId: string;
  readonly type: AttuneNotificationType;
  readonly occurredAt: string;
  readonly actorPrincipalId: string;
  readonly entityRefs: readonly string[];
  readonly payload: Readonly<Record<string, string | number | boolean | null>>;
}

export interface AttuneNotificationSink {
  publish(event: AttuneNotificationEvent): Promise<void>;
}
