import type { NodeDef } from './core/types';

export type Surface = 'world' | 'list';

export function routeToIndex(pathname: string, nodes: NodeDef[]): number | null {
  const clean = pathname !== '/' && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  const i = nodes.findIndex((n) => n.route === clean);
  return i === -1 ? null : i;
}

export interface SurfaceInputs {
  forced: Surface | null;
  reducedMotion: boolean;
  webgl: boolean;
  hasFinePointer: boolean;
  isHome: boolean;
}

/**
 * forced 'list' always wins; forced 'world' applies ONLY on the home route (so a
 * mission deep-link can never hide the portfolio behind an empty free-fly scene).
 * Otherwise world needs home + a fine pointer + WebGL + motion.
 */
export function chooseSurface(s: SurfaceInputs): Surface {
  if (s.forced === 'list') return 'list';
  if (s.forced === 'world') return s.isHome ? 'world' : 'list';
  if (s.reducedMotion) return 'list';
  if (!s.webgl) return 'list';
  if (!s.hasFinePointer) return 'list';
  if (!s.isHome) return 'list';
  return 'world';
}

export function detectFinePointer(): boolean {
  try { return matchMedia('(hover: hover) and (pointer: fine)').matches; }
  catch { return false; }
}

export function detectWebgl(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}
