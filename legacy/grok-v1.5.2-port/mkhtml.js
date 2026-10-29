const fs=require('fs');const out=fs.readFileSync('bundle.js','utf8');const tpl=fs.readFileSync('template.html','utf8');
const safe=out.replace(/<\/script/gi,'<\\/script').replace(/<!--/g,'<\\!--');
fs.writeFileSync('btc-market-dashboard.html',tpl.replace('/*BUNDLE*/',()=>safe));console.log((fs.statSync('btc-market-dashboard.html').size/1e6).toFixed(2),'MB');
