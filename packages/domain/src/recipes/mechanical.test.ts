import { describe, expect, it } from 'vitest';

import { applySketchCommand } from '../sketch/commands';
import { emptySketchDocument } from '../sketch/document';
import { geometryNodeIds } from '../sketch/geometry';
import { instantiateMechanicalRecipe } from './mechanical';
import { MECHANICAL_RECIPE_CATALOG } from './types';

function circles(entities: ReturnType<typeof instantiateMechanicalRecipe>['document']['entities']) {
  return entities.filter(
    (entity): entity is Extract<(typeof entities)[number], { kind: 'circle' }> =>
      entity.kind === 'circle',
  );
}

describe('deterministic mechanical design recipes', () => {
  it('publishes the small typed catalog with editable parameters and semantic groups', () => {
    expect(MECHANICAL_RECIPE_CATALOG.map(({ id }) => id)).toEqual([
      'round_plate',
      'annular_ring',
      'rounded_rectangle_plate',
      'mounting_plate',
      'bolt_circle',
      'slotted_plate',
      'spoked_wheel',
      'radial_pattern',
    ]);
    expect(
      MECHANICAL_RECIPE_CATALOG.every(
        ({ title, description, requiredParameters, generatedSemanticGroups, editableParameters }) =>
          title.length > 0 &&
          description.length > 0 &&
          requiredParameters.length > 0 &&
          generatedSemanticGroups.length > 0 &&
          editableParameters.length > 0,
      ),
    ).toBe(true);
  });

  it('creates the round mounting plate acceptance geometry in one deterministic recipe', () => {
    const first = instantiateMechanicalRecipe({
      sourceRef: 'recipe:round:acceptance',
      recipe: 'round_plate',
      parameters: {
        outerDiameter: 160,
        centerBoreDiameter: 40,
        holePattern: { pitchCircleDiameter: 120, holeDiameter: 6, count: 4 },
      },
    });
    const second = instantiateMechanicalRecipe({
      sourceRef: 'recipe:round:acceptance',
      recipe: 'round_plate',
      parameters: {
        outerDiameter: 160,
        centerBoreDiameter: 40,
        holePattern: { pitchCircleDiameter: 120, holeDiameter: 6, count: 4 },
      },
    });
    const circleEntities = circles(first.document.entities);

    expect(first.document).toEqual(second.document);
    expect(circleEntities).toHaveLength(6);
    expect(circleEntities.map(({ radius }) => radius).toSorted((a, b) => a - b)).toEqual([
      3, 3, 3, 3, 20, 80,
    ]);
    expect(
      circleEntities
        .filter(({ radius }) => radius === 3)
        .map(({ center }) => Math.hypot(center.x, center.y)),
    ).toEqual([60, 60, 60, 60]);
    expect(first.provenance).toEqual(
      expect.objectContaining({
        recipeId: 'round_plate',
        sourceRef: 'recipe:round:acceptance',
        status: 'pristine',
      }),
    );
  });

  it('builds analytic rounded plates, rings, slots, patterns, and wheels', () => {
    const mountingPlate = instantiateMechanicalRecipe({
      sourceRef: 'recipe:mounting:acceptance',
      recipe: 'mounting_plate',
      parameters: {
        width: 120,
        height: 80,
        cornerRadius: 10,
        holeDiameter: 5,
        holeSpacingX: 90,
        holeSpacingY: 50,
      },
    }).document;
    const ring = instantiateMechanicalRecipe({
      sourceRef: 'recipe:ring:acceptance',
      recipe: 'annular_ring',
      parameters: { outerDiameter: 100, innerDiameter: 60 },
    }).document;
    const slot = instantiateMechanicalRecipe({
      sourceRef: 'recipe:slot:acceptance',
      recipe: 'slotted_plate',
      parameters: { width: 120, height: 80, cornerRadius: 8, slotLength: 50, slotWidth: 10 },
    }).document;
    const wheel = instantiateMechanicalRecipe({
      sourceRef: 'recipe:wheel:acceptance',
      recipe: 'spoked_wheel',
      parameters: { spokeCount: 6 },
    }).document;

    expect(mountingPlate.entities.filter(({ kind }) => kind === 'line')).toHaveLength(4);
    expect(mountingPlate.entities.filter(({ kind }) => kind === 'arc')).toHaveLength(4);
    expect(mountingPlate.entities.filter(({ kind }) => kind === 'circle')).toHaveLength(4);
    expect(circles(ring.entities).map(({ radius }) => radius)).toEqual([30, 50]);
    expect(slot.entities.filter(({ kind }) => kind === 'arc')).toHaveLength(6);
    expect(wheel.entities.some(({ name }) => name === 'center-bore')).toBe(true);
    expect(Math.max(...circles(wheel.entities).map(({ radius }) => radius))).toBe(100);
  });

  it('preserves shared topology and allows direct editing after generation', () => {
    const command = {
      type: 'instantiate_recipe' as const,
      sourceRef: 'recipe:rounded:editable',
      recipe: 'rounded_rectangle_plate' as const,
      parameters: { width: 100, height: 60, cornerRadius: 8 },
    };
    const created = applySketchCommand(emptySketchDocument(), command).document;
    const top = created.entities.find(({ name }) => name === 'plate-boundary-top');
    const corner = created.entities.find(({ name }) => name === 'outer-fillet-top-right');
    if (!top || !corner) throw new TypeError('Missing rounded plate entities.');

    expect(geometryNodeIds(top).some((id) => geometryNodeIds(corner).includes(id))).toBe(true);
    const edited = applySketchCommand(created, {
      type: 'set_radius',
      target: { entityId: corner.id, expectedVersion: corner.version },
      radius: 5,
    }).document;
    expect(edited.entities.find(({ id }) => id === corner.id)).toEqual(
      expect.objectContaining({ radius: 5, version: 2 }),
    );
  });
});
