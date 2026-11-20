/* VG game developer tools. Loaded only after the developer code is accepted. */
(()=>{
'use strict';
if(window.vgDev)return;

/* ---------- pure reference engine (shared by main thread and worker) ---------- */
const ENG=String.raw`
function idx(d,k,p){return d===0?k*4+p:d===2?k*4+3-p:d===1?p*4+k:(3-p)*4+k}
const _t=new Int32Array(4),_f=new Int8Array(16);
function mv(s,o,d){
  let moved=false,gain=0;
  for(let k=0;k<4;k++){
    let n=0;
    for(let p=0;p<4;p++){const v=s[idx(d,k,p)];if(v)_t[n++]=v}
    let w=0,i=0;
    while(i<n){let v=_t[i];if(i+1<n&&_t[i+1]===v){v*=2;gain+=v;i+=2}else i++;o[idx(d,k,w++)]=v}
    while(w<4)o[idx(d,k,w++)]=0;
    for(let p=0;p<4;p++){const j=idx(d,k,p);if(o[j]!==s[j])moved=true}
  }
  return moved?gain:-1;
}
function rn(st){
  st.s=(st.s+0x6D2B79F5)|0;let t=Math.imul(st.s^(st.s>>>15),1|st.s);
  t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;
}
function spawn(b,st,p4){
  let n=0;for(let i=0;i<16;i++)if(!b[i])_f[n++]=i;
  if(!n)return -1;
  const i=_f[(rn(st)*n)|0];b[i]=rn(st)<1-p4?2:4;return i;
}
function canMove(b){
  for(let r=0;r<4;r++)for(let c=0;c<4;c++){
    const v=b[r*4+c];if(!v)return true;
    if(c<3&&b[r*4+c+1]===v)return true;
    if(r<3&&b[(r+1)*4+c]===v)return true;
  }
  return false;
}
`;
const WORK=String.raw`
let stop=false;
function sumb(b){let s=0;for(let i=0;i<16;i++)s+=b[i];return s}
function cnt(b){let n=0;for(let i=0;i<16;i++)if(b[i])n++;return n}
function pow2(v){return v>=2&&(v&(v-1))===0}
function fuzz(m){
  const b=new Int32Array(16),o=new Int32Array(16),b2=new Int32Array(16),st={s:0},r2={s:0},fails=[];
  let g=0,moves=0;const t0=Date.now(),base=m.seed|0,p4=.1;
  function slice(){
    const end=Date.now()+40;
    while(g<m.games&&Date.now()<end&&!stop){
      const seed=(base+g*7919)|0;st.s=seed;r2.s=seed^0x5bd1e995;b.fill(0);spawn(b,st,p4);spawn(b,st,p4);
      let att=0,mm=0,bad=null;
      while(att<m.maxMoves*8&&mm<m.maxMoves&&!bad){
        att++;
        const d=(rn(r2)*4)|0,gain=mv(b,o,d),can=canMove(b);
        if(gain<0){
          if(!can){for(let k=0;k<4;k++)if(mv(b,b2,k)>=0){bad='canMove false but direction '+k+' moves';break}break}
          continue;
        }
        if(!can){bad='canMove false but a move happened';break}
        if(sumb(o)!==sumb(b)){bad='tile sum changed by a move: '+sumb(b)+' to '+sumb(o);break}
        for(let i=0;i<16;i++)if(o[i]&&!pow2(o[i])){bad='not a power of two: '+o[i];break}
        if(bad)break;
        const c0=cnt(o),s0=sumb(o),cell=spawn(o,st,p4);
        if(cell<0){bad='no empty cell after a move';break}
        const nv=o[cell];
        if(cnt(o)!==c0+1)bad='spawn changed tile count wrongly';
        else if(nv!==2&&nv!==4)bad='spawned value '+nv;
        else if(sumb(o)!==s0+nv)bad='spawn changed the sum wrongly';
        if(bad)break;
        b.set(o);mm++;
      }
      moves+=mm;
      if(bad){fails.push({seed:seed,move:mm,reason:bad,board:Array.from(b)});if(fails.length>=30)break}
      g++;
    }
    postMessage({t:'prog',g:g,moves:moves,fails:fails.length,ms:Date.now()-t0});
    if(g<m.games&&!stop&&fails.length<30)setTimeout(slice,0);
    else postMessage({t:'done',kind:'fuzz',g:g,moves:moves,fails:fails,ms:Date.now()-t0,stopped:stop});
  }
  slice();
}
const WT=new Float64Array(16);
(function(){const rk=[15,14,13,12,8,9,10,11,7,6,5,4,0,1,2,3];for(let i=0;i<16;i++)WT[i]=Math.pow(2,rk[i]*.75)})();
function heur(b){
  let s=0,e=0,mx=0;
  for(let i=0;i<16;i++){const v=b[i];if(v){s+=v*WT[i];if(v>mx)mx=v}else e++}
  return s+e*mx*40;
}
function search(b,depth){
  let best=-1e18,moved=false;
  for(let d=0;d<4;d++){
    const o=new Int32Array(16),g=mv(b,o,d);if(g<0)continue;
    moved=true;
    const v=depth<=0?heur(o)+g*30:chance(o,depth);
    if(v>best)best=v;
  }
  return moved?best:-1e12;
}
function chance(o,depth){
  const e=[];for(let i=0;i<16;i++)if(!o[i])e.push(i);
  if(!e.length)return heur(o);
  const step=Math.max(1,Math.ceil(e.length/4));let tot=0,n=0;
  for(let k=0;k<e.length;k+=step){
    const i=e[k];
    o[i]=2;tot+=.9*search(o,depth-1);
    o[i]=4;tot+=.1*search(o,depth-1);
    o[i]=0;n++;
  }
  return tot/n;
}
function bestMove(b,depth){
  const vals=[null,null,null,null];let best=-1,bv=-1e18;
  for(let d=0;d<4;d++){
    const o=new Int32Array(16),g=mv(b,o,d);if(g<0)continue;
    const v=chance(o,depth)+g*30;vals[d]=v;
    if(v>bv){bv=v;best=d}
  }
  return{best:best,vals:vals};
}
function bench(m){
  const b=new Int32Array(16),o=new Int32Array(16),st={s:0};
  let g=0,inGame=false,score=0,mm=0,moves=0,wins=0,tot=0,totMax=0;const hist={},t0=Date.now();
  function endGame(){
    let mx=0;for(let i=0;i<16;i++)if(b[i]>mx)mx=b[i];
    hist[mx]=(hist[mx]||0)+1;if(mx>=2048)wins++;tot+=score;totMax+=mx;g++;inGame=false;
  }
  function slice(){
    const end=Date.now()+40;
    while(g<m.games&&Date.now()<end&&!stop){
      if(!inGame){st.s=(m.seed+g*104729)|0;b.fill(0);spawn(b,st,.1);spawn(b,st,.1);score=0;mm=0;inGame=true}
      const r=bestMove(b,m.depth);
      if(r.best<0||mm>20000){endGame();continue}
      const gain=mv(b,o,r.best);b.set(o);score+=gain;spawn(b,st,.1);mm++;moves++;
    }
    const res={g:g,games:m.games,wins:wins,avgScore:g?Math.round(tot/g):0,avgMax:g?Math.round(totMax/g):0,hist:hist,moves:moves,ms:Date.now()-t0};
    if(g<m.games&&!stop){postMessage(Object.assign({t:'prog',kind:'bench'},res));setTimeout(slice,0)}
    else postMessage(Object.assign({t:'done',kind:'bench',stopped:stop},res));
  }
  slice();
}
onmessage=function(e){
  const m=e.data;
  if(m.cmd==='stop'){stop=true;return}
  stop=false;
  if(m.cmd==='fuzz')fuzz(m);
  else if(m.cmd==='bench')bench(m);
  else if(m.cmd==='hint'){const b=Int32Array.from(m.board),r=bestMove(b,m.depth);postMessage({t:'hint',id:m.id,best:r.best,vals:r.vals})}
};
`;
const E=new Function(ENG+';return{idx,mv,rn,spawn,canMove}')();

/* ---------- state ---------- */
let vg=null,core=null,root=null,chip=null,styleEl=null,timer=0,worker=null,job=null,open=false,tab='prof',cur=null;
const N=300,P={fr:new Float32Array(N),dr:new Float32Array(N),n:0,last:0,long:0,lg:[],lat:[],heap:new Float32Array(160),hn:0,lastHeap:0,gc:0,gcT:[]};
let hudOn=false,hitOn=false,touchOn=false,cont=false,lastTouch=null;
const bot={mode:'off',ms:200,ai:false,depth:2,restart:true,sent:0,seen:false,overs:0,top:0,next:0,pending:false};
let hist=[],hcur=-1,hdirs=[],rec=null,replaying=false,internal=0,slotA=null,slotB=null,hid=0;
const pend=new Map(),cmdHist=[];let cmdI=0,cmdBusy=false;

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function fnv(b,sc){let h=2166136261;for(let i=0;i<16;i++){h^=b[i];h=Math.imul(h,16777619)>>>0}h^=sc;return Math.imul(h,16777619)>>>0}
function sorted(src,count){const n=Math.min(count,src.length),a=new Float32Array(n);for(let i=0;i<n;i++)a[i]=src[(count-n+i)%src.length];return a.sort()}
function sortedArr(a){return Float32Array.from(a).sort()}
function pc(a,p){return a.length?a[Math.min(a.length-1,Math.floor(p*a.length))]:0}
function avg(a){let s=0;for(let i=0;i<a.length;i++)s+=a[i];return a.length?s/a.length:0}
function f1(x){return x.toFixed(1)}

/* ---------- hooks called by the game core ---------- */
function snapPush(d){
  const s=vg.snapshot();
  if(internal)return;
  if(hcur<hist.length-1){hist.length=hcur+1;hdirs.length=hcur}
  hdirs.push(d);hist.push(s);
  if(hist.length>3000){hist.splice(0,500);hdirs.splice(0,500)}
  hcur=hist.length-1;
  if(rec&&!replaying){rec.dirs.push(d);rec.hashes.push(fnv(s.b,s.s))}
}
const hook={
  keep:false,
  f(now,dm){
    const d=now-P.last;P.last=now;
    if(d>0&&d<200){P.fr[P.n%N]=d;P.dr[P.n%N]=dm;P.n++;if(d>25)P.long++}
    if(hudOn||hitOn||touchOn)overlay();
    botTick(now);
  },
  l(ms,ok){if(ok){P.lg.push(ms);if(P.lg.length>200)P.lg.shift()}},
  m(d){snapPush(d)},
  g(){if(internal)return;hist=[vg.snapshot()];hcur=0;hdirs=[]},
  t(ty,e){
    const tc=e.changedTouches&&e.changedTouches[0];if(!tc)return;
    const r=vg.cv.getBoundingClientRect();
    lastTouch={x:tc.clientX-r.left,y:tc.clientY-r.top,ty};
    if(e.isTrusted){
      const lat=performance.now()-e.timeStamp;if(lat>=0&&lat<1000){P.lat.push(lat);if(P.lat.length>200)P.lat.shift()}
      if(rec&&!replaying)rec.touches.push({t:Math.round(performance.now()-rec.t0),ty,id:tc.identifier,x:Math.round(tc.clientX*10)/10,y:Math.round(tc.clientY*10)/10});
    }
  }
};
function keepRender(){hook.keep=cont||bot.mode!=='off'}

/* ---------- overlays drawn on the game canvas ---------- */
function overlay(){
  const c=vg.ctx,R=vg.rects(),F=vg.flags();
  c.save();c.setTransform(vg.dpr,0,0,vg.dpr,0,0);c.textAlign='left';c.textBaseline='top';
  if(hitOn){
    c.lineWidth=1.5;c.font='9px monospace';
    const L=F.menu?[['menu',R.menu,'#ff0'],['sound',R.sound,'#f0f'],['lock',R.lock,'#f0f'],['done',R.done,'#fa0'],['t0',R.t[0],'#0ff'],['t1',R.t[1],'#0ff'],['t2',R.t[2],'#0ff'],['t3',R.t[3],'#0ff']]
      :[['board',R.board,'#0f0'],['panel',R.panel,'#08f'],['gear',R.gear,'#ff0'],['credits',R.credits,'#0ff'],['new',R.btn,'#f0f']];
    for(const q of L){c.strokeStyle=q[2];c.strokeRect(q[1].x,q[1].y,q[1].w,q[1].h);c.fillStyle=q[2];c.fillText(q[0],q[1].x+2,q[1].y+2)}
  }
  if(touchOn&&lastTouch){c.strokeStyle='#f33';c.lineWidth=2;c.beginPath();c.arc(lastTouch.x,lastTouch.y,vg.th,0,7);c.stroke();c.fillStyle='#f33';c.fillRect(lastTouch.x-2,lastTouch.y-2,4,4)}
  if(hudOn){
    const n=Math.min(P.n,90),w=n*2+8;
    c.fillStyle='rgba(0,0,0,.7)';c.fillRect(3,3,Math.max(w,150),46);
    for(let i=0;i<n;i++){const d=P.fr[(P.n-n+i)%N];c.fillStyle=d>33.4?'#ff3d71':d>16.9?'#ffb347':'#39ff88';const h=Math.min(d,50)*.5;c.fillRect(6+i*2,47-h,2,h)}
    const s=sorted(P.fr,P.n);
    c.font='10px monospace';c.fillStyle='#fff';c.fillText(Math.round(1000/(avg(s)||16.7))+'fps p95 '+f1(pc(s,.95))+'ms tiles '+vg.tiles(),8,6);
  }
  c.restore();
}

/* ---------- bot ---------- */
function botTick(now){
  if(bot.mode==='off')return;
  const F=vg.flags();
  if(vg.over){
    if(!bot.seen){bot.seen=true;bot.overs++;if(vg.score>bot.top)bot.top=vg.score}
    if(bot.restart){bot.seen=false;vg.newGame()}
    return;
  }
  if(F.splash||F.lk||F.menu||F.credOpen)return;
  if(bot.mode==='flood'){for(let k=0;k<20;k++)vg.input((Math.random()*4)|0);bot.sent+=20;return}
  if(bot.mode!=='frame'&&now<bot.next)return;
  bot.next=now+bot.ms;
  if(bot.ai){
    if(bot.pending)return;
    bot.pending=true;
    askHint(vg.board(),bot.depth).then(r=>{bot.pending=false;if(r.best>=0&&bot.mode!=='off'){vg.input(r.best);bot.sent++}});
    return;
  }
  bot.sent++;vg.input(Math.random()<.7?(Math.random()<.5?0:3):(Math.random()<.5?1:2));
}

/* ---------- worker plumbing ---------- */
function W(){
  if(!worker){
    worker=new Worker(URL.createObjectURL(new Blob([ENG+WORK],{type:'text/javascript'})));
    worker.onmessage=ev=>{
      const m=ev.data;
      if(m.t==='hint'){const f=pend.get(m.id);if(f){pend.delete(m.id);f(m)}}
      else if(job)job(m);
    };
  }
  return worker;
}
function askHint(b,depth){return new Promise(res=>{const id=++hid;pend.set(id,res);W().postMessage({cmd:'hint',board:b,depth,id})})}

/* ---------- ui helpers ---------- */
const CSS=`#vgd{position:fixed;inset:0;z-index:20;display:none;flex-direction:column;box-sizing:border-box;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px);background:#0d0d14;color:#d7d7e8;font:13px/1.4 ui-monospace,Menlo,Consolas,monospace}
#vgd.on{display:flex}
#vgd header{display:flex;gap:6px;align-items:center;padding:6px 8px;background:#16161f}
#vgd header b{flex:1;color:#39ff88}
#vgd nav{display:flex;gap:4px;padding:4px 8px;overflow-x:auto;background:#11111a}
#vgd button{font:inherit;color:#fff;background:#2a2a3d;border:1px solid #3b3b55;border-radius:8px;padding:8px 12px;min-height:38px;white-space:nowrap}
#vgd button.a{background:#39ff88;color:#0d0d14;border-color:#39ff88}
#vgd button.r{background:#ff3d71;border-color:#ff3d71}
#vgd main{flex:1;overflow:auto;padding:8px 10px;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
#vgd pre{margin:0 0 8px;white-space:pre-wrap;word-break:break-word;background:#16161f;padding:8px;border-radius:8px;-webkit-user-select:text;user-select:text}
#vgd .row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:0 0 8px}
#vgd h4{margin:10px 0 6px;color:#39ff88;font-size:13px}
#vgd input,#vgd select,#vgd textarea{font:inherit;background:#1d1d2b;color:#fff;border:1px solid #3b3b55;border-radius:8px;padding:7px;min-height:36px;max-width:100%;box-sizing:border-box}
#vgd input{width:96px}
#vgd input[type=range]{flex:1 1 140px;width:auto;padding:0}
#vgd textarea{width:100%;min-height:70px}
#vgchip{position:fixed;top:2px;left:50%;transform:translateX(-50%);z-index:19;display:none;font:700 11px ui-monospace,monospace;color:#0d0d14;background:#39ff88;border:0;border-radius:10px;padding:3px 10px;opacity:.85}`;
function el(t,c,x){const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e}
function bt(label,fn,c){
  const b=el('button',c||'',label);
  b.addEventListener('click',()=>{try{vg.sfx.unlock()}catch(e){}Promise.resolve().then(()=>fn(b)).catch(err=>vg.log('e',err&&err.message||err)).then(()=>{refresh();vg.invalidate()})});
  return b;
}
function rw(...k){const r=el('div','row');k.forEach(x=>r.appendChild(x));return r}
function ip(v,w){const i=el('input');i.value=String(v);i.inputMode='numeric';if(w)i.style.width=w;return i}
function sl(o,v){const s=el('select');o.forEach(x=>{const e=el('option','',x[1]);e.value=String(x[0]);s.appendChild(e)});s.value=String(v);return s}
function tg(label,get,set){
  const b=bt('',()=>{set(!get());keepRender();paint()});
  const paint=()=>{b.textContent=label+': '+(get()?'ON':'OFF');b.className=get()?'a':''};
  paint();return b;
}
function cb(label,fn){let t=0;const b=bt(label,()=>{if(Date.now()-t<3000)return fn();t=Date.now();b.textContent='Tap again to confirm';setTimeout(()=>{b.textContent=label},3000)},'r');return b}
function slider(label,min,max,step,get,set,fm){
  const w=el('div','row'),v=el('span'),i=el('input');
  i.type='range';i.min=min;i.max=max;i.step=step;i.value=get();
  const show=()=>{v.textContent=label+' '+fm(+i.value)};
  i.oninput=()=>{set(+i.value);show();vg.invalidate()};show();
  w.append(v,i);return w;
}
async function copyText(t){
  try{await navigator.clipboard.writeText(t)}
  catch(e){const a=el('textarea');a.value=t;document.body.appendChild(a);a.select();try{document.execCommand('copy')}catch(e2){}a.remove()}
  vg.log('i','copied '+t.length+' chars');
}
function refresh(){if(cur&&cur.upd)cur.upd()}
function fmt(v){
  if(v===undefined)return 'undefined';
  if(typeof v==='function')return 'function '+(v.name||'');
  if(typeof v==='string')return JSON.stringify(v);
  try{const s=JSON.stringify(v,(k,x)=>x instanceof Int32Array||x instanceof Float32Array?Array.from(x):typeof x==='function'?'[fn]':x,1);return s.length>3000?s.slice(0,3000)+'...':s}catch(e){return String(v)}
}

/* ---------- tab: profile ---------- */
function drawGraph(c){
  const w=c.width=Math.max(100,c.clientWidth*2),h=c.height=200,x=c.getContext('2d');
  x.fillStyle='#16161f';x.fillRect(0,0,w,h);
  const n=Math.min(P.n,N),bw=w/N,sc=h/50;
  for(let i=0;i<n;i++){
    const k=(P.n-n+i)%N,d=P.fr[k],dr=P.dr[k],x0=(N-n+i)*bw,hd=Math.min(d,50)*sc,hr=Math.min(dr,50)*sc;
    x.fillStyle=d>33.4?'#ff3d71':d>16.9?'#ffb347':'#39ff88';x.fillRect(x0,h-hd,Math.max(1,bw-1),hd);
    x.fillStyle='#00e5ff';x.fillRect(x0,h-hr,Math.max(1,bw-1),hr);
  }
  x.strokeStyle='rgba(255,255,255,.35)';x.lineWidth=1;x.fillStyle='#fff';x.font='16px monospace';
  for(const ms of [16.7,33.3]){x.beginPath();x.moveTo(0,h-ms*sc);x.lineTo(w,h-ms*sc);x.stroke();x.fillText(ms+'ms',4,h-ms*sc-3)}
}
function drawHeap(c){
  const w=c.width=Math.max(100,c.clientWidth*2),h=c.height=140,x=c.getContext('2d');
  x.fillStyle='#16161f';x.fillRect(0,0,w,h);
  const n=Math.min(P.hn,160);if(n<2){x.fillStyle='#888';x.font='16px monospace';x.fillText('heap: no data (needs performance.memory)',6,30);return}
  let mn=1e18,mx=0;for(let i=0;i<n;i++){const v=P.heap[(P.hn-n+i)%160];if(v<mn)mn=v;if(v>mx)mx=v}
  const sp=Math.max(mx-mn,1e5);
  x.strokeStyle='#00e5ff';x.lineWidth=2;x.beginPath();
  for(let i=0;i<n;i++){const v=P.heap[(P.hn-n+i)%160],px=i*w/159,py=h-8-(v-mn)/sp*(h-16);if(i)x.lineTo(px,py);else x.moveTo(px,py)}
  x.stroke();
}
function profText(){
  const s=sorted(P.fr,P.n),d=sorted(P.dr,P.n),lg=sortedArr(P.lg),lat=sortedArr(P.lat),m=performance.memory;
  return 'frames '+Math.min(P.n,N)+' in window  avg fps '+Math.round(1000/(avg(s)||16.7))+
  '\nframe ms  p50 '+f1(pc(s,.5))+'  p95 '+f1(pc(s,.95))+'  p99 '+f1(pc(s,.99))+'  max '+f1(pc(s,1))+
  '\njank (>25ms) '+(s.length?Math.round(100*P.long/Math.max(P.n,1)):0)+'%  long frames '+P.long+
  '\ndraw ms   avg '+avg(d).toFixed(2)+'  p95 '+pc(d,.95).toFixed(2)+'  max '+pc(d,1).toFixed(2)+
  '\nmove() ms avg '+avg(lg).toFixed(3)+'  p95 '+pc(lg,.95).toFixed(3)+'  max '+pc(lg,1).toFixed(3)+'  ('+lg.length+' samples)'+
  '\ninput delivery ms  p50 '+f1(pc(lat,.5))+'  p95 '+f1(pc(lat,.95))+' ('+lat.length+' touches)'+
  '\nheap '+(m?(m.usedJSHeapSize/1048576).toFixed(1)+' MB   GC drops '+P.gc+(P.gcT.length>1?'   avg gap '+((P.gcT[P.gcT.length-1]-P.gcT[0])/(P.gcT.length-1)/1000).toFixed(1)+'s':''):'n/a')+
  '\nrender path '+(vg.opt?'optimized (sprites + cached layer)':'legacy (vector draw each frame)')+'  tiles '+vg.tiles()+'  canvas '+vg.cv.width+'x'+vg.cv.height+' dpr '+vg.dpr;
}
async function benchEngine(out){
  const keep={opt:vg.opt,mode:bot.mode},snap=vg.snapshot(),rows=[];
  out.textContent='Running... keep the app open (about 12 seconds)';
  for(const o of [true,false]){
    vg.opt=o;bot.mode='frame';keepRender();vg.invalidate();
    await sleep(900);P.n=0;P.long=0;
    await sleep(4000);
    const s=sorted(P.fr,P.n),d=sorted(P.dr,P.n);
    rows.push((o?'optimized':'legacy   ')+'  fps '+Math.round(1000/(avg(s)||16.7))+'  frame p50 '+f1(pc(s,.5))+' p95 '+f1(pc(s,.95))+'  draw avg '+avg(d).toFixed(2)+' p95 '+pc(d,.95).toFixed(2)+'ms');
  }
  bot.mode=keep.mode;vg.opt=keep.opt;keepRender();vg.restore(snap);
  out.textContent=rows.join('\n')+'\n(each run: 4s, bot plays one move per frame. Lower draw ms is better.)';
}
function tabProf(){
  const g1=el('canvas'),g2=el('canvas'),pre=el('pre'),bpre=el('pre'),bs=el('pre');
  g1.style.cssText=g2.style.cssText='width:100%;display:block;border-radius:8px;margin-bottom:6px';
  g1.style.height='100px';g2.style.height='70px';
  const mode=sl([['off','Bot: off'],['ms500','Bot 500ms'],['ms200','Bot 200ms'],['ms50','Bot 50ms'],['frame','Bot every frame'],['flood','Bot flood x20/frame']],bot.mode==='ms'?'ms'+bot.ms:bot.mode);
  mode.onchange=()=>{const v=mode.value;if(v.startsWith('ms')){bot.mode='ms';bot.ms=+v.slice(2)}else bot.mode=v;bot.next=0;keepRender();vg.invalidate()};
  const strat=sl([['rand','Random moves'],['ai1','AI depth 1'],['ai2','AI depth 2'],['ai3','AI depth 3']],bot.ai?'ai'+bot.depth:'rand');
  strat.onchange=()=>{const v=strat.value;bot.ai=v!=='rand';if(bot.ai)bot.depth=+v.slice(2)};
  $m().append(g1,g2,pre,
    rw(tg('HUD overlay',()=>hudOn,v=>{hudOn=v}),tg('Hitboxes',()=>hitOn,v=>{hitOn=v}),tg('Touch dot',()=>touchOn,v=>{touchOn=v})),
    rw(tg('Continuous render',()=>cont,v=>{cont=v}),tg('Optimized renderer',()=>vg.opt,v=>{vg.opt=v}),bt('Reset stats',()=>{P.n=0;P.long=0;P.lg.length=0;P.lat.length=0;P.gc=0;P.gcT.length=0})),
    el('h4','','Benchmark: optimized vs legacy renderer'),
    rw(bt('Run benchmark (12s)',()=>benchEngine(bpre))),bpre,
    el('h4','','Bot'),rw(mode,strat,tg('Restart on game over',()=>bot.restart,v=>{bot.restart=v})),bs,
    el('pre','','Overlays draw on the game. Tap Minimize to see them.'));
  cur={upd(){pre.textContent=profText();drawGraph(g1);drawHeap(g2);bs.textContent='inputs sent '+bot.sent+'   games over '+bot.overs+'   top score '+bot.top}};
}

/* ---------- tab: replay and time travel ---------- */
function goto(k){
  k=Math.max(0,Math.min(hist.length-1,k|0));
  internal++;try{vg.restore(hist[k])}finally{internal--}
  hcur=k;
}
function fireTouch(ty,id,x,y){
  const t=new Touch({identifier:id,target:vg.cv,clientX:x,clientY:y,radiusX:1,radiusY:1}),list=ty==='e'?[]:[t];
  vg.cv.dispatchEvent(new TouchEvent(ty==='s'?'touchstart':ty==='m'?'touchmove':'touchend',{cancelable:true,bubbles:true,touches:list,targetTouches:list,changedTouches:[t]}));
}
async function replayLogic(r){
  vg.setQuiet(true);internal++;
  try{vg.restore(r.start);const hs=[];for(const d of r.dirs){vg.stepSync(d);hs.push(fnv(vg.board(),vg.score))}return hs}
  finally{internal--;vg.setQuiet(false)}
}
function firstDiff(a,b){const n=Math.max(a.length,b.length);for(let i=0;i<n;i++)if(a[i]!==b[i])return i;return -1}
function parseRec(t){try{const r=JSON.parse(t);if(r&&r.start&&Array.isArray(r.dirs)&&Array.isArray(r.hashes))return r}catch(e){}return null}
function tabReplay(){
  const info=el('pre'),slider0=el('input'),ta=el('textarea'),out=el('pre'),mv=el('pre');
  slider0.type='range';slider0.style.cssText='width:100%;flex:1 1 100%';
  slider0.oninput=()=>{goto(+slider0.value);refresh()};
  ta.placeholder='Paste a recording JSON here';
  const stat=()=>{slider0.max=Math.max(0,hist.length-1);slider0.value=hcur;
    info.textContent='Time travel: step '+hcur+' of '+(hist.length-1)+'   score '+(hist[hcur]?hist[hcur].s:0)+'\nMake a move after scrubbing back to branch from that point.';
    mv.textContent='Moves: '+hdirs.slice(-120).map(d=>'LURD'[d]).join('')+(hdirs.length>120?' (last 120)':'');
    out.dataset.x=out.dataset.x||''};
  $m().append(el('h4','','Time travel'),info,rw(slider0),
    rw(bt('<< Start',()=>goto(0)),bt('< Back',()=>goto(hcur-1)),bt('Forward >',()=>goto(hcur+1)),bt('End >>',()=>goto(hist.length-1))),mv,
    el('h4','','Record and replay'),
    rw(bt('Start recording',()=>{rec={v:1,build:vg.version,t0:performance.now(),start:vg.snapshot(),touches:[],dirs:[],hashes:[]};out.textContent='Recording... play, then press Stop.'}),
       bt('Stop',()=>{if(!rec)return;const r=rec;rec=null;r.dur=Math.round(performance.now()-r.t0);delete r.t0;slotA=r;out.textContent='Recorded '+r.touches.length+' touch events, '+r.dirs.length+' moves, '+r.dur+'ms. Saved in slot A.'}),
       bt('Copy slot A',()=>slotA?copyText(JSON.stringify(slotA)):0)),
    rw(bt('Replay touches (real time)',()=>{
         if(!slotA)return;const r=slotA;replaying=true;internal++;vg.restore(r.start);internal--;
         r.touches.forEach(t=>setTimeout(()=>fireTouch(t.ty,t.id,t.x,t.y),t.t));
         const end=(r.touches.length?r.touches[r.touches.length-1].t:0)+800;
         out.textContent='Replaying '+r.touches.length+' touches...';
         setTimeout(()=>{replaying=false;const h=fnv(vg.board(),vg.score),want=r.hashes.length?r.hashes[r.hashes.length-1]:null;out.textContent='Replay finished. Final state '+(want===null?'(no moves recorded)':h===want?'MATCHES the recording':'differs from the recording (touch timing can change buffered swipes)');refresh()},end);
       }),
       bt('Replay logic (instant)',async()=>{
         if(!slotA)return;const t=performance.now(),hs=await replayLogic(slotA),d=firstDiff(hs,slotA.hashes);
         out.textContent='Logic replay of '+slotA.dirs.length+' moves in '+(performance.now()-t).toFixed(1)+'ms: '+(d<0?'IDENTICAL to the recording (every step hash matches)':'first difference at move '+(d+1));
       })),
    el('h4','','Import and compare'),ta,
    rw(bt('Load as A',()=>{const r=parseRec(ta.value);if(r){slotA=r;out.textContent='Slot A loaded ('+r.dirs.length+' moves, build '+r.build+')'}else out.textContent='Not a valid recording'}),
       bt('Load as B',()=>{const r=parseRec(ta.value);if(r){slotB=r;out.textContent='Slot B loaded ('+r.dirs.length+' moves, build '+r.build+')'}else out.textContent='Not a valid recording'}),
       bt('Diff A vs B',()=>{if(!slotA||!slotB){out.textContent='Load both slots first';return}const d=firstDiff(slotA.hashes,slotB.hashes);out.textContent=d<0?'A and B have identical step hashes ('+slotA.hashes.length+' moves)':'First difference at move '+(d+1)+' (A '+slotA.hashes[d]+', B '+slotB.hashes[d]+')'}),
       bt('Verify A on this build',async()=>{if(!slotA)return;const hs=await replayLogic(slotA),d=firstDiff(hs,slotA.hashes);out.textContent=d<0?'PASS: this build reproduces recording A exactly ('+hs.length+' moves)':'FAIL: this build diverges from recording A at move '+(d+1)+' (recorded on build '+slotA.build+')'})),
    out);
  cur={upd:stat};
}

/* ---------- tab: console ---------- */
async function runCode(src){
  let fn;
  try{fn=new Function('vg','dev','return ('+src+'\n)')}catch(e){fn=new Function('vg','dev',src)}
  return await fn(vg,api);
}
function logLine(x){return x.t+'ms '+x.l+' '+x.m}
function tabCon(){
  const pre=el('pre'),ta=el('textarea'),f=sl([['a','All'],['w','Warn + errors'],['e','Errors']],'a');
  ta.style.minHeight='56px';ta.placeholder='JavaScript, for example: vg.score or vg.stepSync(2) or vg.setBoard([2,2,0,0, ...])';
  const run=async()=>{
    const src=ta.value.trim();if(!src||cmdBusy)return;
    cmdBusy=true;cmdHist.push(src);cmdI=cmdHist.length;vg.log('i','> '+src);
    try{const r=await runCode(src);vg.log('r',fmt(r))}catch(e){vg.log('e',e&&e.stack?e.stack.split('\n')[0]:String(e))}
    cmdBusy=false;
  };
  $m().append(ta,
    rw(bt('Run',run),bt('Prev',()=>{if(cmdI>0){cmdI--;ta.value=cmdHist[cmdI]||''}}),bt('Next',()=>{if(cmdI<cmdHist.length){cmdI++;ta.value=cmdHist[cmdI]||''}}),bt('Clear input',()=>{ta.value=''})),
    rw(...['vg.flags()','vg.board()','vg.snapshot()','vg.rects()','vg.keys'].map(s=>bt(s,()=>{ta.value=s}))),
    rw(f,bt('Copy log',()=>copyText(core.log.map(logLine).join('\n'))),bt('Clear log',()=>{core.log.length=0}),bt('Test error',()=>setTimeout(()=>{throw new Error('dev test error')},0)),bt('Test rejection',()=>{Promise.reject(new Error('dev test rejection'))})),
    pre);
  cur={upd(){const lf=f.value;pre.textContent=core.log.filter(x=>lf==='a'||(lf==='w'?x.l==='w'||x.l==='e':x.l==='e')).slice(-80).map(logLine).join('\n')||'(empty)'}};
}

/* ---------- tab: tests ---------- */
async function diffTest(n,seed,out){
  const snap=vg.snapshot(),st={s:0},r2={s:seed^0x1234567},b=new Int32Array(16),o=new Int32Array(16);
  let games=0,mism=null,sc=0,i=0;
  const init=()=>{vg.seedOn(seed+games*31);st.s=seed+games*31;vg.newGame();vg.settle();b.fill(0);E.spawn(b,st,vg.p4);E.spawn(b,st,vg.p4);sc=0;
    const lb=vg.board();for(let k=0;k<16;k++)if(lb[k]!==b[k])return 'start board differs';return null};
  vg.setQuiet(true);internal++;
  try{
    let why=init();if(why)mism={i:0,why,board:Array.from(b)};
    for(;i<n&&!mism;i++){
      const d=(E.rn(r2)*4)|0,gain=E.mv(b,o,d),ok=vg.stepSync(d);
      if((gain>=0)!==ok){mism={i,d,why:'moved differs: live '+ok+', engine '+(gain>=0),board:Array.from(b)};break}
      if(ok){b.set(o);sc+=gain;E.spawn(b,st,vg.p4);
        const lb=vg.board();let same=true;for(let k=0;k<16;k++)if(lb[k]!==b[k])same=false;
        if(!same){mism={i,d,why:'board differs after move',board:Array.from(b),live:lb};break}
        if(vg.score!==sc){mism={i,d,why:'score differs: live '+vg.score+', engine '+sc,board:Array.from(b)};break}}
      if(!E.canMove(b)){if(!vg.over){mism={i,d,why:'engine says game over, live disagrees',board:Array.from(b)};break}games++;const w=init();if(w){mism={i,why:w,board:Array.from(b)};break}}
      if(i%250===249){out.textContent='checked '+(i+1)+' / '+n+' moves, '+games+' games...';await sleep(0)}
    }
  }finally{internal--;vg.setQuiet(false);vg.restore(snap)}
  return mism?{ok:false,mism,checked:i,games}:{ok:true,checked:n,games};
}
function tabTest(){
  const fo=el('pre'),dO=el('pre'),sO=el('pre'),fails=el('div');
  const gI=ip(2000),sI=ip(1234),mI=ip(3000),dI=ip(5000),dsI=ip(777),dep=sl([[1,'depth 1'],[2,'depth 2'],[3,'depth 3']],2),bg=ip(5,'70px');
  const jobStart=(msg,onm)=>{W().postMessage({cmd:'stop'});job=onm;setTimeout(()=>W().postMessage(msg),30)};
  const showFuzz=m=>{
    fo.textContent=(m.t==='done'?(m.stopped?'STOPPED  ':'DONE  '):'running  ')+m.g+' games, '+m.moves+' moves, '+(m.moves/Math.max(1,m.ms)*1000|0)+' moves/s, '+m.fails+(Array.isArray(m.fails)?'':'')+' failures';
    if(m.t==='done'&&Array.isArray(m.fails)){
      fo.textContent='DONE  '+m.g+' games, '+m.moves+' moves, '+(m.moves/Math.max(1,m.ms)*1000|0)+' moves/s, '+m.fails.length+' failures'+(m.fails.length?'':'  (all invariants held)');
      fails.textContent='';
      m.fails.slice(0,10).forEach(f=>{const p=el('pre','','seed '+f.seed+' move '+f.move+': '+f.reason+'\nboard '+f.board.join(','));fails.append(p,bt('Load this board',()=>vg.setBoard(f.board)))});
    }
  };
  $m().append(
    el('h4','','Fuzz test (background worker)'),
    el('pre','','Plays random games with a reference engine and checks: tile sum is conserved by a move, values are powers of two, exactly one legal tile spawns, game-over detection is consistent.'),
    rw(gI,sI,mI,bt('Run',()=>{fo.textContent='starting...';fails.textContent='';jobStart({cmd:'fuzz',games:+gI.value||100,seed:+sI.value|0,maxMoves:+mI.value||3000},showFuzz)}),bt('Stop',()=>W().postMessage({cmd:'stop'}))),
    fo,fails,
    el('h4','','Differential test: live game vs reference engine'),
    el('pre','','Runs the real game logic (including seeded spawns) and the reference engine side by side and compares every board and score. Your current game is restored afterwards.'),
    rw(dI,dsI,bt('Run',async()=>{dO.textContent='running...';const r=await diffTest(+dI.value||1000,+dsI.value|0,dO);
      dO.textContent=r.ok?'PASS: '+r.checked+' moves, '+r.games+' full games, live game matches the engine exactly':'FAIL at move '+r.mism.i+': '+r.mism.why+'\nengine board '+r.mism.board.join(',')+(r.mism.live?'\nlive board   '+r.mism.live.join(','):'')})),
    dO,
    el('h4','','Solver (expectimax, background worker)'),
    rw(dep,bt('Hint for current board',async()=>{const r=await askHint(vg.board(),+dep.value);sO.textContent='best move: '+(r.best<0?'none':'LURD'[r.best])+'\nvalues L/U/R/D: '+r.vals.map(v=>v===null?'-':Math.round(v)).join('  ');sO.dataset.best=r.best}),
       bt('Play hint',()=>{const b=+sO.dataset.best;if(b>=0)vg.input(b)})),
    rw(bg,bt('Benchmark AI games',()=>{sO.textContent='starting...';jobStart({cmd:'bench',games:+bg.value||3,depth:+dep.value,seed:99},m=>{
      const wr=m.g?Math.round(100*m.wins/m.g):0;
      sO.textContent=(m.t==='done'?(m.stopped?'STOPPED  ':'DONE  '):'running  ')+m.g+'/'+m.games+' games  2048+ in '+m.wins+' ('+wr+'%)  avg score '+m.avgScore+'  avg max tile '+m.avgMax+'\n'+(m.moves/Math.max(1,m.ms)*1000|0)+' moves/s  ('+(m.ms/Math.max(1,m.moves)).toFixed(1)+' ms per move)\nmax tiles '+JSON.stringify(m.hist)})}),
       bt('Stop',()=>W().postMessage({cmd:'stop'}))),
    sO);
  cur={upd(){}};
}

/* ---------- tab: tuning ---------- */
function tabTune(){
  const out=el('pre');
  $m().append(
    el('h4','','Live tuning (applies immediately)'),
    slider('Chance of a 4 spawn',0,.5,.01,()=>vg.p4,v=>{vg.p4=v},v=>Math.round(v*100)+'%'),
    slider('Animation duration',60,800,10,()=>vg.dur,v=>{vg.dur=v},v=>v+'ms'),
    slider('Slide share of animation',.2,.8,.05,()=>vg.slide,v=>{vg.slide=v},v=>Math.round(v*100)+'%'),
    slider('Swipe threshold',10,120,1,()=>vg.th,v=>{vg.th=v},v=>v+'px'),
    rw(bt('Reset to defaults',()=>{vg.p4=.1;vg.dur=200;vg.slide=.5;vg.relayout();renderTab()}),bt('Copy tuning JSON',()=>copyText(JSON.stringify({p4:vg.p4,dur:vg.dur,slide:vg.slide,th:Math.round(vg.th)})))),
    el('h4','','Seeded RNG'),
    rw(tg('Seeded',()=>vg.seeded,v=>{if(v)vg.seedOn(vg.seed||12345);else vg.seedOff()}),bt('New game, seed 12345',()=>{vg.seedOn(12345);vg.newGame()})),
    el('h4','','Triggers'),
    rw(bt('2048 banner',()=>{minimize();vg.trigger('win')}),bt('Force game over',()=>vg.trigger('over')),bt('New best + Credits',()=>vg.trigger('best')),bt('Open credits',()=>{minimize();vg.trigger('credits')}),bt('Replay splash',()=>{minimize();vg.trigger('splash')})),
    el('h4','','Board tools'),
    rw(...[['Near win',[1024,1024,0,0,512,256,128,64,32,16,8,4,2,0,0,0]],['Game over',[2,4,2,4,4,2,4,2,2,4,2,4,4,2,4,2]],['All 2s',Array(16).fill(2)],['Max tiles',[65536,32768,16384,8192,4096,2048,1024,512,256,128,64,32,16,8,4,2]]].map(q=>bt(q[0],()=>vg.setBoard(q[1])))),
    rw(...['move','merge','spawn','win','over','tap','bad','best'].map(k=>bt('snd '+k,()=>vg.sfx[k](k==='merge'?64:undefined)))),out);
  cur={upd(){}};
}

/* ---------- tab: data ---------- */
function diffLines(a,b){const A=a.split('\n'),B=b.split('\n'),sa=new Set(A),sb=new Set(B);return B.filter(x=>!sa.has(x)).map(x=>'+ '+x).concat(A.filter(x=>!sb.has(x)).map(x=>'- '+x)).join('\n')||'(no changes)'}
function tabData(){
  const keys=[];for(let i=0;i<localStorage.length;i++)keys.push(localStorage.key(i));
  const ks=sl(keys.length?keys.map(k=>[k,k]):[['','(no keys)']],keys[0]||''),ta=el('textarea'),out=el('pre'),crash=el('pre');
  let orig='';
  const load=()=>{const k=ks.value;let v=k?localStorage.getItem(k)||'':'';try{v=JSON.stringify(JSON.parse(v),null,1)}catch(e){}orig=v;ta.value=v;out.textContent=k?k+': '+v.length+' chars':''};
  ks.onchange=load;ta.style.minHeight='140px';load();
  const crashes=()=>{try{return JSON.parse(localStorage.getItem(vg.keys.crash)||'[]')}catch(e){return[]}};
  $m().append(el('h4','','Storage editor'),rw(ks,bt('Reload',load),bt('Diff',()=>{out.textContent=diffLines(orig,ta.value)})),ta,
    rw(bt('Save',()=>{const k=ks.value;if(!k)return;let v=ta.value;try{v=JSON.stringify(JSON.parse(v))}catch(e){}localStorage.setItem(k,v);out.textContent='saved '+k+' ('+v.length+' chars). Restart or use vg.restore to apply.'}),
       cb('Delete key',()=>{localStorage.removeItem(ks.value);renderTab()})),out,
    el('h4','','Crash log (kept across launches)'),
    rw(bt('Copy',()=>copyText(JSON.stringify(crashes(),null,1))),bt('Clear',()=>{localStorage.removeItem(vg.keys.crash)})),crash,
    el('h4','','Danger'),rw(cb('Wipe all data and reload',()=>{localStorage.clear();location.reload()})));
  cur={upd(){const a=crashes();crash.textContent=a.length?a.slice(-8).map(x=>x.t+'  build '+x.b+'  '+x.k+'\n'+x.m+(x.s?'\n'+x.s.split('\n').slice(0,3).join('\n'):'')+'\nstate '+JSON.stringify(x.st)).join('\n\n'):'(no crashes recorded)'}};
}

/* ---------- tab: device and remote debugging ---------- */
let probe=null,est='';
function lsInfo(){let s='';try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);s+=k+'('+localStorage.getItem(k).length+') '}}catch(e){}return s||'-'}
function devReport(){
  const n=navigator,sc=screen,vv=window.visualViewport,cs=getComputedStyle(probe),m=n.userAgent.match(/Chrome\/([\d.]+)/),a=n.userAgent.match(/Android ([\d.]+)/);
  return ['Build '+vg.version,'Android '+(a?a[1]:'?')+'  WebView/Chrome '+(m?m[1]:'?'),
    'Screen '+sc.width+'x'+sc.height+'  Window '+innerWidth+'x'+innerHeight+(vv?'  VV '+Math.round(vv.width)+'x'+Math.round(vv.height):''),
    'DPR '+devicePixelRatio+'  canvas '+vg.cv.width+'x'+vg.cv.height,
    'Safe area T/R/B/L '+cs.paddingTop+' '+cs.paddingRight+' '+cs.paddingBottom+' '+cs.paddingLeft,
    'Orientation '+(sc.orientation?sc.orientation.type:'?')+'  touch points '+n.maxTouchPoints,
    'CPU cores '+(n.hardwareConcurrency||'?')+'  RAM ~'+(n.deviceMemory||'?')+' GB  online '+n.onLine,
    'Capacitor '+(window.Capacitor?'yes':'no')+'  service worker '+('serviceWorker' in n)+'  Worker '+(typeof Worker),
    'Storage '+(est||'?')+'\nKeys: '+lsInfo(),'Uptime '+Math.round(performance.now()/1000)+'s'].join('\n');
}
const GUIDE=`Remote debugging over USB (full Chrome DevTools on your PC)
1. On the phone: Settings > About phone, tap Build number 7 times, then Settings > Developer options > turn on USB debugging.
2. Connect the phone to the PC with the cable. Allow the USB debugging prompt on the phone.
3. On the PC open Chrome and go to chrome://inspect/#devices
4. Wait for "VG game" to appear under your phone, then click inspect.
5. You get Elements, Console, Sources (breakpoints), Performance (record a trace), Memory (heap snapshots) and Network.
If the phone does not appear: install the phone maker's USB driver on Windows, use a data cable (not charge-only), and unlock the phone.`;
function tabDev(){
  const pre=el('pre');
  if(!probe){probe=el('div');probe.style.cssText='position:fixed;left:0;top:0;width:0;height:0;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px);visibility:hidden';document.body.appendChild(probe)}
  try{navigator.storage.estimate().then(e=>{est=(e.usage/1048576).toFixed(2)+' / '+(e.quota/1048576|0)+' MB'})}catch(e){}
  $m().append(pre,rw(bt('Copy report',()=>copyText(devReport())),bt('Reload app',()=>location.reload())),el('h4','','Remote debugging'),el('pre','',GUIDE));
  cur={upd(){pre.textContent=devReport()}};
}

/* ---------- panel ---------- */
function $m(){return root.querySelector('main')}
const TABS=[['prof','Profile'],['replay','Replay'],['con','Console'],['test','Tests'],['tune','Tune'],['data','Data'],['dev','Device']];
function renderTab(){
  [...root.querySelector('nav').children].forEach(b=>{b.className=b.dataset.t===tab?'a':''});
  $m().textContent='';cur=null;
  ({prof:tabProf,replay:tabReplay,con:tabCon,test:tabTest,tune:tabTune,data:tabData,dev:tabDev})[tab]();
  refresh();
}
function show(){
  root.className=open?'on':'';chip.style.display=open?'none':'block';
  if(open)renderTab();
  vg.invalidate();
}
function minimize(){open=false;show()}
function build(){
  styleEl=document.createElement('style');styleEl.textContent=CSS;document.head.appendChild(styleEl);
  root=el('div');root.id='vgd';
  const hd=el('header');hd.appendChild(el('b','','DEVELOPER  '+vg.version));
  hd.appendChild(bt('Minimize',minimize));hd.appendChild(bt('Exit',()=>vg.exit(),'r'));
  const nav=el('nav');
  TABS.forEach(t=>{const b=bt(t[1],()=>{tab=t[0];renderTab()});b.dataset.t=t[0];nav.appendChild(b)});
  root.append(hd,nav,el('main'));document.body.appendChild(root);
  chip=el('button','','DEV');chip.id='vgchip';chip.addEventListener('click',()=>{open=true;show()});document.body.appendChild(chip);
}
function tick(){
  const m=performance.memory;
  if(m){const h=m.usedJSHeapSize;P.heap[P.hn%160]=h;P.hn++;if(P.lastHeap&&h<P.lastHeap-300000){P.gc++;P.gcT.push(performance.now());if(P.gcT.length>20)P.gcT.shift()}P.lastHeap=h}
  if(open)refresh();
  if(hudOn)vg.invalidate();
}
const api={bot,P,hook,E,get hist(){return hist},goto,replayLogic,fnv};
window.vgDev={
  start(v,c){
    vg=v;core=c;hist=[vg.snapshot()];hcur=0;hdirs=[];rec=null;replaying=false;internal=0;
    P.n=0;P.long=0;P.last=0;P.lg.length=0;P.lat.length=0;P.hn=0;P.gc=0;P.gcT.length=0;P.lastHeap=0;
    if(!root)build();
    core.hook=hook;open=true;tab='prof';
    if(!timer)timer=setInterval(tick,250);
    vg.log('i','developer mode on, build '+vg.version);
    show();
  },
  stop(){
    clearInterval(timer);timer=0;
    if(worker){worker.terminate();worker=null}
    core.hook=null;bot.mode='off';hudOn=hitOn=touchOn=cont=false;hook.keep=false;rec=null;replaying=false;
    if(root){root.remove();chip.remove();styleEl.remove();root=chip=styleEl=null}
    if(probe){probe.remove();probe=null}
  }
};
})();
