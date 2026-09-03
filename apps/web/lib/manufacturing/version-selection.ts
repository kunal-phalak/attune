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

/** Prefer a durable artifact so commerce surfaces show the same R2 preview and exact geometry. */
export function defaultManufacturingVersionId(workspace: AttuneWorkspace): string {
  return (
    workspace.savedVersions.toSorted((left, right) => right.versionNumber - left.versionNumber)[0]
      ?.versionId ?? 'current'
  );
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
