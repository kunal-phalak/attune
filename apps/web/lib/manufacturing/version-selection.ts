import type {
  AttuneWorkspace,
  ManufacturingConfiguration,
  PanelGeometry,
  SavedDesignVersion,
} from '@attune/domain';

export interface ManufacturingVersionSelection {
  readonly version: SavedDesignVersion | null;
  readonly geometry: PanelGeometry;
  readonly configuration: ManufacturingConfiguration;
}

export function resolveManufacturingVersionSelection(
  workspace: AttuneWorkspace,
  selectedVersionId: string,
  configuration: ManufacturingConfiguration,
): ManufacturingVersionSelection {
  if (selectedVersionId === 'current') {
    return {
      version: null,
      geometry: {
        ...workspace.geometry,
        material: configuration.material,
        thickness: configuration.thicknessMm,
      },
      configuration,
    };
  }

  const version = workspace.savedVersions.find(
    (candidate) => candidate.versionId === selectedVersionId,
  );
  if (!version) throw new Error('The selected saved version does not exist.');
  return {
    version,
    geometry: version.geometry,
    configuration: {
      ...configuration,
      material: version.geometry.material,
      thicknessMm: version.geometry.thickness,
    },
  };
}
