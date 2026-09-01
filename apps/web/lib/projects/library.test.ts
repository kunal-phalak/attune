import { describe, expect, it } from 'vitest';

import { filterLibraryProjects, parseLibraryFilter, type LibraryProject } from './library';

const projects: readonly LibraryProject[] = [
  {
    workspaceId: 'workspace:owned',
    roomId: 'attune:workspace:owned',
    projectName: 'Spoke example',
    updatedAt: '2026-09-01T08:00:00.000Z',
    status: 'draft',
    access: 'owned',
    template: 'spoke',
  },
  {
    workspaceId: 'workspace:shared',
    roomId: 'attune:workspace:shared',
    projectName: 'Shared bracket',
    updatedAt: '2026-09-01T07:00:00.000Z',
    status: 'draft',
    access: 'shared',
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
});
