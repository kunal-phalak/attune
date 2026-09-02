import type { AttuneRole, PanelGeometry, SketchDocument } from '@attune/domain';

export interface AttuneCollaborativeDraft {
  readonly intent: string;
  readonly commitmentId: 'AT-1042';
  readonly fabricationQuantity: 4;
  readonly geometry: PanelGeometry;
  readonly sketchDocument: SketchDocument;
  readonly draftVersion: number;
  readonly workspaceSeq: number;
  readonly capabilityEpoch: number;
  readonly authorityEpoch: number;
  readonly specHash: string;
  readonly metadata: {
    readonly material: PanelGeometry['material'];
    readonly thicknessMm: number;
  };
}

export function isAttuneCollaborativeDraft(value: unknown): value is AttuneCollaborativeDraft {
  if (typeof value !== 'object' || value === null) return false;
  const geometry = Reflect.get(value, 'geometry');
  return (
    Reflect.get(value, 'commitmentId') === 'AT-1042' &&
    Reflect.get(value, 'fabricationQuantity') === 4 &&
    Number.isInteger(Reflect.get(value, 'draftVersion')) &&
    Number.isInteger(Reflect.get(value, 'workspaceSeq')) &&
    Number.isInteger(Reflect.get(value, 'capabilityEpoch')) &&
    Number.isInteger(Reflect.get(value, 'authorityEpoch')) &&
    typeof Reflect.get(value, 'specHash') === 'string' &&
    typeof geometry === 'object' &&
    geometry !== null &&
    typeof Reflect.get(value, 'sketchDocument') === 'object' &&
    Reflect.get(value, 'sketchDocument') !== null
  );
}

declare global {
  interface Liveblocks {
    Presence: {
      cursor: { x: number; y: number } | null;
      selectedEntityIds?: string[];
      selectedNodeIds?: string[];
      selectedConstraintIds?: string[];
      activeTool?: string;
      activity?: string;
      /** Legacy dashboard room previews; editor presence uses the semantic fields above. */
      selection?: string[];
      currentTool?: string;
      activeActor?: {
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
      nodeId?: string;
      worldX: number;
      worldY: number;
      /** Legacy coordinates retained only for reading threads created before world anchoring. */
      x?: number;
      y?: number;
      revisionId: string;
      specHash: string;
    };
    ActivitiesData: {
      $attuneActivity: {
        title: string;
        description: string;
        workspaceId: string;
        actorId?: string;
      };
    };
  }
}
