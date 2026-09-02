import { describe, expect, it } from 'vitest';

import {
  filterLibraryProjects,
  mergeLibraryProjects,
  parseLibraryFilter,
  type LibraryProject,
} from './library';

const projects: readonly LibraryProject[] = [
  {
    workspaceId: 'workspace:owned',
    roomId: 'attune:workspace:owned',
    projectName: 'Spoke example',
    updatedAt: '2026-09-01T08:00:00.000Z',
    status: 'draft',
    access: 'owned',
    canManage: true,
    template: 'spoke',
  },
  {
    workspaceId: 'workspace:shared',
    roomId: 'attune:workspace:shared',
    projectName: 'Shared bracket',
    updatedAt: '2026-09-01T07:00:00.000Z',
    status: 'draft',
    access: 'shared',
    canManage: false,
    template: 'blank',
  },
];

describe('dashboard project filtering', () => {
  it('keeps recents, drafts, and shared routes semantically distinct', () => {
    expect(filterLibraryProjects(projects, 'recents', '')).toHaveLength(2);
    expect(filterLibraryProjects(projects, 'drafts', '')).toHaveLength(2);
    expect(filterLibraryProjects(projects, 'shared', '')).toEqual([projects[1]]);
  });

  it('filters the selected route by project name', () => {
    expect(filterLibraryProjects(projects, 'recents', 'spoke')).toEqual([projects[0]]);
    expect(filterLibraryProjects(projects, 'shared', 'spoke')).toEqual([]);
  });

  it('normalizes unsupported route values to recents', () => {
    expect(parseLibraryFilter('shared')).toBe('shared');
    expect(parseLibraryFilter('unknown')).toBe('recents');
  });

  it('projects Liveblocks room access into every relevant library view', () => {
    const merged = mergeLibraryProjects([projects[0]], [projects[1]]);
    expect(filterLibraryProjects(merged, 'recents', '')).toEqual(projects);
    expect(filterLibraryProjects(merged, 'drafts', '')).toEqual(projects);
    expect(filterLibraryProjects(merged, 'shared', '')).toEqual([projects[1]]);
  });

  it('keeps owned project capabilities when the Liveblocks projection overlaps', () => {
    const projectedOwnedRoom = { ...projects[0], access: 'shared' as const, canManage: false };
    expect(mergeLibraryProjects([projects[0]], [projectedOwnedRoom])).toEqual([projects[0]]);
  });
});
