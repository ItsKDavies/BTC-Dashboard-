// Port-only display fixes applied on top of the generated file (the original stays untouched).
const fs = require('fs'); let s = fs.readFileSync('src.tsx', 'utf8'); let n = 0;
const rep = (a, b) => { const c = s.split(a).length - 1; if (!c) console.warn('patch miss:', a.slice(0, 60)); n += c; s = s.split(a).join(b); };
// AGGR + Whales charts are drawn on a fixed 360-unit canvas; cap their width so text doesn't balloon on desktop.
rep('<svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", touchAction: "pan-y" }}', '<svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", touchAction: "pan-y", maxWidth: 620, margin: "0 auto" }}');
rep('<svg viewBox={`0 0 ${W} ${HD2}`} width="100%" style={{ display: "block" }}', '<svg viewBox={`0 0 ${W} ${HD2}`} width="100%" style={{ display: "block", maxWidth: 620, margin: "0 auto" }}');
rep('<svg viewBox={`0 0 ${FW} ${FH}`} width="100%" style={{ display: "block" }}', '<svg viewBox={`0 0 ${FW} ${FH}`} width="100%" style={{ display: "block", maxWidth: 620, margin: "0 auto" }}');
rep('<svg viewBox={`0 0 ${LW} ${LH}`} width="100%" style={{ display: "block" }}', '<svg viewBox={`0 0 ${LW} ${LH}`} width="100%" style={{ display: "block", maxWidth: 620, margin: "0 auto" }}');
// Clipboard can be refused inside the viewer; swallow the async rejection too.
rep('navigator.clipboard.writeText("refresh");', 'navigator.clipboard.writeText("refresh").catch(() => undefined);');
fs.writeFileSync('src.patched.tsx', s); console.log('patches applied:', n);
