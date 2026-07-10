import { describe, expect, it, vi } from 'vitest';
import { ThrusterView } from '../src/world/thruster';

describe('ThrusterView', () => {
  it('owns a 128-particle point cloud and disposes its resources', () => {
    const view = new ThrusterView(1981);
    const geometryDispose = vi.spyOn(view.points.geometry, 'dispose');
    const material = view.points.material;
    if (Array.isArray(material)) throw new Error('ThrusterView must use one material');
    const materialDispose = vi.spyOn(material, 'dispose');

    expect(view.points.geometry.getAttribute('position').count).toBe(128);
    view.dispose();

    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
  });
});
