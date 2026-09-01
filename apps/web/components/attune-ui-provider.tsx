'use client';

import { KumoPortalProvider } from '@cloudflare/kumo';
import { Toasty, createKumoToastManager } from '@cloudflare/kumo/components/toast';
import { TooltipProvider } from '@cloudflare/kumo/components/tooltip';
import { LiveblocksUiConfig } from '@liveblocks/react-ui';
import { useEffect, useRef, useState } from 'react';

export const attuneToastManager = createKumoToastManager();

export function AttuneUiProvider({ children }: { readonly children: React.ReactNode }) {
  const portalRef = useRef<HTMLDivElement>(null);
  const [liveblocksPortal, setLiveblocksPortal] = useState<HTMLDivElement>();

  useEffect(() => {
    if (portalRef.current) setLiveblocksPortal(portalRef.current);
  }, []);

  return (
    <>
      <div className="attune-application-root">
        <KumoPortalProvider container={portalRef}>
          <LiveblocksUiConfig portalContainer={liveblocksPortal}>
            <TooltipProvider>
              <Toasty toastManager={attuneToastManager}>{children}</Toasty>
            </TooltipProvider>
          </LiveblocksUiConfig>
        </KumoPortalProvider>
      </div>
      <div ref={portalRef} id="attune-overlay-root" />
    </>
  );
}
