import type { AttuneRole, PanelGeometry } from '@attune/domain';

export interface AttuneCollaborativeDraft {
  readonly intent: string;
  readonly commitmentId: 'AT-1042';
  readonly fabricationQuantity: 4;
  readonly geometry: PanelGeometry;
  readonly draftVersion: number;
  readonly metadata: {
    readonly material: 'acrylic';
    readonly thicknessMm: number;
  };
}

declare global {
  interface Liveblocks {
    Presence: {
      cursor: { x: number; y: number } | null;
      selection: string[];
      currentTool: string;
      activeActor: {
        id: string;
        name: string;
        role: AttuneRole;
      };
    };
    UserMeta: {
      id: string;
      info: {
        name: string;
        role: AttuneRole;
        color: string;
      };
    };
    RoomEvent: never;
    ThreadMetadata: {
      workspaceId: string;
      entityId: string;
      x: number;
      y: number;
    };
  }
}
