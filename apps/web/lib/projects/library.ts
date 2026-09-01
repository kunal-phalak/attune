export type LibraryFilter = 'recents' | 'drafts' | 'shared';
export type SketchTemplate = 'blank' | 'spoke';

export interface LibraryProject {
  readonly workspaceId: string;
  readonly roomId: string;
  readonly projectName: string;
  readonly updatedAt: string;
  readonly status: 'draft';
  readonly access: 'owned' | 'shared';
  readonly template: SketchTemplate;
}

export function parseLibraryFilter(value: string | undefined): LibraryFilter {
  return value === 'drafts' || value === 'shared' ? value : 'recents';
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
