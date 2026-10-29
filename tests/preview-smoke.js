const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  for (const [w,h,touch,scheme] of [[390,844,true,'dark'],[1300,900,false,'light']]) {
    const b = await chromium.launch(); const ctx = await b.newContext({ viewport:{width:w,height:h}, hasTouch:touch, isMobile:touch, colorScheme:scheme });
    const p = await ctx.newPage(); p.setDefaultTimeout(8000); const errs=[]; p.on('pageerror', e=>errs.push(e.message)); p.on('console', m=>{ if(m.type()==='error' && !/Failed to load resource/.test(m.text())) errs.push(m.text().slice(0,200)); });
    await p.route('**/*', r => r.request().url().startsWith('http://x.test') ? r.fulfill({ body: '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body style="margin:0">'+fs.readFileSync('../preview/btc-dashboard-v2-preview.html','utf8')+'</body></html>', contentType:'text/html' }) : r.abort());
    await p.goto('http://x.test/'); await p.waitForTimeout(6000);
    await p.screenshot({ path: `s4-${w}-over.png`, fullPage: false });
    for (const t of ['pat','derivs','mkts']) { await p.click(`[data-tab="${t}"]`); await p.waitForTimeout(1500);
      if (t==='derivs') { const bb = await p.locator('#posSvg').boundingBox(); if (touch) await p.touchscreen.tap(bb.x+bb.width*0.4, bb.y+60); else await p.mouse.move(bb.x+bb.width*0.4, bb.y+60); await p.waitForTimeout(300); console.log('posRead:', await p.innerText('#posRead')); await p.click('[data-postf="5m"]'); await p.waitForTimeout(1500); }
      await p.screenshot({ path: `s4-${w}-${t}.png`, fullPage: true }); }
    console.log(w, await p.evaluate(()=>({ sw: document.documentElement.scrollWidth, geo: GEO.v ? GEO.v.map(x=>x.tf+' '+x.name).join(', ') : null, cards: document.querySelectorAll('#patCdl .pcard').length })), errs.join(' | ') || 'no errors');
    await b.close();
  }
  process.exit(0);
})().catch(e=>{ console.log('FAIL', e.message.slice(0,300)); process.exit(1); });
