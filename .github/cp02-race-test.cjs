const { chromium } = require('playwright');
const fs = require('fs');
const URL = process.env.GH_DEV_URL || 'https://misty-horizon-1435.hosted.pageshare.ai';

(async()=>{
  const out={url:URL,stage:'initial-load-multi-blocker-diagnosis',scriptCount:0,blockers:[],tests:[],errors:[]};
  let browser;
  try{
    const res=await fetch(URL,{cache:'no-store'});
    out.httpStatus=res.status;
    const raw=await res.text();
    out.bytes=Buffer.byteLength(raw);
    const re=new RegExp('<script\\b[^>]*>[\\s\\S]*?</script>','gi');
    const openRe=new RegExp('^<script\\b[^>]*>','i');
    const blocks=[...raw.matchAll(re)].map((m,i)=>({i,block:m[0],open:(m[0].match(openRe)||[''])[0]}));
    out.scriptCount=blocks.length;
    browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--no-sandbox']});

    function variant(prefix,disabled){
      let i=0;
      return raw.replace(re,b=>{
        const n=i++;
        return (n<prefix && !disabled.has(n))?b:'<!-- CP02 disabled script '+n+' -->';
      });
    }
    async function test(name,html,timeout=3000){
      const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
      const rec={name,ok:false,ms:null,errors:[]};
      page.on('pageerror',e=>{if(rec.errors.length<5)rec.errors.push(String(e));});
      const t=Date.now();
      try{
        await page.setContent(html,{waitUntil:'domcontentloaded',timeout});
        rec.ms=Date.now()-t;
        rec.ok=true;
      }catch(e){
        rec.ms=Date.now()-t;
        rec.errors.push(String(e).slice(0,300));
      }
      try{await page.close({runBeforeUnload:false});}catch{}
      out.tests.push(rec);
      return rec.ok;
    }

    const disabled=new Set();
    if(!await test('prefix-0',variant(0,disabled),2000)) throw new Error('prefix-0 did not load');

    for(let round=0;round<12;round++){
      const allOk=await test('round-'+round+'-all',variant(blocks.length,disabled),3500);
      if(allOk){out.allLoadsAfterDisabling=true;break;}

      let lo=0,hi=blocks.length;
      while(hi-lo>1){
        const mid=Math.floor((lo+hi)/2);
        const ok=await test('round-'+round+'-prefix-'+mid,variant(mid,disabled),2500);
        if(ok)lo=mid; else hi=mid;
      }
      const idx=hi-1;
      if(disabled.has(idx)) throw new Error('diagnostic stalled on already-disabled script '+idx);
      const b=blocks[idx];
      const id=(b.open.match(/\bid=["']([^"']+)["']/i)||[])[1]||null;
      out.blockers.push({round,scriptIndex:idx,id,open:b.open,snippet:b.block.slice(0,1200)});
      disabled.add(idx);
    }

    out.disabled=[...disabled];
    out.finalAllLoad=await test('final-all',variant(blocks.length,disabled),5000);
  }catch(e){
    out.errors.push(String(e&&e.stack||e));
  }finally{
    if(browser)await browser.close();
    fs.writeFileSync('cp02-result.json',JSON.stringify(out,null,2));
    console.log('CP02_MULTI_DIAG='+JSON.stringify(out));
    if(!out.finalAllLoad)process.exitCode=1;
  }
})();