export const GRID_MAX_POINTS = 20000;

/** Regular x/y/z dot lattice filling the flyable volume. Flat xyz Float32Array. */
export function makeDotGrid(opts: { spacing?: number; extent?: number } = {}): Float32Array {
  const spacing = opts.spacing ?? 26;
  const extent = opts.extent ?? 260;
  const n = Math.floor(extent / spacing);
  const side = 2 * n + 1;
  const total = side * side * side;
  if (total > GRID_MAX_POINTS) throw new Error(`grid too dense: ${total} > ${GRID_MAX_POINTS}`);
  const out = new Float32Array(total * 3);
  let k = 0;
  for (let ix = -n; ix <= n; ix++)
    for (let iy = -n; iy <= n; iy++)
      for (let iz = -n; iz <= n; iz++) {
        out[k++] = ix * spacing; out[k++] = iy * spacing; out[k++] = iz * spacing;
      }
  return out;
}

export const GRID_MAX_LINES = 4000;

/**
 * Line-segment endpoints (flat xyz, two vertices per segment) for a 3D lattice —
 * a visibly grid-like wireframe (so it can't be mistaken for stars). Lines run
 * along x, y and z at every lattice intersection of the other two axes.
 */
export function makeGridLines(opts: { spacing?: number; extent?: number } = {}): Float32Array {
  const spacing = opts.spacing ?? 90;
  const extent = opts.extent ?? 700;
  const n = Math.floor(extent / spacing);
  const span = n * spacing;
  const ticks: number[] = [];
  for (let i = -n; i <= n; i++) ticks.push(i * spacing);
  const lineCount = 3 * ticks.length * ticks.length;
  if (lineCount > GRID_MAX_LINES) throw new Error(`grid too dense: ${lineCount} > ${GRID_MAX_LINES}`);
  const segs = new Float32Array(lineCount * 6);
  let k = 0;
  for (const a of ticks)
    for (const b of ticks) {
      segs[k++] = -span; segs[k++] = a; segs[k++] = b; segs[k++] = span; segs[k++] = a; segs[k++] = b; // along x
      segs[k++] = a; segs[k++] = -span; segs[k++] = b; segs[k++] = a; segs[k++] = span; segs[k++] = b; // along y
      segs[k++] = a; segs[k++] = b; segs[k++] = -span; segs[k++] = a; segs[k++] = b; segs[k++] = span; // along z
    }
  return segs;
}
