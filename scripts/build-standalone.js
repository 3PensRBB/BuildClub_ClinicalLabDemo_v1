'use strict';

/**
 * Builds a single self-contained HTML file of the whole demo. The same backend code
 * (resolver, store, API) runs inside the page, so no server or install is needed:
 * double-click the file, email it, or host it anywhere static.
 *
 *   node scripts/build-standalone.js            -> dist/critcall-demo.html (full document)
 *   node scripts/build-standalone.js --fragment out.html
 *                                               -> page body only, for hosts that add their own <html>/<head>
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const safe = (js) => js.replace(/<\/script/gi, '<\\/script');

// CommonJS modules, wrapped so they can require each other in the browser.
const modules = [
  ['./time', 'src/time.js'],
  ['./resolver', 'src/resolver.js'],
  ['./store', 'src/store.js'],
  ['./api', 'src/api.js'],
]
  .map(([name, file]) => `define(${JSON.stringify(name)}, function (module, exports, require) {\n${read(file)}\n});`)
  .join('\n');

const bodyOf = (file) =>
  read(file)
    .match(/<body>([\s\S]*)<\/body>/)[1]
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .trim();

const views = [
  ['home', 'public/index.html', "document.getElementById('nav').outerHTML = CC.nav('');"],
  ['lab', 'public/lab.html', read('public/lab.js')],
  ['clinician', 'public/clinician.html', read('public/clinician.js')],
  ['supervisor', 'public/supervisor.html', read('public/supervisor.js')],
]
  .map(([name, html, js]) => `  ${name}: {\n    html: ${JSON.stringify(bodyOf(html))},\n    run() {\n${js}\n    },\n  },`)
  .join('\n');

const runtime = `
(function () {
  const SEED = ${JSON.stringify(JSON.parse(read('data/seed.json')))};
  const defs = {};
  const cache = {};
  function define(name, fn) { defs[name] = fn; }
  function require(name) {
    if (name.endsWith('.json')) return SEED;
    if (cache[name]) return cache[name].exports;
    const module = { exports: {} };
    cache[name] = module;
    defs[name](module, module.exports, require);
    return module.exports;
  }
${modules}

  const { createClock } = require('./time');
  const { createStore } = require('./store');
  const { createApi } = require('./api');
  const clock = createClock(SEED.demoStart);
  const store = createStore(SEED, clock);
  const post = createApi(store, clock);

  let subscribers = [];
  const push = () => {
    const state = store.snapshot();
    subscribers.slice().forEach((cb) => cb(state));
  };
  setInterval(() => { store.tick(); push(); }, 1000);

  // Stands in for HTTP + server-sent events (see public/common.js).
  window.CC_TRANSPORT = {
    async post(pathname, body) {
      try {
        const data = post(pathname, JSON.parse(JSON.stringify(body || {})));
        setTimeout(push);
        return { ok: true, data };
      } catch (err) {
        if (!err.status) console.error(err);
        return { ok: false, data: { error: err.status ? err.message : 'Something went wrong' }, statusText: 'Error' };
      }
    },
    subscribe(cb) {
      subscribers.push(cb);
      setTimeout(() => cb(store.snapshot()));
      return () => { subscribers = subscribers.filter((x) => x !== cb); };
    },
  };
  window.CC_RESET_SUBSCRIBERS = () => { subscribers = []; };
})();`;

const router = `
const VIEWS = {
${views}
};

// Each view is mounted into #app; links to *.html switch views instead of loading pages.
function mount(name) {
  if (!VIEWS[name]) name = 'home';
  window.CC_RESET_SUBSCRIBERS();
  document.getElementById('app').innerHTML = VIEWS[name].html;
  VIEWS[name].run();
  window.scrollTo(0, 0);
  try {
    history.replaceState(null, '', '#' + name);
  } catch {
    // Some embedded frames refuse history changes; navigation still works.
  }
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href]');
  if (!a) return;
  const m = a.getAttribute('href').match(/^\\/?(?:(\\w+)\\.html)?(?:\\?.*)?$/);
  if (!m) return;
  e.preventDefault();
  mount(!m[1] || m[1] === 'index' ? 'home' : m[1]);
});
window.addEventListener('hashchange', () => mount(location.hash.slice(1)));
mount(location.hash.slice(1));`;

const page = `<title>CritCall Demo</title>
<style>
${read('public/styles.css')}
</style>
<div id="app"></div>
<script>${safe(runtime)}</script>
<script>${safe(read('public/common.js'))}</script>
<script>${safe(router)}</script>
`;

const args = process.argv.slice(2);
if (args[0] === '--fragment') {
  fs.writeFileSync(args[1], page);
  console.log(`Wrote ${args[1]}`);
} else {
  const out = path.join(root, 'dist', 'critcall-demo.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(
    out,
    `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n</head>\n<body>\n${page}</body>\n</html>\n`
  );
  console.log(`Wrote ${path.relative(root, out)}`);
}
