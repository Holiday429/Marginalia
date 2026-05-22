import { chromium } from 'playwright-core';
import { writeFileSync } from 'fs';
const log=[];
try {
  const b = await chromium.launch({ executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args:['--no-sandbox'] });
  const p = await b.newPage({ viewport:{width:1500,height:950} });
  await p.goto('http://localhost:5173/#map',{waitUntil:'domcontentloaded'}); await p.waitForTimeout(3000);
  const sk=p.getByText('Skip',{exact:false}).first(); if(await sk.count()) await sk.click().catch(()=>{});
  await p.waitForTimeout(1500);
  await p.evaluate(()=>{location.hash='#map';});
  for(let i=0;i<70;i++){ if(await p.locator('#mapChart svg').count())break; await p.waitForTimeout(300);} 
  await p.waitForTimeout(4500);
  const box = await p.locator('#mapChart').boundingBox();
  let hit=null;
  for(const fx of [0.50,0.56,0.30,0.85,0.62,0.42]){
    await p.mouse.move(box.x+box.width*fx, box.y+box.height*0.72); await p.waitForTimeout(180);
    await p.mouse.move(box.x+box.width*fx+2, box.y+box.height*0.723); await p.waitForTimeout(800);
    const nm = await p.locator('#mapHoverName').innerText().catch(()=>'');
    if(nm){ hit={fx,nm}; break; }
  }
  log.push('hit='+JSON.stringify(hit));
  if(hit){
    for(let i=0;i<24;i++){ if(await p.locator('.map-hover-card-thumb.loaded').count())break; await p.waitForTimeout(250);} 
    await p.waitForTimeout(400);
    const r = await p.locator('#mapHoverCard').boundingBox();
    const cy = box.y+box.height*0.723;
    log.push(`cursorY=${Math.round(cy)} cardY=${Math.round(r.y)} bottom=${Math.round(r.y+r.height)} onScreen=${(r.y>=0&&r.y+r.height<=950)} flippedAbove=${r.y<cy}`);
    await p.screenshot({path:'/tmp/flip.png'});
  }
  await b.close();
} catch(e){ log.push('ERR '+e.message); }
writeFileSync('/tmp/flip-result.txt', log.join('\n'));
