import type { SketchPoint2D } from '../sketch/geometry';

export type MechanicalRecipeId =
  | 'round_plate'
  | 'annular_ring'
  | 'rounded_rectangle_plate'
  | 'mounting_plate'
  | 'bolt_circle'
  | 'slotted_plate'
  | 'spoked_wheel'
  | 'radial_pattern';

export interface RecipePlacement {
  readonly center: SketchPoint2D;
  readonly rotationDegrees?: number;
}

export interface DesignRequestContext {
  readonly purpose?: string;
  readonly overallEnvelope?: {
    readonly width?: number;
    readonly height?: number;
    readonly diameter?: number;
    readonly thickness?: number;
  };
  readonly criticalDimensions?: readonly {
    readonly name: string;
    readonly value: number;
    readonly unit: 'mm' | 'deg' | 'unitless';
  }[];
  readonly materialIntent?: string;
  readonly quantity?: number;
  readonly manufacturingProcessPreference?: string;
}

export type RecipeParameterValues = Readonly<Record<string, unknown>>;

export interface DesignRecipeProvenance {
  readonly kind: 'design-recipe';
  readonly sourceRef: string;
  readonly recipeId: MechanicalRecipeId;
  readonly title: string;
  readonly parameters: RecipeParameterValues;
  readonly placement: RecipePlacement;
  readonly designRequest?: DesignRequestContext;
  readonly generator: {
    readonly substrate: 'makerjs';
    readonly package: string;
    readonly packageVersion: string;
  };
  readonly status: 'pristine' | 'regenerated' | 'modified';
}

export interface MechanicalRecipeDefinition {
  readonly id: MechanicalRecipeId;
  readonly title: string;
  readonly description: string;
  readonly requiredParameters: readonly string[];
  readonly optionalParameters: readonly string[];
  readonly generatedSemanticGroups: readonly string[];
  readonly editableParameters: readonly string[];
}

export const MECHANICAL_RECIPE_CATALOG: readonly MechanicalRecipeDefinition[] = [
  {
    id: 'round_plate',
    title: 'Round plate',
    description: 'A circular plate with an optional center bore and optional bolt-circle holes.',
    requiredParameters: ['outerDiameter'],
    optionalParameters: ['centerBoreDiameter', 'holePattern'],
    generatedSemanticGroups: ['Plate boundary', 'Center bore', 'Mounting holes'],
    editableParameters: [
      'outerDiameter',
      'centerBoreDiameter',
      'holePattern.pitchCircleDiameter',
      'holePattern.holeDiameter',
      'holePattern.count',
      'holePattern.rotation',
    ],
  },
  {
    id: 'annular_ring',
    title: 'Annular ring',
    description: 'Two concentric analytic circles defining an outer diameter and inner diameter.',
    requiredParameters: ['outerDiameter', 'innerDiameter'],
    optionalParameters: [],
    generatedSemanticGroups: ['Outer rim', 'Inner rim'],
    editableParameters: ['outerDiameter', 'innerDiameter'],
  },
  {
    id: 'rounded_rectangle_plate',
    title: 'Rounded rectangle plate',
    description: 'A closed rectangular plate boundary with analytic circular corner fillets.',
    requiredParameters: ['width', 'height', 'cornerRadius'],
    optionalParameters: [],
    generatedSemanticGroups: ['Plate boundary'],
    editableParameters: ['width', 'height', 'cornerRadius'],
  },
  {
    id: 'mounting_plate',
    title: 'Mounting plate',
    description: 'A rounded rectangular plate with a symmetric four-hole mounting pattern.',
    requiredParameters: [
      'width',
      'height',
      'cornerRadius',
      'holeDiameter',
      'holeSpacingX',
      'holeSpacingY',
    ],
    optionalParameters: ['centerBoreDiameter'],
    generatedSemanticGroups: ['Plate boundary', 'Mounting holes', 'Center bore'],
    editableParameters: [
      'width',
      'height',
      'cornerRadius',
      'holeDiameter',
      'holeSpacingX',
      'holeSpacingY',
      'centerBoreDiameter',
    ],
  },
  {
    id: 'bolt_circle',
    title: 'Bolt circle',
    description: 'An evenly spaced circular hole pattern placed from one pitch-circle diameter.',
    requiredParameters: ['pitchCircleDiameter', 'holeDiameter', 'count'],
    optionalParameters: ['rotation'],
    generatedSemanticGroups: ['Mounting holes'],
    editableParameters: ['pitchCircleDiameter', 'holeDiameter', 'count', 'rotation'],
  },
  {
    id: 'slotted_plate',
    title: 'Slotted plate',
    description: 'A rounded rectangular plate with a centered analytic capsule slot.',
    requiredParameters: ['width', 'height', 'cornerRadius', 'slotLength', 'slotWidth'],
    optionalParameters: [],
    generatedSemanticGroups: ['Plate boundary', 'Slot'],
    editableParameters: ['width', 'height', 'cornerRadius', 'slotLength', 'slotWidth'],
  },
  {
    id: 'spoked_wheel',
    title: 'Spoked wheel',
    description: 'A straight-spoke wheel with an editable center bore and analytic rim geometry.',
    requiredParameters: ['spokeCount'],
    optionalParameters: [
      'outerDiameter',
      'centerBoreDiameter',
      'hubDiameter',
      'spokeWidth',
      'innerFillet',
      'outerFillet',
    ],
    generatedSemanticGroups: ['Wheel body', 'Center bore'],
    editableParameters: [
      'spokeCount',
      'outerDiameter',
      'centerBoreDiameter',
      'hubDiameter',
      'spokeWidth',
      'innerFillet',
      'outerFillet',
    ],
  },
  {
    id: 'radial_pattern',
    title: 'Radial pattern',
    description: 'An evenly spaced radial pattern of analytic circular features.',
    requiredParameters: ['pitchCircleDiameter', 'featureDiameter', 'count'],
    optionalParameters: ['rotation'],
    generatedSemanticGroups: ['Radial features'],
    editableParameters: ['pitchCircleDiameter', 'featureDiameter', 'count', 'rotation'],
  },
] as const;

export function mechanicalRecipeDefinition(id: MechanicalRecipeId): MechanicalRecipeDefinition {
  const definition = MECHANICAL_RECIPE_CATALOG.find((candidate) => candidate.id === id);
  if (!definition) throw new TypeError(`Unknown mechanical recipe ${id}.`);
  return definition;
}
