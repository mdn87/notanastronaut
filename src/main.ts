import { NODES, SITE } from './content/nodes';
import { renderListPage } from './fallback/render';
import { chooseSurface, detectWebgl, detectFinePointer, type Surface } from './router';

const content = document.getElementById('content')!;

const params = new URLSearchParams(location.search);
const forced = (['world', 'list'] as const).find((m) => params.get('mode') === m) ?? null;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isHome = location.pathname === '/' || location.pathname === '';
const surface: Surface = chooseSurface({
  forced, reducedMotion, webgl: detectWebgl(), hasFinePointer: detectFinePointer(), isHome,
});

// Dev parity: prerender fills #content in prod; fill it live in dev.
if (!content.querySelector('section')) {
  content.innerHTML = renderListPage(NODES, SITE);
}

document.body.dataset.mode = surface;

if (surface === 'world') {
  content.setAttribute('hidden', '');
  import('./world/mount')
    .then(({ mountWorld }) => mountWorld({ reducedMotion }))
    .catch((err) => {
      console.error('world failed to boot - switching to ground control', err);
      content.removeAttribute('hidden');
      document.body.dataset.mode = 'list';
    });
}
