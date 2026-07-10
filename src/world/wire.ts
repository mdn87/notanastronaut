// src/world/wire.ts
import { DartPhysics } from '../physics/dart';
import { aimDelta, DEFAULT_STEER } from '../core/control';
import type { FlightInput } from '../core/flight-types';
import { FlightHud } from '../hud/flight-hud';
import type { WorldScene } from './scene';

const MAX_DT = 0.05;

export async function wireWorld(scene: WorldScene, _opts: { reducedMotion: boolean }): Promise<() => void> {
  const dart = await DartPhysics.create({ bound: 720, boundPush: 220 }, scene.galaxyField);
  const hud = new FlightHud(document.getElementById('hud-root')!);

  // Drag-to-fly: while the left button is held, the cursor's offset from where it
  // was pressed steers like a flight stick — drag left -> nose left, drag up -> up.
  let dragging = false, pressX = 0, pressY = 0, dragX = 0, dragY = 0;
  let anchorYaw = 0, anchorPitch = 0; // facing captured when the drag began (aim is relative to it)
  let rightHeld = false;            // right button -> forward thrust
  const keys = new Set<string>();   // movement keys currently down
  let rollEvent: -1 | 0 | 1 = 0; // set on a fresh A/D keydown, consumed next frame

  const norm = (k: string) => (k.length === 1 ? k.toLowerCase() : k);
  const has = (...k: string[]) => k.some((x) => keys.has(x));
  const forward = () => (has('w', 'ArrowUp') ? 1 : 0) - (has('s', 'ArrowDown') ? 1 : 0);
  const strafe = () => 0;
  const boost = () => rightHeld;
  const input: FlightInput = {
    yawDelta: 0,
    pitchDelta: 0,
    forward: 0,
    strafe: 0,
    boost: false,
    roll: 0,
  };

  const onPointerMove = (e: { clientX: number; clientY: number }) => {
    if (dragging) { dragX = e.clientX - pressX; dragY = e.clientY - pressY; }
  };
  const onPointerDown = (e: { button?: number; clientX: number; clientY: number }) => {
    if ((e.button ?? 0) === 0) {
      dragging = true; pressX = e.clientX; pressY = e.clientY; dragX = 0; dragY = 0;
      const st = dart.state(); anchorYaw = st.yaw; anchorPitch = st.pitch; // aim relative to current facing
    } else if (e.button === 2) rightHeld = true;
  };
  const onPointerUp = (e: { button?: number }) => {
    if ((e.button ?? 0) === 0) { dragging = false; dragX = 0; dragY = 0; }
    else if (e.button === 2) rightHeld = false;
  };
  const onContextMenu = (e: { preventDefault?: () => void }) => e.preventDefault?.(); // right-click = thrust, no menu

  const isMoveKey = (k: string) => ['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k);
  const onKeyDown = (e: { key: string; repeat?: boolean; preventDefault?: () => void }) => {
    const k = norm(e.key);
    if (isMoveKey(k)) {
      keys.add(k);
      if (!e.repeat) {
        if (k === 'a' || k === 'ArrowLeft') rollEvent = -1;
        else if (k === 'd' || k === 'ArrowRight') rollEvent = 1;
      }
      e.preventDefault?.();
    } else if (k === 'Escape' || k === 'l') location.href = `?mode=list`;
  };
  const onKeyUp = (e: { key: string }) => { keys.delete(norm(e.key)); };

  addEventListener('pointermove', onPointerMove as unknown as EventListener);
  addEventListener('pointerdown', onPointerDown as unknown as EventListener);
  addEventListener('pointerup', onPointerUp as unknown as EventListener);
  addEventListener('contextmenu', onContextMenu as unknown as EventListener);
  addEventListener('keydown', onKeyDown as unknown as EventListener);
  addEventListener('keyup', onKeyUp as unknown as EventListener);

  let last = performance.now(), frameId = 0, stopped = false, galaxyAngle = 0;
  const loop = (now: number) => {
    if (stopped) return;
    const dt = Math.min(MAX_DT, Math.max(0, (now - last) / 1000));
    last = now;
    // Aim-based steer: while dragging, ease the facing toward the drag target and
    // STOP there (no perpetual spin). Deflection is deadzoned + capped, so a fast
    // or far drag can't run away. Re-grip (release + drag again) to keep turning.
    let yawDelta = 0, pitchDelta = 0;
    if (dragging) {
      const cur = dart.state();
      const d = aimDelta(cur.yaw, cur.pitch, anchorYaw, anchorPitch, dragX, dragY, dt, DEFAULT_STEER);
      yawDelta = d.yawDelta; pitchDelta = d.pitchDelta;
    }
    input.yawDelta = yawDelta;
    input.pitchDelta = pitchDelta;
    input.forward = forward();
    input.strafe = strafe();
    input.boost = boost();
    input.roll = rollEvent;
    galaxyAngle += dt * 0.015;
    dart.step(dt, input, galaxyAngle);
    rollEvent = 0; // consume the one-frame edge
    const s = dart.state();
    const active = dart.activeStars();
    scene.frame(dt, s, active, galaxyAngle);
    hud.setSpeed(s.speed);
    hud.setReadout(scene.readout());
    frameId = requestAnimationFrame(loop);
  };
  frameId = requestAnimationFrame(loop);

  return () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frameId);
    removeEventListener('pointermove', onPointerMove as unknown as EventListener);
    removeEventListener('pointerdown', onPointerDown as unknown as EventListener);
    removeEventListener('pointerup', onPointerUp as unknown as EventListener);
    removeEventListener('contextmenu', onContextMenu as unknown as EventListener);
    removeEventListener('keydown', onKeyDown as unknown as EventListener);
    removeEventListener('keyup', onKeyUp as unknown as EventListener);
    hud.dispose();
    dart.dispose();
  };
}
