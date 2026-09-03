export type LibraryFilter = 'recents' | 'drafts' | 'shared';
export type SketchTemplate = 'blank' | 'spoke';

export type SketchThumbnailEntity =
  | {
      readonly kind: 'line';
      readonly id: string;
      readonly start: { readonly x: number; readonly y: number };
      readonly end: { readonly x: number; readonly y: number };
    }
  | {
      readonly kind: 'circle';
      readonly id: string;
      readonly center: { readonly x: number; readonly y: number };
      readonly radius: number;
    }
  | {
      readonly kind: 'arc';
      readonly id: string;
      readonly start: { readonly x: number; readonly y: number };
      readonly end: { readonly x: number; readonly y: number };
      readonly radius: number;
      readonly largeArc: boolean;
    }
  | {
      readonly kind: 'polyline';
      readonly id: string;
      readonly points: readonly { readonly x: number; readonly y: number }[];
    };

export interface SketchThumbnail {
  readonly bounds: {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
  };
  readonly entities: readonly SketchThumbnailEntity[];
}

export interface LibraryProject {
  readonly workspaceId: string;
  readonly roomId: string;
  readonly projectName: string;
  readonly updatedAt: string;
  readonly status: 'draft';
  readonly access: 'owned' | 'shared';
  readonly canManage: boolean;
  readonly template: SketchTemplate;
  readonly thumbnail: SketchThumbnail;
}

export function parseLibraryFilter(value: string | undefined): LibraryFilter {
  return value === 'drafts' || value === 'shared' ? value : 'recents';
}

export function mergeLibraryProjects(
  membershipProjects: readonly LibraryProject[],
  liveblocksProjects: readonly LibraryProject[],
): readonly LibraryProject[] {
  const projects = new Map<string, LibraryProject>();
  for (const project of [...liveblocksProjects, ...membershipProjects]) {
    const current = projects.get(project.workspaceId);
    if (!current || project.access === 'owned' || project.canManage) {
      projects.set(project.workspaceId, project);
    }
  }
  return [...projects.values()].toSorted(
    (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
}

export function filterLibraryProjects(
  projects: readonly LibraryProject[],
  filter: LibraryFilter,
  query: string,
): readonly LibraryProject[] {
  const normalized = query.trim().toLowerCase();
  return projects.filter((project) => {
    const matchesRoute =
      filter === 'recents' ||
      (filter === 'drafts' && project.status === 'draft') ||
      (filter === 'shared' && project.access === 'shared');
    return matchesRoute && project.projectName.toLowerCase().includes(normalized);
  });
}
