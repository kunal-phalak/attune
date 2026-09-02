import type { SketchCommand } from '@attune/domain';
import { geometryNodeIds, type SketchDocument } from '@attune/domain/editor';

export const SKETCH_HISTORY_COMMANDS = new Set<string>([
  'create_geometry',
  'edit_geometry',
  'move_node',
  'transform_geometry',
  'trim_geometry',
  'delete_geometry',
  'set_construction',
  'create_group',
  'rename_group',
  'move_to_group',
  'apply_constraint',
  'remove_constraint',
  'set_dimension',
  'remove_dimension',
  'restore_sketch',
]);

function title(value: string): string {
  return `${value[0]?.toUpperCase() ?? ''}${value.slice(1).replaceAll('_', ' ')}`;
}

export function semanticHistoryLabel(command: SketchCommand, document: SketchDocument): string {
  switch (command.type) {
    case 'create_geometry': {
      const kinds = [...new Set(command.entities.map(({ kind }) => kind))];
      return kinds.length === 1
        ? `Created ${kinds[0] === 'bspline' ? 'B-spline' : kinds[0]}`
        : `Created ${command.entities.length} sketch entities`;
    }
    case 'move_node': {
      const incident = document.entities.find(
        (entity) => geometryNodeIds(entity).includes(command.nodeId) && entity.kind === 'arc',
      );
      return incident ? 'Moved arc endpoint' : 'Moved sketch point';
    }
    case 'transform_geometry':
      return command.rotation
        ? 'Rotated geometry'
        : command.scale
          ? 'Scaled geometry'
          : 'Moved geometry';
    case 'trim_geometry':
      return 'Trimmed geometry';
    case 'delete_geometry':
      return `Deleted ${command.entityIds.length} sketch ${command.entityIds.length === 1 ? 'entity' : 'entities'}`;
    case 'set_construction':
      return command.construction ? 'Set construction geometry' : 'Set normal geometry';
    case 'create_group':
      return `Created ${command.groups[0]?.name ?? 'group'}`;
    case 'rename_group': {
      const previous = document.groups.find(({ id }) => id === command.groupId)?.name;
      return previous ? `Renamed ${previous} → ${command.name}` : `Renamed group → ${command.name}`;
    }
    case 'move_to_group':
      return 'Moved geometry to group';
    case 'apply_constraint':
      return `Added ${title(command.constraints[0]?.type ?? 'constraint')}`;
    case 'remove_constraint':
      return `Removed ${command.constraintIds.length} constraint${command.constraintIds.length === 1 ? '' : 's'}`;
    case 'set_dimension': {
      const dimension = command.dimensions[0];
      const value =
        dimension && typeof dimension.value === 'number' ? ` to ${dimension.value} mm` : '';
      return `Changed ${dimension?.kind ?? 'dimension'}${value}`;
    }
    case 'remove_dimension':
      return `Removed ${command.dimensionIds.length} dimension${command.dimensionIds.length === 1 ? '' : 's'}`;
    case 'edit_geometry':
      return 'Edited geometry';
    case 'restore_sketch':
      return 'Restored sketch version';
  }
  throw new TypeError(`Unsupported sketch command: ${JSON.stringify(command)}`);
}

export function receiptHistoryLabel(command: string): string {
  const labels: Readonly<Record<string, string>> = {
    create_geometry: 'Created geometry',
    edit_geometry: 'Edited geometry',
    move_node: 'Moved sketch point',
    transform_geometry: 'Transformed geometry',
    trim_geometry: 'Trimmed geometry',
    delete_geometry: 'Deleted geometry',
    set_construction: 'Changed construction state',
    create_group: 'Created group',
    rename_group: 'Renamed group',
    move_to_group: 'Moved geometry to group',
    apply_constraint: 'Added constraint',
    remove_constraint: 'Removed constraint',
    set_dimension: 'Changed dimension',
    remove_dimension: 'Removed dimension',
    restore_sketch: 'Restored sketch version',
  };
  return labels[command] ?? title(command);
}
