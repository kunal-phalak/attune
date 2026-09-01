import type { AttuneRole, PanelGeometry, SketchDocument } from '@attune/domain';

export interface AttuneCollaborativeDraft {
  readonly intent: string;
  readonly commitmentId: 'AT-1042';
  readonly fabricationQuantity: 4;
  readonly geometry: PanelGeometry;
  readonly sketchDocument: SketchDocument;
  readonly draftVersion: number;
  readonly metadata: {
    readonly material: PanelGeometry['material'];
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
        avatar?: string;
        role: AttuneRole;
        color: string;
      };
    };
    RoomEvent: never;
    ThreadMetadata: {
      workspaceId: string;
      entityId?: string;
      worldX: number;
      worldY: number;
      /** Legacy coordinates retained only for reading threads created before world anchoring. */
      x?: number;
      y?: number;
      revisionId: string;
      specHash: string;
    };
  }
}
