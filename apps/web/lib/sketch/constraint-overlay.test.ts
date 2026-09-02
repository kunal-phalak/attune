import { createSketchDocument } from '@attune/domain';
import { describe, expect, it } from 'vitest';

import { projectConstraintOverlay } from './constraint-overlay';

describe('constraint overlay', () => {
  it('compacts dense constraints into finite icon and overflow positions', () => {
    const document = createSketchDocument({
      id: 'sketch:constraints',
      name: 'Constraints',
      entities: [{ id: 'line:a', kind: 'line', start: { x: 0, y: 0 }, end: { x: 20, y: 0 } }],
      constraints: (['horizontal', 'vertical', 'fixed', 'distance', 'parallel'] as const).map(
        (type, index) => ({
          id: `constraint:${index}`,
          version: 1,
          type,
          refs: [{ entityId: 'line:a' }],
        }),
      ),
      dimensions: [],
      groups: [],
      parameters: [],
    });
    const badges = projectConstraintOverlay(
      document,
      { worldToScreen: (point) => point },
      { entityIds: [], constraintIds: [] },
    );

    expect(badges).toHaveLength(3);
    expect(
      badges
        .filter(({ kind }) => kind === 'constraint')
        .map(({ constraintType }) => constraintType),
    ).toEqual(['horizontal', 'vertical']);
    expect(badges.at(-1)).toMatchObject({ kind: 'overflow', label: '+3' });
    expect(
      Math.max(...badges.map(({ screen }) => Math.hypot(screen.x - 10, screen.y))),
    ).toBeLessThan(60);
  });
});
