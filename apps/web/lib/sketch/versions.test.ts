import { createSketchDocument } from '@attune/domain';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { sketchDocumentFromYjsVersion, sketchSnapshotFromDocument } from './versions';

describe('Yjs sketch version adapter', () => {
  const sketch = createSketchDocument({
    id: 'sketch:version',
    name: 'Version fixture',
    entities: [{ id: 'circle', kind: 'circle', center: { x: 2, y: 3 }, radius: 5 }],
    constraints: [],
    dimensions: [],
    groups: [],
    parameters: [],
  });

  it('extracts the canonical sketch from historical Yjs room data', () => {
    const document = new Y.Doc();
    document.getMap('attune').set('draft', { sketchDocument: sketch });
    const restored = sketchDocumentFromYjsVersion(Y.encodeStateAsUpdate(document));
    expect(restored).toEqual(sketch);
    document.destroy();
  });

  it('serializes a semantic restore snapshot without derived versions or topology copies', () => {
    const snapshot = sketchSnapshotFromDocument(sketch);
    expect(snapshot.entities[0]).toEqual({
      id: 'circle',
      kind: 'circle',
      center: { x: 2, y: 3 },
      radius: 5,
    });
    expect(snapshot.entities[0]).not.toHaveProperty('version');
    expect(snapshot.entities[0]).not.toHaveProperty('centerNodeId');
  });
});
