const ts = require('/opt/node22/lib/node_modules/typescript');
const fs = require('fs');
const opts = { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, jsxFactory: 'React.createElement', jsxFragmentFactory: 'React.Fragment' } };
const mods = { 'grok/canvas': 'grok-canvas.tsx', './src': 'src.tsx', './entry': 'entry.tsx' };
let out = '(function(){var __m={},__c={};function require(n){if(__c[n])return __c[n].exports;var m=__c[n]={exports:{}};__m[n](m,m.exports,require);return m.exports;}\n';
for (const [name, file] of Object.entries(mods)) {
  const r = ts.transpileModule(fs.readFileSync(file, 'utf8'), { ...opts, fileName: file, reportDiagnostics: true });
  if (r.diagnostics && r.diagnostics.length) console.error(file, r.diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')).slice(0, 5));
  out += `__m[${JSON.stringify(name)}]=function(module,exports,require){\n${r.outputText}\n};\n`;
}
out += 'require("./entry");})();\n';
fs.writeFileSync('bundle.js', out);
console.log('bundle', (out.length / 1e6).toFixed(2), 'MB');
const tpl = fs.readFileSync('template.html', 'utf8');
const safe = out.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
fs.writeFileSync('btc-market-dashboard.html', tpl.replace('/*BUNDLE*/', () => safe));
console.log('html', (fs.statSync('btc-market-dashboard.html').size / 1e6).toFixed(2), 'MB');
