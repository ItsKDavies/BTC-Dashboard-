import re, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
site = ROOT / 'site'; out = ROOT / 'preview' / 'btc-dashboard-v2-preview.html'
h = (site/'index.html').read_text()
head = h[h.index('<head>')+6 : h.index('</head>')]
body = h[h.index('<body>')+6 : h.index('</body>')]
head = re.sub(r'<meta charset[^>]*>\s*', '', head); head = re.sub(r'<meta name="viewport"[^>]*>\s*', '', head)
head = head.replace('<title>BTC Market Dashboard v2</title>', '<title>BTC Dashboard v2 Preview</title>')
# theme toggle support (explicit light/dark from the viewer)
m = re.search(r'@media \(prefers-color-scheme:dark\)\{:root\{(.*?)\}\}', head, re.S)
dark = m.group(1)
head = head.replace(m.group(0), '@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){' + dark + '}}\n:root[data-theme="dark"]{' + dark + '}')
# scripts: drop external tags, inline ours after the demo shim
body = re.sub(r'<script src="(ta|app|app2|chart2|stage4)\.js"></script>\s*', '', body)
js = ''.join(f'<script>\n{(site/f).read_text().replace("</script", "<\\/script")}\n</script>\n' for f in ['ta.js', 'app.js', 'app2.js', 'chart2.js', 'stage4.js'])
shim = '<script>\n' + (ROOT / 'preview' / 'shim.js').read_text() + '\n</script>\n'
banner = '<div style="background:color-mix(in srgb,var(--warn) 18%,var(--bg));color:var(--fg);font-size:13px;padding:7px max(14px,env(safe-area-inset-left));border-bottom:1px solid var(--line)"><b>Preview with sample data.</b> Prices and flows here are made up so you can try the layout, chart and layers. Real data runs on your live Cloudflare site.</div>'
theme = '<script>new MutationObserver(()=>{try{recolorCharts();render();}catch(e){}}).observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});</script>'
out.write_text(head.strip() + '\n' + banner + '\n' + shim + body.strip() + '\n' + js + theme + '\n')
print(out, round(out.stat().st_size/1024), 'KB')
