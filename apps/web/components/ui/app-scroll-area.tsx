'use client';

import { ScrollArea } from '@cloudflare/kumo/primitives/scroll-area';

function join(...values: (string | undefined)[]) {
  return values.filter(Boolean).join(' ');
}

export function AppScrollArea({
  children,
  className,
  contentClassName,
  ariaLabel,
}: {
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly contentClassName?: string;
  readonly ariaLabel?: string;
}) {
  return (
    <ScrollArea.Root className={join('relative min-h-0 min-w-0 overflow-hidden', className)}>
      <ScrollArea.Viewport
        className="h-full w-full overscroll-contain focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-kumo-focus"
        aria-label={ariaLabel}
        tabIndex={ariaLabel ? 0 : undefined}
      >
        <ScrollArea.Content className={join('min-h-full min-w-0', contentClassName)}>
          {children}
        </ScrollArea.Content>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar className="flex w-2 touch-none select-none p-0.5 opacity-30 transition-opacity duration-100 data-[hovering]:opacity-100 data-[scrolling]:opacity-100 data-[orientation=horizontal]:h-2 data-[orientation=horizontal]:w-auto data-[orientation=horizontal]:flex-col">
        <ScrollArea.Thumb className="flex-1 rounded-full bg-kumo-interact" />
      </ScrollArea.Scrollbar>
      <ScrollArea.Corner className="bg-kumo-recessed" />
    </ScrollArea.Root>
  );
}
