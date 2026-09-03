import makerjs from 'makerjs';
import makerjsMetadata from 'makerjs/package.json';

import { createStraightSpokesModel, importMakerJsModel } from '../maker/makerjs-adapter';
import type { SketchDocument, SketchParameter } from '../sketch/document';
import type {
  DesignRecipeProvenance,
  DesignRequestContext,
  MechanicalRecipeId,
  RecipeParameterValues,
  RecipePlacement,
} from './types';
import { mechanicalRecipeDefinition } from './types';

export interface InstantiateMechanicalRecipeInput {
  readonly sourceRef: string;
  readonly recipe: MechanicalRecipeId;
  readonly parameters: RecipeParameterValues;
  readonly placement?: RecipePlacement;
  readonly designRequest?: DesignRequestContext;
  readonly status?: DesignRecipeProvenance['status'];
}

export interface MechanicalRecipeFragment {
  readonly document: SketchDocument;
  readonly provenance: DesignRecipeProvenance;
}

type MutableModel = MakerJs.IModel & { layer?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new TypeError(`${name} must be an object.`);
  }
  return value;
}

function exact(value: Record<string, unknown>, keys: readonly string[], name: string): void {
  const unknown = Object.keys(value).filter((key) => !keys.includes(key));
  if (unknown.length > 0) {
    throw new TypeError(`${name} contains unsupported parameters: ${unknown.join(', ')}.`);
  }
}

function positive(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive finite number.`);
  }
  return value;
}

function optionalPositive(value: unknown, name: string): number | undefined {
  return value === undefined ? undefined : positive(value, name);
}

function finite(value: unknown, name: string, fallback = 0): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number.`);
  }
  return value;
}

function count(value: unknown, name: string, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 2 || value > 64) {
    throw new TypeError(`${name} must be an integer between 2 and 64.`);
  }
  return value;
}

function safeSourceRef(value: string): string {
  if (!/^[a-zA-Z0-9:_-]+$/.test(value) || value.length > 160) {
    throw new TypeError('Recipe sourceRef must be a stable public reference.');
  }
  return value;
}

function model(paths: MakerJs.IPathMap, layer: string): MutableModel {
  return { paths, layer, units: makerjs.unitType.Millimeter };
}

function circle(radius: number, id: string, layer: string): MutableModel {
  return model({ [id]: new makerjs.paths.Circle([0, 0], radius) }, layer);
}

function roundedRectangle(width: number, height: number, radius: number): MutableModel {
  if (radius > Math.min(width, height) / 2) {
    throw new TypeError('cornerRadius cannot exceed half of the shortest plate side.');
  }
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  if (radius === 0) {
    return model(
      {
        'plate-boundary-top': new makerjs.paths.Line(
          [-halfWidth, halfHeight],
          [halfWidth, halfHeight],
        ),
        'plate-boundary-right': new makerjs.paths.Line(
          [halfWidth, halfHeight],
          [halfWidth, -halfHeight],
        ),
        'plate-boundary-bottom': new makerjs.paths.Line(
          [halfWidth, -halfHeight],
          [-halfWidth, -halfHeight],
        ),
        'plate-boundary-left': new makerjs.paths.Line(
          [-halfWidth, -halfHeight],
          [-halfWidth, halfHeight],
        ),
      },
      'plate_boundary',
    );
  }
  return model(
    {
      'plate-boundary-top': new makerjs.paths.Line(
        [-halfWidth + radius, halfHeight],
        [halfWidth - radius, halfHeight],
      ),
      'plate-boundary-right': new makerjs.paths.Line(
        [halfWidth, halfHeight - radius],
        [halfWidth, -halfHeight + radius],
      ),
      'plate-boundary-bottom': new makerjs.paths.Line(
        [halfWidth - radius, -halfHeight],
        [-halfWidth + radius, -halfHeight],
      ),
      'plate-boundary-left': new makerjs.paths.Line(
        [-halfWidth, -halfHeight + radius],
        [-halfWidth, halfHeight - radius],
      ),
      'outer-fillet-top-right': new makerjs.paths.Arc(
        [halfWidth - radius, halfHeight - radius],
        radius,
        0,
        90,
      ),
      'outer-fillet-top-left': new makerjs.paths.Arc(
        [-halfWidth + radius, halfHeight - radius],
        radius,
        90,
        180,
      ),
      'outer-fillet-bottom-left': new makerjs.paths.Arc(
        [-halfWidth + radius, -halfHeight + radius],
        radius,
        180,
        270,
      ),
      'outer-fillet-bottom-right': new makerjs.paths.Arc(
        [halfWidth - radius, -halfHeight + radius],
        radius,
        270,
        360,
      ),
    },
    'plate_boundary',
  );
}

function circularPattern(
  pitchCircleDiameter: number,
  featureDiameter: number,
  featureCount: number,
  rotationDegrees: number,
  prefix: string,
  layer: string,
): MutableModel {
  const paths: MakerJs.IPathMap = {};
  for (let index = 0; index < featureCount; index += 1) {
    const angle = ((rotationDegrees + (index * 360) / featureCount) * Math.PI) / 180;
    paths[`${prefix}-${index + 1}`] = new makerjs.paths.Circle(
      [Math.cos(angle) * (pitchCircleDiameter / 2), Math.sin(angle) * (pitchCircleDiameter / 2)],
      featureDiameter / 2,
    );
  }
  return model(paths, layer);
}

function capsule(length: number, width: number): MutableModel {
  if (length <= width) throw new TypeError('slotLength must be greater than slotWidth.');
  const radius = width / 2;
  const halfStraight = (length - width) / 2;
  return model(
    {
      'slot-side-top': new makerjs.paths.Line([-halfStraight, radius], [halfStraight, radius]),
      'slot-side-bottom': new makerjs.paths.Line([halfStraight, -radius], [-halfStraight, -radius]),
      'slot-end-left': new makerjs.paths.Arc([-halfStraight, 0], radius, 90, 270),
      'slot-end-right': new makerjs.paths.Arc([halfStraight, 0], radius, 270, 450),
    },
    'slot',
  );
}

function placed(input: MakerJs.IModel, placement: RecipePlacement): MakerJs.IModel {
  if (!Number.isFinite(placement.center.x) || !Number.isFinite(placement.center.y)) {
    throw new TypeError('Recipe placement center must contain finite coordinates.');
  }
  const rotation = finite(placement.rotationDegrees, 'placement.rotationDegrees');
  if (rotation !== 0) makerjs.model.rotate(input, rotation, [0, 0]);
  if (placement.center.x !== 0 || placement.center.y !== 0) {
    makerjs.model.moveRelative(input, [placement.center.x, placement.center.y]);
  }
  return input;
}

function recipeModel(
  recipe: MechanicalRecipeId,
  raw: RecipeParameterValues,
): {
  readonly model: MakerJs.IModel;
  readonly parameters: RecipeParameterValues;
} {
  const parameters = record(raw, `${recipe}.parameters`);
  if (recipe === 'round_plate') {
    exact(parameters, ['outerDiameter', 'centerBoreDiameter', 'holePattern'], recipe);
    const outerDiameter = positive(parameters.outerDiameter, 'outerDiameter');
    const centerBoreDiameter = optionalPositive(
      parameters.centerBoreDiameter,
      'centerBoreDiameter',
    );
    if (centerBoreDiameter !== undefined && centerBoreDiameter >= outerDiameter) {
      throw new TypeError('centerBoreDiameter must be smaller than outerDiameter.');
    }
    const holePattern =
      parameters.holePattern === undefined
        ? undefined
        : record(parameters.holePattern, 'holePattern');
    let normalizedPattern: RecipeParameterValues | undefined;
    let holes: MakerJs.IModel | undefined;
    if (holePattern) {
      exact(
        holePattern,
        ['pitchCircleDiameter', 'holeDiameter', 'count', 'rotation'],
        'holePattern',
      );
      const pitchCircleDiameter = positive(
        holePattern.pitchCircleDiameter,
        'holePattern.pitchCircleDiameter',
      );
      const holeDiameter = positive(holePattern.holeDiameter, 'holePattern.holeDiameter');
      const holeCount = count(holePattern.count, 'holePattern.count');
      const rotation = finite(holePattern.rotation, 'holePattern.rotation');
      if (pitchCircleDiameter / 2 + holeDiameter / 2 >= outerDiameter / 2) {
        throw new TypeError('The hole pattern must remain inside the plate boundary.');
      }
      normalizedPattern = { pitchCircleDiameter, holeDiameter, count: holeCount, rotation };
      holes = circularPattern(
        pitchCircleDiameter,
        holeDiameter,
        holeCount,
        rotation,
        'mounting-hole',
        'mounting_hole',
      );
    }
    return {
      model: {
        models: {
          'Plate boundary': circle(outerDiameter / 2, 'outer-rim', 'outer_rim'),
          ...(centerBoreDiameter
            ? { 'Center bore': circle(centerBoreDiameter / 2, 'center-bore', 'center_bore') }
            : {}),
          ...(holes ? { 'Mounting holes': holes } : {}),
        },
        units: makerjs.unitType.Millimeter,
      },
      parameters: {
        outerDiameter,
        ...(centerBoreDiameter ? { centerBoreDiameter } : {}),
        ...(normalizedPattern ? { holePattern: normalizedPattern } : {}),
      },
    };
  }
  if (recipe === 'annular_ring') {
    exact(parameters, ['outerDiameter', 'innerDiameter'], recipe);
    const outerDiameter = positive(parameters.outerDiameter, 'outerDiameter');
    const innerDiameter = positive(parameters.innerDiameter, 'innerDiameter');
    if (innerDiameter >= outerDiameter)
      throw new TypeError('innerDiameter must be smaller than outerDiameter.');
    return {
      model: {
        models: {
          'Outer rim': circle(outerDiameter / 2, 'outer-rim', 'outer_rim'),
          'Inner rim': circle(innerDiameter / 2, 'inner-rim', 'inner_rim'),
        },
        units: makerjs.unitType.Millimeter,
      },
      parameters: { outerDiameter, innerDiameter },
    };
  }
  if (recipe === 'rounded_rectangle_plate') {
    exact(parameters, ['width', 'height', 'cornerRadius'], recipe);
    const width = positive(parameters.width, 'width');
    const height = positive(parameters.height, 'height');
    const cornerRadius = finite(parameters.cornerRadius, 'cornerRadius');
    if (cornerRadius < 0) throw new TypeError('cornerRadius cannot be negative.');
    return {
      model: {
        models: { 'Plate boundary': roundedRectangle(width, height, cornerRadius) },
        units: makerjs.unitType.Millimeter,
      },
      parameters: { width, height, cornerRadius },
    };
  }
  if (recipe === 'mounting_plate') {
    exact(
      parameters,
      [
        'width',
        'height',
        'cornerRadius',
        'holeDiameter',
        'holeSpacingX',
        'holeSpacingY',
        'centerBoreDiameter',
      ],
      recipe,
    );
    const width = positive(parameters.width, 'width');
    const height = positive(parameters.height, 'height');
    const cornerRadius = finite(parameters.cornerRadius, 'cornerRadius');
    const holeDiameter = positive(parameters.holeDiameter, 'holeDiameter');
    const holeSpacingX = positive(parameters.holeSpacingX, 'holeSpacingX');
    const holeSpacingY = positive(parameters.holeSpacingY, 'holeSpacingY');
    const centerBoreDiameter = optionalPositive(
      parameters.centerBoreDiameter,
      'centerBoreDiameter',
    );
    if (cornerRadius < 0) throw new TypeError('cornerRadius cannot be negative.');
    if (holeSpacingX + holeDiameter >= width || holeSpacingY + holeDiameter >= height) {
      throw new TypeError('Mounting holes must remain inside the plate boundary.');
    }
    const holes: MakerJs.IPathMap = {};
    const centers: readonly [number, number][] = [
      [-holeSpacingX / 2, -holeSpacingY / 2],
      [holeSpacingX / 2, -holeSpacingY / 2],
      [holeSpacingX / 2, holeSpacingY / 2],
      [-holeSpacingX / 2, holeSpacingY / 2],
    ];
    centers.forEach((center, index) => {
      holes[`mounting-hole-${index + 1}`] = new makerjs.paths.Circle(center, holeDiameter / 2);
    });
    return {
      model: {
        models: {
          'Plate boundary': roundedRectangle(width, height, cornerRadius),
          'Mounting holes': model(holes, 'mounting_hole'),
          ...(centerBoreDiameter
            ? { 'Center bore': circle(centerBoreDiameter / 2, 'center-bore', 'center_bore') }
            : {}),
        },
        units: makerjs.unitType.Millimeter,
      },
      parameters: {
        width,
        height,
        cornerRadius,
        holeDiameter,
        holeSpacingX,
        holeSpacingY,
        ...(centerBoreDiameter ? { centerBoreDiameter } : {}),
      },
    };
  }
  if (recipe === 'bolt_circle' || recipe === 'radial_pattern') {
    const featureKey = recipe === 'bolt_circle' ? 'holeDiameter' : 'featureDiameter';
    exact(parameters, ['pitchCircleDiameter', featureKey, 'count', 'rotation'], recipe);
    const pitchCircleDiameter = positive(parameters.pitchCircleDiameter, 'pitchCircleDiameter');
    const featureDiameter = positive(parameters[featureKey], featureKey);
    const featureCount = count(parameters.count, 'count');
    const rotation = finite(parameters.rotation, 'rotation');
    const group = recipe === 'bolt_circle' ? 'Mounting holes' : 'Radial features';
    return {
      model: {
        models: {
          [group]: circularPattern(
            pitchCircleDiameter,
            featureDiameter,
            featureCount,
            rotation,
            recipe === 'bolt_circle' ? 'mounting-hole' : 'radial-feature',
            recipe === 'bolt_circle' ? 'mounting_hole' : 'radial_pattern',
          ),
        },
        units: makerjs.unitType.Millimeter,
      },
      parameters: {
        pitchCircleDiameter,
        [featureKey]: featureDiameter,
        count: featureCount,
        rotation,
      },
    };
  }
  if (recipe === 'slotted_plate') {
    exact(parameters, ['width', 'height', 'cornerRadius', 'slotLength', 'slotWidth'], recipe);
    const width = positive(parameters.width, 'width');
    const height = positive(parameters.height, 'height');
    const cornerRadius = finite(parameters.cornerRadius, 'cornerRadius');
    const slotLength = positive(parameters.slotLength, 'slotLength');
    const slotWidth = positive(parameters.slotWidth, 'slotWidth');
    if (cornerRadius < 0) throw new TypeError('cornerRadius cannot be negative.');
    if (slotLength >= width || slotWidth >= height) {
      throw new TypeError('The slot must remain inside the plate boundary.');
    }
    return {
      model: {
        models: {
          'Plate boundary': roundedRectangle(width, height, cornerRadius),
          Slot: capsule(slotLength, slotWidth),
        },
        units: makerjs.unitType.Millimeter,
      },
      parameters: { width, height, cornerRadius, slotLength, slotWidth },
    };
  }
  exact(
    parameters,
    [
      'spokeCount',
      'outerDiameter',
      'centerBoreDiameter',
      'hubDiameter',
      'spokeWidth',
      'innerFillet',
      'outerFillet',
    ],
    recipe,
  );
  const spokeCount = count(parameters.spokeCount, 'spokeCount');
  const outerDiameter = optionalPositive(parameters.outerDiameter, 'outerDiameter') ?? 200;
  const centerBoreDiameter =
    optionalPositive(parameters.centerBoreDiameter, 'centerBoreDiameter') ?? 24;
  const hubDiameter = optionalPositive(parameters.hubDiameter, 'hubDiameter') ?? 68;
  const spokeWidth = optionalPositive(parameters.spokeWidth, 'spokeWidth') ?? 9;
  const innerFillet = optionalPositive(parameters.innerFillet, 'innerFillet') ?? 3;
  const outerFillet = optionalPositive(parameters.outerFillet, 'outerFillet') ?? 3;
  if (centerBoreDiameter >= hubDiameter || hubDiameter >= outerDiameter) {
    throw new TypeError('The center bore, hub, and outer diameters must increase in that order.');
  }
  const generatorOuterRadius = outerDiameter / 2 - spokeWidth;
  if (generatorOuterRadius <= hubDiameter / 2) {
    throw new TypeError('outerDiameter must leave room for the hub, spokes, and outer rim.');
  }
  const wheel = createStraightSpokesModel({
    // makerjs-spokes-straight adds a rim one spoke-width outside outerRadius.
    // Offset the substrate parameter so the recipe's public outerDiameter stays authoritative.
    outerRadius: generatorOuterRadius,
    innerRadius: hubDiameter / 2,
    spokeCount,
    spokeWidth,
    offsetPercent: 62,
    innerFillet,
    outerFillet,
    addRing: true,
  }) as MutableModel;
  wheel.layer = 'wheel_body';
  return {
    model: {
      models: {
        'Wheel body': wheel,
        'Center bore': circle(centerBoreDiameter / 2, 'center-bore', 'center_bore'),
      },
      units: makerjs.unitType.Millimeter,
    },
    parameters: {
      spokeCount,
      outerDiameter,
      centerBoreDiameter,
      hubDiameter,
      spokeWidth,
      innerFillet,
      outerFillet,
    },
  };
}

function parameterValues(
  sourceRef: string,
  value: RecipeParameterValues,
  prefix = '',
): readonly SketchParameter[] {
  return Object.entries(value).flatMap(([name, candidate]): readonly SketchParameter[] => {
    const path = prefix ? `${prefix}-${name}` : name;
    if (typeof candidate === 'number') {
      return [
        {
          id: `${sourceRef}:parameter:${path.replaceAll(/[^a-zA-Z0-9_-]/g, '-')}`,
          version: 1,
          name: path.replaceAll('-', ' '),
          value: candidate,
          unit: name.toLowerCase().includes('count')
            ? 'unitless'
            : name === 'rotation'
              ? 'deg'
              : 'mm',
        },
      ];
    }
    if (isRecord(candidate)) {
      return parameterValues(sourceRef, candidate, path);
    }
    return [];
  });
}

export function instantiateMechanicalRecipe(
  input: InstantiateMechanicalRecipeInput,
): MechanicalRecipeFragment {
  const sourceRef = safeSourceRef(input.sourceRef);
  const definition = mechanicalRecipeDefinition(input.recipe);
  const placement: RecipePlacement = input.placement ?? { center: { x: 0, y: 0 } };
  const generated = recipeModel(input.recipe, input.parameters);
  const provenance: DesignRecipeProvenance = {
    kind: 'design-recipe',
    sourceRef,
    recipeId: input.recipe,
    title: definition.title,
    parameters: generated.parameters,
    placement,
    ...(input.designRequest ? { designRequest: input.designRequest } : {}),
    generator: {
      substrate: 'makerjs',
      package: makerjsMetadata.name,
      packageVersion: makerjsMetadata.version,
    },
    status: input.status ?? 'pristine',
  };
  const scalarParameters = Object.fromEntries(
    parameterValues(sourceRef, generated.parameters).map(({ id, value }) => [id, value]),
  );
  const document = importMakerJsModel(placed(generated.model, placement), {
    documentId: `sketch:${sourceRef}`,
    name: definition.title,
    idNamespace: sourceRef,
    rootGroupId: sourceRef,
    rootGroupName: definition.title,
    rootGroupSourceRef: provenance,
    source: {
      kind: 'maker-generator',
      package: '@attune/mechanical-recipes',
      packageVersion: '1',
      generator: input.recipe,
      parameters: scalarParameters,
    },
    parameters: parameterValues(sourceRef, generated.parameters),
  });
  return { document, provenance };
}

export function mergeRecipeParameterChanges(
  current: RecipeParameterValues,
  changes: RecipeParameterValues,
): RecipeParameterValues {
  return Object.fromEntries(
    Object.entries({ ...current, ...changes }).map(([key, value]) => {
      const prior = current[key];
      if (
        typeof prior === 'object' &&
        prior !== null &&
        !Array.isArray(prior) &&
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value)
      ) {
        return [key, { ...record(prior, key), ...record(value, key) }];
      }
      return [key, value];
    }),
  );
}
