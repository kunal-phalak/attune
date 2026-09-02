import { createKumoToastManager } from '@cloudflare/kumo/components/toast';

/** Shared by the editor shell and CanvasKit interaction surface without adding another state owner. */
export const editorToastManager = createKumoToastManager();
