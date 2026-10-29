// Mock exchange API responses in the shapes the page expects
const now = Math.floor(Date.now()/1000);
function kl(interval, limit){ const sec={ '5m':300,'15m':900,'30m':1800,'1h':3600,'4h':14400,'1d':86400 }[interval]; const out=[]; let p=80000; const start=(Math.floor(now/sec)-limit+1)*sec;
  for(let i=0;i<limit;i++){ const o=p, c=p+(Math.sin(i/7)*60)+(Math.random()-0.5)*80; const h=Math.max(o,c)+30, l=Math.min(o,c)-30, v=50+Math.random()*100; out.push([ (start+i*sec)*1000, o.toFixed(2), h.toFixed(2), l.toFixed(2), c.toFixed(2), v.toFixed(4), (start+i*sec+sec)*1000-1, (v*c).toFixed(2), 1000, (v*(0.4+Math.random()*0.2)).toFixed(4), '0','0']); p=c; } return out; }
const rub = (n, f, sec=300) => Array.from({length:n}, (_,i)=>[String((Math.floor(now/sec)*sec - i*sec)*1000), ...f(i)]);
module.exports = function(url, method){
  const u = new URL(url); const q = Object.fromEntries(u.searchParams);
  if (u.host==='data-api.binance.vision'){
    if (u.pathname.endsWith('/ticker/24hr')) return {lastPrice:'80283.10',priceChangePercent:'-1.60',highPrice:'81682',lowPrice:'79221',volume:'11000',quoteVolume:'889222877'};
    if (u.pathname.endsWith('/klines')) return kl(q.interval, +q.limit);
  }
  if (u.host==='api.exchange.coinbase.com') { if (u.pathname.endsWith('/stats')) return {last:'80250.5',open:'80800',volume:'9100',high:'81500',low:'79200'};
    if (u.pathname.endsWith('/trades')) return Array.from({length:300},(_,i)=>({trade_id:900000-i, time:new Date(Date.now()-i*2000).toISOString(), size:String(Math.random()*0.5), side:Math.random()>0.5?'buy':'sell', price:'80250'}));
    return {price:'80250.5'}; }
  if (u.host==='api.kraken.com') return {error:[],result:{XXBTZUSD:{c:['80255.1','0.01'],o:'80700',v:['900','2100'],h:['81000','81500'],l:['79500','79200']}}};
  if (u.host==='www.bitstamp.net') return {last:'80249',open:'80790',volume:'1500',high:'81480',low:'79210'};
  if (u.host==='api.gemini.com') return {last:'80262',volume:{BTC:'700'}};
  if (u.host==='api.mexc.com') return {lastPrice:'80278',openPrice:'80880',volume:'4000',highPrice:'81590',lowPrice:'79250'};
  if (u.host==='www.okx.com'){
    if (u.pathname.includes('market/ticker')) return {code:'0',data:[{last:'80270.1',open24h:'80900',vol24h:'5200',high24h:'81600',low24h:'79300'}]};
    if (u.pathname.includes('liquidation-orders')) return {code:'0',data:[{instFamily:q.instFamily, instId:q.instFamily+'-SWAP', details:Array.from({length:30},(_,i)=>({side:i%3?'sell':'buy',posSide:i%3?'long':'short',bkPx:String(80000+i*20),sz:String(20+i*7),ts:String(Date.now()-i*240000)}))}]};
    if (u.pathname.includes('funding-rate')) return {code:'0',data:[{fundingRate:'0.0000361'}]};
    if (u.pathname.includes('public/open-interest')) return {code:'0',data:[{oiCcy:'25000.5'}]};
    if (u.pathname.includes('open-interest-volume')) return q.period==='1H' ? {code:'0',data:rub(200,i=>[String(2.0e9 - i*3e6 + Math.sin(i/5)*2e7), '1e9'],3600)} : {code:'0',data:rub(288,i=>[String(2.0e9+ i*1e6), '1e9'])};
    if (u.pathname.includes('taker-volume')) return q.period==='1H' ? {code:'0',data:rub(200,i=>[String(100+Math.random()*50), String(100+Math.random()*50)],3600)} : {code:'0',data:rub(288,i=>[String(100+Math.random()*50), String(100+Math.random()*50)])};
    if (u.pathname.includes('long-short')) return {code:'0',data:rub(288,i=>[String(1.6+Math.sin(i/20)*0.2)])};
  }
  if (u.host==='api.hyperliquid.xyz') return [{universe:[{name:'BTC'},{name:'ETH'}]},[{markPx:'80281',funding:'0.0000125',openInterest:'31000'},{markPx:'3000',funding:'0',openInterest:'1'}]];
  if (u.host==='api.bitget.com') return u.pathname.includes('/spot/') ? {code:'00000',data:[{lastPr:'80268',open:'80850',baseVolume:'3100',high24h:'81580',low24h:'79230'}]} : {code:'00000',data:[{lastPr:'80275',fundingRate:'0.00005',holdingAmount:'42000'}]};
  if (u.host==='www.deribit.com') {
    if (u.pathname.includes('book_summary') && q.kind==='future') return {result:[{instrument_name:'BTC-PERPETUAL',mark_price:80290,open_interest:9e8,volume_usd:1e9},{instrument_name:'BTC-31OCT26',mark_price:80330,open_interest:1e8,volume_usd:2e7},{instrument_name:'BTC-25DEC26',mark_price:81200,open_interest:3e8,volume_usd:5e7},{instrument_name:'BTC-26MAR27',mark_price:82400,open_interest:2e8,volume_usd:3e7}]};
    if (u.pathname.includes('book_summary')) { const r=[]; for (const e of ['30OCT26','27NOV26','25DEC26']) for (let k=64000;k<=100000;k+=2000) for (const cp of ['C','P']) r.push({instrument_name:`BTC-${e}-${k}-${cp}`, open_interest: Math.max(0, 900-Math.abs(k-(cp==='C'?86000:76000))/30)*(e==='25DEC26'?3:1), volume: 10}); return {result:r}; }
    return {result:{mark_price:80290,funding_8h:0.00002,open_interest:900000000}}; }
  if (u.host==='futures.kraken.com') return {result:'success',ticker:{markPrice:80280,last:80280,fundingRate:0.8,openInterest:3000}};
  if (u.host==='contract.mexc.com') return {success:true,data:{lastPrice:80279,fundingRate:0.0001,holdVol:120000000}};
  if (u.host==='open-api.bingx.com') return {code:0,data:{markPrice:'80282',lastFundingRate:'0.00008'}};
  if (u.host==='api.alternative.me') return {data:[{value:'38',value_classification:'Fear'},{value:'44',value_classification:'Fear'}]};
  if (u.host==='nfs.faireconomy.media') return [{title:'Federal Funds Rate',country:'USD',date:new Date(Date.now()+864e5).toISOString(),impact:'High',forecast:'3.75%',previous:'4.00%'},{title:'JOLTS Job Openings',country:'USD',date:new Date(Date.now()-36e5).toISOString(),impact:'Medium'}];
  if (u.host==='api.bybit.com') return {__status:403};
  if (u.host==='fapi.binance.com') return {__status:451};
  return null;
};
