import { geometryBounds, type GeometryEntity, type SketchBounds } from '../sketch/geometry';

function intersects(first: SketchBounds, second: SketchBounds): boolean {
  return !(
    first.maxX < second.minX ||
    first.minX > second.maxX ||
    first.maxY < second.minY ||
    first.minY > second.maxY
  );
}

export class SketchSpatialIndex {
  readonly #cellSize: number;
  readonly #entities: ReadonlyMap<string, GeometryEntity>;
  readonly #cells = new Map<string, Set<string>>();

  constructor(entities: readonly GeometryEntity[], cellSize = 50) {
    if (!Number.isFinite(cellSize) || cellSize <= 0)
      throw new TypeError('Invalid index cell size.');
    this.#cellSize = cellSize;
    this.#entities = new Map(entities.map((entity) => [entity.id, entity]));
    for (const entity of entities) this.#insert(entity);
  }

  #cell(value: number): number {
    return Math.floor(value / this.#cellSize);
  }

  #key(x: number, y: number): string {
    return `${x}:${y}`;
  }

  #insert(entity: GeometryEntity): void {
    const bounds = geometryBounds(entity);
    for (let x = this.#cell(bounds.minX); x <= this.#cell(bounds.maxX); x += 1) {
      for (let y = this.#cell(bounds.minY); y <= this.#cell(bounds.maxY); y += 1) {
        const key = this.#key(x, y);
        const ids = this.#cells.get(key) ?? new Set<string>();
        ids.add(entity.id);
        this.#cells.set(key, ids);
      }
    }
  }

  query(bounds: SketchBounds): readonly GeometryEntity[] {
    const ids = new Set<string>();
    for (let x = this.#cell(bounds.minX); x <= this.#cell(bounds.maxX); x += 1) {
      for (let y = this.#cell(bounds.minY); y <= this.#cell(bounds.maxY); y += 1) {
        for (const id of this.#cells.get(this.#key(x, y)) ?? []) ids.add(id);
      }
    }
    return [...ids]
      .map((id) => this.#entities.get(id))
      .filter((entity): entity is GeometryEntity => Boolean(entity))
      .filter((entity) => intersects(geometryBounds(entity), bounds))
      .toSorted((left, right) => left.id.localeCompare(right.id));
  }
}
