import { chromium } from "playwright-core";
import fs from "fs";
import path from "path";

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),"..");
const manifest=JSON.parse(fs.readFileSync(path.join(root,"bisect_variants","manifest.json"),"utf8"));
const chrome=process.env.CHROME_BIN;
if(!chrome) throw new Error("CHROME_BIN missing");

const results=[];

for(const name of Object.keys(manifest.variants)){
  const browser=await chromium.launch({
    executablePath:chrome,
    headless:true,
    args:["--no-sandbox","--disable-dev-shm-usage"]
  });
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const url=`http://127.0.0.1:4173/bisect_variants/${name}/index.html`;
  const row={name, responsive:false, http:null, ms:null, error:null};
  const t0=Date.now();

  try{
    const res=await page.goto(url,{waitUntil:"commit",timeout:10000});
    row.http=res?.status()??null;
    await page.waitForTimeout(1500);
    const txt=await page.locator("body").innerText({timeout:3000});
    row.responsive=txt.trim().length>0;
  }catch(e){
    row.error=String(e).slice(0,500);
  }

  row.ms=Date.now()-t0;
  console.log(`BISECT_RESULT name=${name} responsive=${row.responsive} http=${row.http} ms=${row.ms} error=${row.error||""}`);
  results.push(row);
  await Promise.race([browser.close().catch(()=>{}),new Promise(r=>setTimeout(r,1500))]);
}

fs.writeFileSync(path.join(root,"bisect-results.json"),JSON.stringify({manifest,results},null,2));

const passing=results.filter(x=>x.responsive).map(x=>x.name);
const failing=results.filter(x=>!x.responsive).map(x=>x.name);
console.log("BISECT_PASSING="+passing.join(","));
console.log("BISECT_FAILING="+failing.join(","));
console.log("BOOT_BISECT=COMPLETE");
