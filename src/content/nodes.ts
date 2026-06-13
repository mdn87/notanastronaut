import type { NodeDef } from '../core/types';

export const SITE = {
  title: 'Not An Astronaut — Matt Newman',
  origin: 'https://notanastronaut.com',
  joke: '*not actually an astronaut',
};

export const NODES: NodeDef[] = [
  {
    id: 'intro', title: 'HI. I’m Matt', route: '/', accent: '#4ab3d4',
    pos: { x: 0, y: 0, z: 0 }, kind: 'intro',
    tagline: 'Engineer. Designer. Not actually an astronaut.',
    body: '<p>I build agent infrastructure, AI tooling, and the occasional 3D printer brain transplant. This site is a star map of missions — scroll to fly between them, or use the list view.</p><p class="joke">*not actually an astronaut</p>',
  },
  {
    id: 'agent-ops', title: 'Agent Ops', route: '/missions/agent-ops', accent: '#4ab3d4',
    pos: { x: 14, y: 2, z: 28 }, kind: 'mission',
    tagline: 'Mission control for a real multi-agent run.',
    body: '<p>A mission-control console replaying a real lugos/aeta agent run — dispatches, tool calls, approval gates, artifacts — on a scrubbable timeline.</p><p class="node-route">DEMO STATUS: in build — writeup mode</p>',
  },
  {
    id: 'fusion-forge', title: 'Fusion Forge', route: '/missions/fusion-forge', accent: '#e8743b',
    pos: { x: -12, y: -3, z: 58 }, kind: 'mission',
    tagline: 'Plain English in, 3D parts out.',
    body: '<p>FusionAI turns natural-language descriptions into Fusion 360 geometry. The demo: a gallery of prompt → part pairs you can orbit.</p><p class="node-route">DEMO STATUS: in build — writeup mode</p>',
  },
  {
    id: 'maker-bay', title: 'Maker Bay', route: '/missions/maker-bay', accent: '#5da583',
    pos: { x: 10, y: 4, z: 88 }, kind: 'mission',
    tagline: 'Firmware, toolpaths, and a very loud lamp.',
    body: '<p>Custom firmware work on an Elegoo Neptune 4 Max, plus a G-code toolpath visualizer — print paths drawn as 3D line art.</p><p class="node-route">DEMO STATUS: in build — writeup mode</p>',
  },
  {
    id: 'ux-archive', title: 'Pre-Flight History', route: '/ux-archive', accent: '#4ab3d4',
    pos: { x: -8, y: -2, z: 118 }, kind: 'archive',
    tagline: 'The UX years: research, prototypes, shipped design.',
    body: '<p>Before the agents: UX research and design — a travel planning app, RescueCats, and a Department of Homeland Security redesign concept. Case studies migrating from notanastronaut.net.</p>',
  },
  {
    id: 'contact', title: 'Open a Channel', route: '/contact', accent: '#e8743b',
    pos: { x: 0, y: 0, z: 146 }, kind: 'contact',
    tagline: 'Ground control is listening.',
    body: '<p><a href="https://github.com/mdn87">GitHub</a> · <a href="https://www.linkedin.com/in/matthew-newman-design">LinkedIn</a> · <a href="mailto:matthew.d.newman@gmail.com">Email</a></p>',
  },
];
