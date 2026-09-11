#!/usr/bin/env node
// Concatenates src/ into the single artifact fragment scrutineer.html and syntax-checks the script.
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = __dirname, src = path.join(root, 'src');
const ORDER = ['engine.js', 'car.js', 'world.js', 'sim.js', 'trackscene.js', 'team.js', 'garage.js', 'scenes.js', 'season.js', 'curtain.js', 'dash.js', 'devtheme.js', 'devgraphs.js', 'devpanels.js', 'devaudit.js', 'devrun.js', 'devview.js', 'ui.js', 'trial.js', 'story.js', 'main.js'];
const present = ORDER.filter(f => fs.existsSync(path.join(src, f)));
const missing = ORDER.filter(f => !present.includes(f));
if (missing.length) console.log('build: skipping missing modules:', missing.join(', '));
const js = present.map(f => `// ===== ${f} =====\n${fs.readFileSync(path.join(src, f), 'utf8')}`).join('\n');
const css = fs.readFileSync(path.join(src, 'styles.css'), 'utf8');
const html = fs.readFileSync(path.join(src, 'index.html'), 'utf8');
// The loop's own output, when a season has been run. The broadcast reads it for the REGS
// articles, so nothing technical on screen is invented by the UI.
const bundlePath = path.join(root, 'loop', 'state', 'broadcast.json');
let loopJs = '';
if (fs.existsSync(bundlePath)) {
  const raw = fs.readFileSync(bundlePath, 'utf8');
  JSON.parse(raw); // fail the build rather than ship a bundle the page cannot parse
  loopJs = `window.SCRUTINEER_LOOP = ${raw};\n`;
  console.log(`build: inlined loop bundle ${(raw.length / 1024).toFixed(0)} KB`);
} else {
  console.log('build: no loop bundle (run `scrutineer season --export` in loop/)');
}
const out = `<title>Scrutineer</title>\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap">\n<style>\n${css}\n</style>\n${html}\n<script>\n${loopJs}${js}\n</script>\n`;
fs.writeFileSync(path.join(root, 'scrutineer.html'), out);

// The same page, wrapped as a standalone document for hosting. The artifact runtime supplies the
// skeleton; a web host does not, so the site build adds it (and a CSP that keeps the visitor's
// key from going anywhere except the relay).
const siteDir = path.join(root, 'site', 'public');
if (fs.existsSync(path.dirname(siteDir))) {
  fs.mkdirSync(siteDir, { recursive: true });
  const head = `<title>Scrutineer</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap">
<style>
${css}
</style>`;
  const doc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="An agent that builds web interfaces and rebuilds its own harness. Every page it builds is a real document you can open and audit yourself.">
<meta property="og:title" content="Scrutineer">
<meta property="og:description" content="Watch an agent rewrite its own harness, run by run. Every interface it builds is a real page you can open and audit with axe-core yourself.">
<meta name="theme-color" content="#06081A">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' fill='%2306081A'/%3E%3Cpath d='M2 3h4v4H2zM6 7h4v4H6zM10 3h4v4h-4zM2 11h4v4H2zM10 11h4v4h-4z' fill='%23F4C542'/%3E%3C/svg%3E">
${head}
</head>
<body>
${html}
<script>
${loopJs}${js}
</script>
</body>
</html>`;
  fs.writeFileSync(path.join(siteDir, 'index.html'), doc);
  // The interfaces the agent built, copied in as real documents so each one has a URL a
  // reviewer can open and audit independently.
  const pagesSrc = path.join(root, 'loop', 'state', 'pages');
  if (fs.existsSync(pagesSrc)) {
    const dst = path.join(siteDir, 'pages');
    fs.rmSync(dst, { recursive: true, force: true });
    fs.cpSync(pagesSrc, dst, { recursive: true });
    const n = fs.readdirSync(dst).reduce((a, d) =>
      a + fs.readdirSync(path.join(dst, d)).length, 0);
    console.log(`build: copied ${n} built interface(s) into site/public/pages`);
  }
  console.log(`build: site/public/index.html ${(doc.length / 1024).toFixed(0)} KB`);
}
// syntax check
const tmp = path.join(root, '.build-check.js'); fs.writeFileSync(tmp, js);
const r = cp.spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' }); fs.unlinkSync(tmp);
if (r.status !== 0) { console.error(r.stderr); process.exit(1); }
if (/console\.log\(/.test(js)) console.log('build: WARNING console.log present in modules');
if (/getContext\(\s*["']webgl/i.test(js)) console.log('build: WARNING WebGL used');
console.log(`build: scrutineer.html ${(out.length / 1024).toFixed(0)} KB, modules: ${present.join(', ')}`);
