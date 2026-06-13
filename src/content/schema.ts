import type { NodeDef } from '../core/types';

const HEX = /^#[0-9a-f]{6}$/i;

/** Returns a list of human-readable errors; empty list = valid. */
export function validateContent(nodes: NodeDef[]): string[] {
  const errs: string[] = [];
  if (nodes.length !== 6) errs.push(`expected 6 nodes, got ${nodes.length}`);
  const ids = new Set<string>();
  const routes = new Set<string>();
  for (const n of nodes) {
    if (ids.has(n.id)) errs.push(`duplicate id: ${n.id}`);
    ids.add(n.id);
    if (routes.has(n.route)) errs.push(`duplicate route: ${n.route}`);
    routes.add(n.route);
    if (!n.route.startsWith('/')) errs.push(`route must start with /: ${n.id} -> ${n.route}`);
    if (!HEX.test(n.accent)) errs.push(`accent must be #rrggbb: ${n.id} -> ${n.accent}`);
    if (!n.title.trim()) errs.push(`empty title: ${n.id}`);
    if (!n.tagline.trim()) errs.push(`empty tagline: ${n.id}`);
    if (!n.body.trim()) errs.push(`empty body: ${n.id}`);
  }
  return errs;
}
