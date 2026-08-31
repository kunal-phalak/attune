/** Returns a world-space grid step whose on-screen spacing follows the 1 / 2 / 5 series. */
export function adaptiveGridStep(zoom: number, targetPixels = 32): number {
  if (!Number.isFinite(zoom) || zoom <= 0) throw new Error('Grid zoom must be positive.');
  const rawStep = targetPixels / zoom;
  const exponent = Math.floor(Math.log10(rawStep));
  const magnitude = 10 ** exponent;
  const normalized = rawStep / magnitude;
  const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return multiplier * magnitude;
}
