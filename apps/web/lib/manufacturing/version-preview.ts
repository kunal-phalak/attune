import { deflateSync } from 'node:zlib';

import type { SavedDesignVersion } from '@attune/domain';

const WIDTH = 640;
const HEIGHT = 400;
const PADDING = 34;

function crc32(input: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const label = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([label, data])));
  return Buffer.concat([length, label, data, checksum]);
}

function plot(
  pixels: Uint8Array,
  x: number,
  y: number,
  color: readonly [number, number, number, number],
  radius = 1,
) {
  for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
    for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
      const pixelX = Math.round(x + offsetX);
      const pixelY = Math.round(y + offsetY);
      if (pixelX < 0 || pixelY < 0 || pixelX >= WIDTH || pixelY >= HEIGHT) continue;
      const index = (pixelY * WIDTH + pixelX) * 4;
      pixels.set(color, index);
    }
  }
}

function line(
  pixels: Uint8Array,
  start: readonly [number, number],
  end: readonly [number, number],
  color: readonly [number, number, number, number],
  radius = 1,
) {
  const steps = Math.max(1, Math.ceil(Math.hypot(end[0] - start[0], end[1] - start[1])));
  for (let step = 0; step <= steps; step += 1) {
    const progress = step / steps;
    plot(
      pixels,
      start[0] + (end[0] - start[0]) * progress,
      start[1] + (end[1] - start[1]) * progress,
      color,
      radius,
    );
  }
}

function bounds(version: SavedDesignVersion) {
  const points: { readonly x: number; readonly y: number }[] = [];
  for (const entity of version.sketchDocument.entities) {
    if ('start' in entity) points.push(entity.start);
    if ('end' in entity) points.push(entity.end);
    if ('center' in entity) {
      const radius =
        'radius' in entity
          ? entity.radius
          : 'majorRadius' in entity
            ? entity.majorRadius
            : 1;
      points.push(
        { x: entity.center.x - radius, y: entity.center.y - radius },
        { x: entity.center.x + radius, y: entity.center.y + radius },
      );
    }
    if ('controlPoints' in entity) points.push(...entity.controlPoints);
  }
  if (points.length === 0) {
    return { minimumX: 0, minimumY: 0, maximumX: 1, maximumY: 1 };
  }
  return {
    minimumX: Math.min(...points.map(({ x }) => x)),
    minimumY: Math.min(...points.map(({ y }) => y)),
    maximumX: Math.max(...points.map(({ x }) => x)),
    maximumY: Math.max(...points.map(({ y }) => y)),
  };
}

export async function renderVersionPreview(version: SavedDesignVersion): Promise<Uint8Array> {
  const pixels = new Uint8Array(WIDTH * HEIGHT * 4);
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = 247;
    pixels[index + 1] = 248;
    pixels[index + 2] = 250;
    pixels[index + 3] = 255;
  }
  const box = bounds(version);
  const spanX = Math.max(1, box.maximumX - box.minimumX);
  const spanY = Math.max(1, box.maximumY - box.minimumY);
  const scale = Math.min((WIDTH - PADDING * 2) / spanX, (HEIGHT - PADDING * 2) / spanY);
  const offsetX = (WIDTH - spanX * scale) / 2 - box.minimumX * scale;
  const offsetY = (HEIGHT - spanY * scale) / 2 + box.maximumY * scale;
  const map = (point: { readonly x: number; readonly y: number }) =>
    [offsetX + point.x * scale, offsetY - point.y * scale] as const;
  const ink = [31, 41, 55, 255] as const;
  const accent = [37, 99, 235, 255] as const;

  for (const entity of version.sketchDocument.entities) {
    if (entity.kind === 'line') {
      line(pixels, map(entity.start), map(entity.end), ink, 1);
    } else if (entity.kind === 'circle') {
      const segments = 180;
      for (let index = 0; index < segments; index += 1) {
        const first = (Math.PI * 2 * index) / segments;
        const second = (Math.PI * 2 * (index + 1)) / segments;
        line(
          pixels,
          map({
            x: entity.center.x + Math.cos(first) * entity.radius,
            y: entity.center.y + Math.sin(first) * entity.radius,
          }),
          map({
            x: entity.center.x + Math.cos(second) * entity.radius,
            y: entity.center.y + Math.sin(second) * entity.radius,
          }),
          accent,
          1,
        );
      }
    } else if (entity.kind === 'arc') {
      const sweep = entity.endAngle - entity.startAngle;
      const segments = Math.max(12, Math.ceil(Math.abs(sweep) * 32));
      for (let index = 0; index < segments; index += 1) {
        const first = entity.startAngle + (sweep * index) / segments;
        const second = entity.startAngle + (sweep * (index + 1)) / segments;
        line(
          pixels,
          map({
            x: entity.center.x + Math.cos(first) * entity.radius,
            y: entity.center.y + Math.sin(first) * entity.radius,
          }),
          map({
            x: entity.center.x + Math.cos(second) * entity.radius,
            y: entity.center.y + Math.sin(second) * entity.radius,
          }),
          ink,
          1,
        );
      }
    } else if (entity.kind === 'ellipse') {
      const segments = 180;
      const rotate = (x: number, y: number) => ({
        x:
          entity.center.x +
          x * Math.cos(entity.rotation) -
          y * Math.sin(entity.rotation),
        y:
          entity.center.y +
          x * Math.sin(entity.rotation) +
          y * Math.cos(entity.rotation),
      });
      for (let index = 0; index < segments; index += 1) {
        const first = (Math.PI * 2 * index) / segments;
        const second = (Math.PI * 2 * (index + 1)) / segments;
        line(
          pixels,
          map(rotate(Math.cos(first) * entity.majorRadius, Math.sin(first) * entity.minorRadius)),
          map(
            rotate(Math.cos(second) * entity.majorRadius, Math.sin(second) * entity.minorRadius),
          ),
          ink,
          1,
        );
      }
    } else if (entity.kind === 'bspline') {
      for (let index = 1; index < entity.controlPoints.length; index += 1) {
        line(
          pixels,
          map(entity.controlPoints[index - 1]),
          map(entity.controlPoints[index]),
          ink,
          1,
        );
      }
    }
  }

  const raw = Buffer.alloc((WIDTH * 4 + 1) * HEIGHT);
  for (let row = 0; row < HEIGHT; row += 1) {
    const destination = row * (WIDTH * 4 + 1);
    raw[destination] = 0;
    raw.set(pixels.subarray(row * WIDTH * 4, (row + 1) * WIDTH * 4), destination + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(WIDTH, 0);
  header.writeUInt32BE(HEIGHT, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array()),
  ]);
}
