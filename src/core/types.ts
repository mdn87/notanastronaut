export interface Vec3 { x: number; y: number; z: number; }

export interface NodeDef {
  id: string;            // slug, unique
  title: string;         // "Agent Ops"
  route: string;         // "/missions/agent-ops", unique, starts with "/"
  accent: string;        // hex color for the planet ring
  pos: Vec3;             // world position on the flight path
  tagline: string;       // HUD strip / list subtitle
  body: string;          // HTML fragment for panel + list section
  kind: 'intro' | 'mission' | 'archive' | 'contact';
}

export type TravelState =
  | { kind: 'atNode'; index: number }
  | { kind: 'inTransit'; from: number; to: number; t: number }; // t in [0,1], linear
