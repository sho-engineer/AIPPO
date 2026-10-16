/** Deterministic standalone release: learning.html is the only curriculum source. */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Script } from 'node:vm';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const once = (text, search, replacement) => {
  if (text.split(search).length !== 2) throw Error(`Standalone integration anchor changed: ${search.slice(0, 90)}`);
  return text.replace(search, replacement);
};
export async function generateKidsTitle() {
  const [source, authState, titleShell, adapter, css] = await Promise.all([
    read('src/kids/learning.html'), read('src/kids/title-shell-state.inc'),
    read('src/kids/title-shell.inc'), read('src/kids/title-adapter.inc'), read('src/kids/title-shell.css'),
  ]);
  const digest = createHash('sha256').update([source, authState, titleShell, adapter, css].join('\n')).digest('hex');
  let html = once(source, '</head>', `<style id="standalone-title-auth">\n${css}\n</style>\n</head>`);
  html = once(html, "const PO='/assets/po/';", "const PO='assets/po/';");
  html = once(html, "const BRAND='/brand/logo-horizontal.webp';", "const BRAND='brand/logo-horizontal.webp';");
  html = once(html, "const SETTINGS_STORE='aippo_kids_settings_v1';", `const SETTINGS_STORE='aippo_kids_settings_v1';\n${authState}`);
  for (const name of ['layout', 'home', 'settingsView', 'policyModal']) {
    const renamed = ({ layout: 'learningLayout', home: 'learningHome', settingsView: 'learningSettingsView', policyModal: 'learningPolicyModal' })[name];
    html = once(html, `function ${name}(`, `function ${renamed}(`);
  }
  // Keep source's verified storage guard/migration; choose only its exact key.
  for (const method of ['getItem', 'setItem', 'removeItem']) html = html.replaceAll(`localStorage.${method}(STORE`, `localStorage.${method}(progressStore()`);
  html = html.replaceAll('[STORE,SETTINGS_STORE]', '[progressStore(),SETTINGS_STORE]').replaceAll('removed.includes(STORE)', 'removed.includes(progressStore())');
  const shell = once(titleShell, '__SESSION_CHECK__', '');
  html = once(html, 'function render(){', `${adapter}\n${shell}\nfunction render(){`);
  html = once(html, "if(state.view==='home')home();", "if(state.view==='home')home();else if(state.view==='learning')learningHome();else if(state.view==='auth')authView();");
  html = once(html, '\nrender();\n})();', "\nstate.view='home';\ncheckIncomingLink();\nrender();\nvoid checkSession();\n})();");
  html = once(html, '<!doctype html>', `<!doctype html>\n<!-- GENERATED: scripts/build-kids-title.mjs; source digest ${digest}; do not hand edit. -->`);
  const inline = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  if (!inline) throw Error('Missing generated learning script');
  new Script(inline, { filename: 'kids-title-generated.js' });
  return html;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const html = await generateKidsTitle();
  const target = new URL('public/kids-title/index.html', root);
  if (process.argv.includes('--check')) {
    if (await readFile(target, 'utf8') !== html) throw Error('Standalone title is stale; run node scripts/build-kids-title.mjs');
    process.stdout.write('Standalone title matches canonical learning + title/auth sources.\n');
  } else {
    await writeFile(target, html);
    process.stdout.write('Generated public/kids-title/index.html from canonical learning source.\n');
  }
}
