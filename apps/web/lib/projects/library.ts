export type LibraryFilter = 'recents' | 'drafts' | 'shared';
export type SketchTemplate = 'blank' | 'spoke';

export interface LibraryProject {
  readonly workspaceId: string;
  readonly roomId: string;
  readonly projectName: string;
  readonly updatedAt: string;
  readonly status: 'draft';
  readonly access: 'owned' | 'shared';
  readonly canManage: boolean;
  readonly template: SketchTemplate;
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
