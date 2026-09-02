import type { SketchPoint2D } from '../sketch/geometry';

export interface AdaptiveCurveSegment {
  readonly t0: number;
  readonly t1: number;
  readonly start: SketchPoint2D;
  readonly end: SketchPoint2D;
}

function segmentDistance(
  point: SketchPoint2D,
  start: SketchPoint2D,
  end: SketchPoint2D,
): { readonly distance: number; readonly amount: number } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const amount =
    lengthSquared <= Number.EPSILON
      ? 0
      : Math.max(
          0,
          Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared),
        );
  return {
    amount,
    distance: Math.hypot(point.x - (start.x + amount * dx), point.y - (start.y + amount * dy)),
  };
}

/** Tolerance-driven curve linearization used only to bracket exact/refined parameter queries. */
export function adaptiveCurveSegments(
  pointAt: (parameter: number) => SketchPoint2D,
  tolerance: number,
): readonly AdaptiveCurveSegment[] {
  const geometricTolerance = Math.max(1e-9, tolerance);
  const result: AdaptiveCurveSegment[] = [];
  const visit = (
    t0: number,
    t1: number,
    start: SketchPoint2D,
    end: SketchPoint2D,
    depth: number,
  ) => {
    const span = t1 - t0;
    const samples = [0.25, 0.5, 0.75].map((amount) => ({
      amount,
      point: pointAt(t0 + span * amount),
    }));
    const flatness = Math.max(
      ...samples.map(({ point }) => segmentDistance(point, start, end).distance),
    );
    if (flatness <= geometricTolerance || depth >= 20) {
      result.push({ t0, t1, start, end });
      return;
    }
    const middle = samples[1].point;
    const tm = (t0 + t1) / 2;
    visit(t0, tm, start, middle, depth + 1);
    visit(tm, t1, middle, end, depth + 1);
  };
  visit(0, 1, pointAt(0), pointAt(1), 0);
  return result;
}

function squaredDistance(point: SketchPoint2D, candidate: SketchPoint2D): number {
  const dx = point.x - candidate.x;
  const dy = point.y - candidate.y;
  return dx * dx + dy * dy;
}

/** Adaptive broad bracketing plus a stable golden-section minimum in parameter space. */
export function closestCurveDistance(
  point: SketchPoint2D,
  pointAt: (parameter: number) => SketchPoint2D,
  tolerance: number,
): number {
  const segments = adaptiveCurveSegments(pointAt, Math.max(1e-9, tolerance * 0.125));
  let best = segments[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  let seed = 0;
  for (const segment of segments) {
    const candidate = segmentDistance(point, segment.start, segment.end);
    if (candidate.distance < bestDistance) {
      best = segment;
      bestDistance = candidate.distance;
      seed = segment.t0 + (segment.t1 - segment.t0) * candidate.amount;
    }
  }
  if (!best) return Number.POSITIVE_INFINITY;
  let low = best.t0;
  let high = best.t1;
  // Keep the adaptive projection seed inside the refinement bracket so endpoint minima stay exact.
  const seedDistance = squaredDistance(point, pointAt(seed));
  const ratio = (Math.sqrt(5) - 1) / 2;
  let left = high - (high - low) * ratio;
  let right = low + (high - low) * ratio;
  let leftDistance = squaredDistance(point, pointAt(left));
  let rightDistance = squaredDistance(point, pointAt(right));
  for (let iteration = 0; iteration < 48; iteration += 1) {
    if (Math.hypot(pointAt(high).x - pointAt(low).x, pointAt(high).y - pointAt(low).y) <= tolerance)
      break;
    if (leftDistance <= rightDistance) {
      high = right;
      right = left;
      rightDistance = leftDistance;
      left = high - (high - low) * ratio;
      leftDistance = squaredDistance(point, pointAt(left));
    } else {
      low = left;
      left = right;
      leftDistance = rightDistance;
      right = low + (high - low) * ratio;
      rightDistance = squaredDistance(point, pointAt(right));
    }
  }
  return Math.sqrt(
    Math.min(
      seedDistance,
      squaredDistance(point, pointAt(low)),
      squaredDistance(point, pointAt((low + high) / 2)),
      squaredDistance(point, pointAt(high)),
    ),
  );
}
