import { createAt1042Workspace, transitionWorkspace } from '@attune/domain';
import { describe, expect, it } from 'vitest';

import { resolveManufacturingVersionSelection } from './version-selection';

const configuration = {
  material: 'aluminium' as const,
  thicknessMm: 3,
  finish: 'As cut',
  quantity: 2,
  toleranceMm: 0.2,
};

function transition(
  workspace: ReturnType<typeof createAt1042Workspace>,
  command: Parameters<typeof transitionWorkspace>[1],
  commandId: string,
) {
  return transitionWorkspace(workspace, command, {
    commandId,
    now: '2026-09-03T00:00:00.000Z',
  }).workspace;
}

describe('manufacturing version selection', () => {
  it('projects current configuration onto the current draft', () => {
    const workspace = createAt1042Workspace();
    const selection = resolveManufacturingVersionSelection(workspace, 'current', {
      ...configuration,
      material: 'acrylic',
      thicknessMm: 5,
    });

    expect(selection.version).toBeNull();
    expect(selection.geometry).toMatchObject({ material: 'acrylic', thickness: 5 });
  });

  it('loads exact saved geometry and canonicalizes its material and thickness', () => {
    const saved = transition(
      createAt1042Workspace(),
      { type: 'save_design_version', name: 'Manufacturing baseline' },
      'save-v1',
    );
    const version = saved.savedVersions[0];
    const selection = resolveManufacturingVersionSelection(saved, version.versionId, {
      ...configuration,
      material: 'acrylic',
      thicknessMm: 5,
    });

    expect(selection.version?.versionId).toBe(version.versionId);
    expect(selection.geometry).toEqual(version.geometry);
    expect(selection.configuration).toMatchObject({
      material: version.geometry.material,
      thicknessMm: version.geometry.thickness,
    });
  });
});
