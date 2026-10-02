const { chromium } = require('playwright');
const fs = require('fs');
const URL = process.env.GH_DEV_URL || 'https://misty-horizon-1435.hosted.pageshare.ai';

(async()=>{
  const out={url:URL,stage:'initial-load-diagnosis',scriptCount:0,tests:[],culprit:null,disableOnly:null,errors:[]};
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

    function variant(prefix, disableOnly=-1){
      let i=0;
      return raw.replace(re,b=>{
        const keep = disableOnly>=0 ? i!==disableOnly : i<prefix;
        const n=i++;
        return keep?b:'<!-- CP02 disabled script '+n+' -->';
      });
    }
    async function test(name,html,timeout=7000){
      const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
      const rec={name,ok:false,ms:null,ready:null,title:null,bodyLen:null,errors:[]};
      page.on('pageerror',e=>{ if(rec.errors.length<8)rec.errors.push(String(e)); });
      const t=Date.now();
      try{
        await page.setContent(html,{waitUntil:'domcontentloaded',timeout});
        rec.ms=Date.now()-t;
        rec.ready=await page.evaluate(()=>document.readyState);
        rec.title=await page.title();
        rec.bodyLen=(await page.locator('body').innerText()).length;
        rec.ok=true;
      }catch(e){
        rec.ms=Date.now()-t;
        rec.errors.push(String(e).slice(0,500));
      }
      try{await page.close({runBeforeUnload:false});}catch{}
      out.tests.push(rec);
      return rec.ok;
    }

    const zero=await test('prefix-0',variant(0),5000);
    const all=await test('prefix-all',variant(blocks.length),9000);
    out.zeroLoads=zero;
    out.allLoads=all;

    if(zero && !all){
      let lo=0,hi=blocks.length;
      while(hi-lo>1){
        const mid=Math.floor((lo+hi)/2);
        const ok=await test('prefix-'+mid,variant(mid),7000);
        if(ok)lo=mid; else hi=mid;
      }
      const idx=hi-1;
      const b=blocks[idx];
      const id=(b.open.match(/\bid=["']([^"']+)["']/i)||[])[1]||null;
      out.culprit={scriptIndex:idx,activePrefix:hi,id,open:b.open,snippet:b.block.slice(0,800)};
      const only=await test('all-except-'+idx,variant(blocks.length,idx),9000);
      out.disableOnly=only;
    }
  }catch(e){
    out.errors.push(String(e&&e.stack||e));
  }finally{
    if(browser)await browser.close();
    fs.writeFileSync('cp02-result.json',JSON.stringify(out,null,2));
    console.log('CP02_DIAG='+JSON.stringify(out));
    if(!out.culprit)process.exitCode=1;
  }
})();