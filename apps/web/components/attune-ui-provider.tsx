'use client';

import { Toasty, createKumoToastManager } from '@cloudflare/kumo/components/toast';
import { TooltipProvider } from '@cloudflare/kumo/components/tooltip';

export const attuneToastManager = createKumoToastManager();

export function AttuneUiProvider({ children }: { readonly children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <Toasty toastManager={attuneToastManager}>{children}</Toasty>
    </TooltipProvider>
  );
}
