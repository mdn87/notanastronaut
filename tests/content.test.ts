import { describe, expect, it } from 'vitest';
import { NODES } from '../src/content/nodes';
import { validateContent } from '../src/content/schema';

describe('content schema', () => {
  it('accepts the real content', () => {
    expect(validateContent(NODES)).toEqual([]);
  });
  it('requires exactly six nodes', () => {
    expect(validateContent(NODES.slice(0, 5))).toContain('expected 6 nodes, got 5');
  });
  it('rejects duplicate ids and routes', () => {
    const dup = [...NODES.slice(0, 5), { ...NODES[5]!, id: NODES[0]!.id }];
    expect(validateContent(dup).some((e) => e.includes('duplicate id'))).toBe(true);
    const dupRoute = [...NODES.slice(0, 5), { ...NODES[5]!, route: NODES[0]!.route }];
    expect(validateContent(dupRoute).some((e) => e.includes('duplicate route'))).toBe(true);
  });
  it('rejects bad routes and accents', () => {
    const bad = [...NODES.slice(0, 5), { ...NODES[5]!, route: 'no-slash', accent: 'red' }];
    const errs = validateContent(bad);
    expect(errs.some((e) => e.includes('route'))).toBe(true);
    expect(errs.some((e) => e.includes('accent'))).toBe(true);
  });
});
