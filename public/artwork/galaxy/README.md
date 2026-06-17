# Galaxy Depth Artwork

Standalone artwork for a later Three.js depth-of-field pass.

Drafts:

- `draft-1/`: preserved copy of the first simplified cyan/cream direction.
- `draft-2/`: more exaggerated modern-art/simple-geometry direction with blocky color fields, hard planet bands, and thick orbit bars.
- `draft-3/`: ultra-simplified "space alphabet" direction: circles, bars, rectangles, diamonds, and huge translucent slabs.
- `draft-4/`: abstract signal-field direction: repetitive curves, dotted lines, plaid bands, triangles, and almost no recognizable objects.
- `draft-5/`: round planet glyphs from the simple drafts, intensified with halftone fields, graduated line stacks, dotted paths, and extra repetition.
- `compare-drafts.html`: side-by-side composite comparison.

Root files currently contain the Draft 1 working set.

- `galaxy-depth-far.svg`: soft watercolor galaxy wash for the farthest layer.
- `galaxy-depth-mid.svg`: watercolor clouds with deliberately simple two-tone cyan/cream planet forms.
- `galaxy-depth-near.svg`: crisp cyan/cream foreground motifs for stronger parallax.
- `galaxy-symbols.svg`: reusable two-tone motif sheet for individual planet, cloud, comet, and star forms.

Direction notes:

- Background clouds use the reference image's violet, blue, magenta, and teal watercolor scheme.
- Foreground planets and reusable objects stay in the Not An Astronaut cyan and cream family, using simple two-tone shapes instead of detailed clip-art rendering.
- Files are intentionally standalone SVGs with transparent backgrounds so the implementation pass can decide how to stack, blur, and animate them.
