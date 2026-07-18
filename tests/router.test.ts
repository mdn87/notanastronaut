import { describe, expect, it } from 'vitest';
import { NODES } from '../src/content/nodes';
import { chooseSurface, routeToIndex, type SurfaceInputs } from '../src/router';

describe('routeToIndex', () => {
  it('maps every route to its node', () => {
    NODES.forEach((n, i) => expect(routeToIndex(n.route, NODES)).toBe(i));
  });

  it('unknown routes map to null', () => {
    expect(routeToIndex('/nope', NODES)).toBe(null);
  });
});

const base: SurfaceInputs = { forced: null, reducedMotion: false, webgl: true, hasFinePointer: true, isHome: true };

describe('chooseSurface', () => {
  it('world only when home + fine pointer + webgl + motion', () => {
    expect(chooseSurface(base)).toBe('world');
  });
  it('forced list always wins; forced world still requires the home route', () => {
    expect(chooseSurface({ ...base, forced: 'list' })).toBe('list');
    expect(chooseSurface({ ...base, isHome: true, forced: 'world' })).toBe('world');
    expect(chooseSurface({ ...base, isHome: false, forced: 'world' })).toBe('list'); // never hide the portfolio
  });
  it('reduced motion, no webgl, coarse pointer, or non-home => list', () => {
    expect(chooseSurface({ ...base, reducedMotion: true })).toBe('list');
    expect(chooseSurface({ ...base, webgl: false })).toBe('list');
    expect(chooseSurface({ ...base, hasFinePointer: false })).toBe('list');
    expect(chooseSurface({ ...base, isHome: false })).toBe('list');
  });
});
