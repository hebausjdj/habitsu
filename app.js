const $=s=>document.querySelector(s),pad=n=>String(n).padStart(2,'0'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const FL={daily:'يومية',weekly:'أسبوعية',monthly:'شهرية',yearly:'سنوية'},DN=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
let db,st={weekStart:6,hijriAdj:0,showHijri:true,theme:null},tasks=[],recs=[],recBy={},tab='home',cal={y:0,m:0,sel:null},stat={mode:'week',off:0},hLim=60,lastDay='',show=null;
/* ---- storage ---- */
const open=()=>new Promise((ok,no)=>{const r=indexedDB.open('habits',1);r.onupgradeneeded=()=>{const d=r.result;d.createObjectStore('tasks',{keyPath:'id'});d.createObjectStore('records',{keyPath:'id'}).createIndex('date','date');d.createObjectStore('settings',{keyPath:'k'})};r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});
const all=n=>new Promise(ok=>{const q=db.transaction(n).objectStore(n).getAll();q.onsuccess=()=>ok(q.result)});
const put=(n,v)=>new Promise((ok,no)=>{const t=db.transaction(n,'readwrite');t.objectStore(n).put(v);t.oncomplete=ok;t.onerror=()=>no(t.error)});
const del=(n,k)=>new Promise(ok=>{const t=db.transaction(n,'readwrite');t.objectStore(n).delete(k);t.oncomplete=ok});
const addRec=r=>new Promise(ok=>{const t=db.transaction('records','readwrite');t.objectStore('records').add(r).onerror=e=>{e.preventDefault();ok(false)};t.oncomplete=()=>ok(true)});
async function load(){tasks=(await all('tasks')).sort((a,b)=>(a.order??1e9)-(b.order??1e9)||String(a.created).localeCompare(b.created));recs=await all('records');recBy={};recs.forEach(r=>(recBy[r.date]=recBy[r.date]||[]).push(r));const s=(await all('settings')).find(x=>x.k==='prefs');if(s)st={...st,...s.v};if(!st.cur){st.cur=key(new Date());savePrefs()}}
const savePrefs=()=>put('settings',{k:'prefs',v:st});
/* ---- dates ---- */
const key=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`,realToday=()=>key(new Date()),today=()=>st.cur||realToday();
const parse=k=>{const[a,b,c]=k.split('-').map(Number);return new Date(a,b-1,c,12)},addD=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x},dim=(y,m)=>new Date(y,m+1,0).getDate();
const wkStart=d=>addD(d,-((d.getDay()-st.weekStart+7)%7));
const fmt=(d,o,c='gregory')=>new Intl.DateTimeFormat('ar-u-ca-'+c+'-nu-latn',o).format(d);
const gd=d=>fmt(d,{day:'numeric',month:'long',year:'numeric'}),hd=d=>fmt(addD(d,st.hijriAdj),{day:'numeric',month:'long',year:'numeric'},'islamic-umalqura');
const dn=d=>fmt(d,{weekday:'long'}),dual=d=>gd(d)+(st.showHijri?' | '+hd(d):''),tm=ts=>fmt(new Date(ts),{hour:'numeric',minute:'2-digit'});
/* ---- scheduling logic ---- */
const alive=(t,d)=>{const k=key(d);return k>=t.created&&(!t.off||k<t.off)};
const isDate=(t,d)=>t.freq==='monthly'?!!t.mDay&&d.getDate()===Math.min(t.mDay,dim(d.getFullYear(),d.getMonth())):t.freq==='yearly'?!!t.yDay&&d.getMonth()+1===t.yMonth&&d.getDate()===Math.min(t.yDay,dim(d.getFullYear(),d.getMonth())):false;
const due=(t,d)=>alive(t,d)&&(t.freq==='daily'||t.freq==='weekly'||(t.freq==='monthly'&&(!!t.mTarget||isDate(t,d)))||(t.freq==='yearly'&&(!!t.yTarget||isDate(t,d))));
const must=(t,d)=>alive(t,d)&&(t.freq==='daily'||isDate(t,d));
const goal=t=>t.freq==='weekly'?t.wTarget:t.freq==='monthly'?t.mTarget:t.freq==='yearly'?t.yTarget:0;
function pc(t,d,s='done'){let a,b;const y=d.getFullYear(),m=pad(d.getMonth()+1);
 if(t.freq==='weekly'){a=key(wkStart(d));b=key(addD(wkStart(d),6))}else if(t.freq==='monthly'){a=`${y}-${m}-01`;b=`${y}-${m}-31`}else if(t.freq==='yearly'){a=y+'-01-01';b=y+'-12-31'}else a=b=key(d);
 return recs.filter(r=>r.taskId===t.id&&r.status===s&&r.date>=a&&r.date<=b).length}
function ds(d){const k=key(d),past=k<today(),rs=recBy[k]||[],ids=new Set(rs.map(r=>r.taskId));
 const pl=tasks.filter(t=>!ids.has(t.id)&&due(t,d)&&(!past||must(t,d))),sh=[];
 if(past)tasks.forEach(t=>{if(!alive(t,d)||!goal(t))return;let e=false;
  if(t.freq==='weekly')e=k===key(addD(wkStart(d),6));else if(t.freq==='monthly')e=d.getDate()===dim(d.getFullYear(),d.getMonth());else if(t.freq==='yearly')e=d.getMonth()===11&&d.getDate()===31;
  if(e){const n=goal(t)-pc(t,d,'done')-pc(t,d,'skip');if(n>0)sh.push({t,n})}});
 return{rs,pl,sh,done:rs.filter(r=>r.status==='done').length,skip:rs.filter(r=>r.status==='skip').length,pend:pl.length+sh.reduce((a,x)=>a+x.n,0)}}
function rng(a,b){const T=today(),r={done:0,skip:0,pend:0,per:{}};const P=(id,t)=>r.per[id]||(r.per[id]={title:t,done:0,skip:0,pend:0});
 for(let d=a;key(d)<=key(b)&&key(d)<=T;d=addD(d,1)){const s=ds(d);r.done+=s.done;r.skip+=s.skip;r.pend+=s.pend;
  s.rs.forEach(x=>P(x.taskId,x.title)[x.status]++);s.pl.forEach(t=>P(t.id,t.title).pend++);s.sh.forEach(x=>P(x.t.id,x.t.title).pend+=x.n)}return r}
function streaks(){const s=new Set(recs.filter(r=>r.status==='done').map(r=>r.date));let best=0,run=0,prev=null;[...s].sort().forEach(k=>{run=prev&&key(addD(parse(prev),1))===k?run+1:1;best=Math.max(best,run);prev=k});
 let c=0,d=parse(today());if(!s.has(key(d)))d=addD(d,-1);while(s.has(key(d))){c++;d=addD(d,-1)}return{best,cur:c}}
const pct=(a,b)=>b?Math.round(a*100/b):0;
/* ---- views ---- */
const ring=p=>`<svg class="ring" viewBox="0 0 44 44"><circle class="bg" cx="22" cy="22" r="18"/><circle class="fg" cx="22" cy="22" r="18" stroke-dasharray="${p*1.131} 113.1" transform="rotate(-90 22 22)"/><text x="22" y="25">${p}%</text></svg>`;
const AB=['أحد','اثنين','ثلاثاء','أربعاء','خميس','جمعة','سبت'],cc=t=>/^#[0-9a-f]{6}$/i.test(t.col||'')?t.col:'inherit';
function hdr(t,sub){return`<div class="top"><button class="ic" data-a="tab" data-k="set" aria-label="الإعدادات">⚙</button><div class="tc"><div class="tt1">${t}</div>${sub?`<div class="ts">${sub}</div>`:''}</div><span class="ic"></span></div>`}
function chipOf(t,d){if(t.freq==='daily'){const a=key(wkStart(d)),b=key(addD(wkStart(d),6));return{x:recs.filter(r=>r.taskId===t.id&&r.status==='done'&&r.date>=a&&r.date<=b).length+'/7',c:'g'}}
 const g=goal(t),n=pc(t,d);if(isDate(t,d))return{x:g?n+'/'+g:'اليوم',c:'g'};return{x:n+'/'+g,c:n>=g?'k':''}}
function row(t){const c=chipOf(t,parse(today()));return`<div class="trow" data-id="${t.id}"><div class="b" data-a="tk" data-id="${t.id}"><div class="t" style="color:${cc(t)}">${esc(t.title)}</div>${t.desc?`<div class="d">${esc(t.desc)}</div>`:''}</div><button class="cnt ${c.c}" dir="ltr" data-a="done" data-id="${t.id}" aria-label="إنجاز">${c.x}</button></div>`}
function strip(n){const rt=realToday(),cu=today(),w=wkStart(n);return'<div class="wk">'+[...Array(7)].map((_,i)=>{const d=addD(w,i),k=key(d);return`<button class="wd ${k===cu?'sel':k===rt?'rt':''}" data-a="wd" data-k="${k}"><b>${d.getDate()}</b><span>${AB[d.getDay()]}</span></button>`}).join('')+'</div>'}
function banner(){const c=today(),rt=realToday();if(rt<=c)return'';const y=key(addD(parse(rt),-1))===c;return`<button class="fin" data-a="nextday">إنهاء متابعة ${y?'أمس':dn(parse(c))}</button>${key(addD(parse(c),1))<rt?'<button class="lnk" data-a="gotoreal">الانتقال إلى اليوم الحالي مباشرة</button>':''}`}
function home(){const n=parse(today()),s=ds(n),tot=s.done+s.skip+s.pend,p=pct(s.done,tot),rt=realToday(),cu=today(),y=key(addD(parse(rt),-1))===cu;
 return hdr('المهام'+(cu!==rt?' ('+(y?'أمس':gd(n))+')':''),dual(n))+strip(n)+banner()+`<div class="prog"><i style="width:${p}%"></i></div><div class="sech"><h2>${cu===rt?'اليوم':dn(n)}</h2><span class="pc">${p}%</span><span style="flex:1"></span><button class="chip ${show==='done'?'on':''}" data-a="dl" data-k="done">منجزة ${s.done}</button><button class="chip s ${show==='skip'?'on':''}" data-a="dl" data-k="skip">متخطاة ${s.skip}</button><button class="plus" data-a="add" aria-label="مهمة جديدة">＋</button></div>${show?undoList(show):''}`+(s.pl.length?'<div id="tl">'+s.pl.map(row).join('')+'</div>'+(s.pl.length>1?'<p class="hint">اضغطي مطولًا على أي مهمة واسحبيها لترتيبها</p>':''):`<div class="empty">${tot?'أنهيتِ مهام اليوم':'لا توجد مهام اليوم. اضغطي + لإضافة مهمة.'}</div>`)}
function undoList(k){const l=(recBy[today()]||[]).filter(r=>r.status===k).sort((a,b)=>b.ts-a.ts);return`<div style="margin-bottom:12px"><p style="margin-bottom:6px">${k==='done'?'المنجزة اليوم':'المتخطاة اليوم'}: اضغط إرجاع لتعود المهمة للقائمة</p>`+(l.map(r=>`<div class="li"><div><div class="t">${esc(r.title)}</div><p>${tm(r.ts)}</p></div><button class="ok" style="flex:none" data-a="undo" data-id="${esc(r.id)}">↩ إرجاع</button></div>`).join('')||'<div class="empty" style="padding:14px">لا توجد مهام هنا</div>')+'</div>'}
function dayList(d){const s=ds(d),k=key(d);return`<h2>${dual(d)}</h2>`+(s.rs.length+s.pend?s.rs.map(r=>`<div class="li"><div class="t">${esc(r.title)}</div><span class="chip ${r.status==='skip'?'s':''}">${r.status==='done'?'منجزة':'متخطاة'} ${tm(r.ts)}</span></div>`).join('')+s.pl.map(t=>`<div class="li"><div class="t">${esc(t.title)}</div><span class="chip m">${k<today()?'لم تُنجز':'قيد الانتظار'}</span></div>`).join(''):'<div class="empty">لا توجد سجلات لهذا اليوم</div>')}
function calendar(){const n=parse(today());if(!cal.y){cal.y=n.getFullYear();cal.m=n.getMonth()}const f=new Date(cal.y,cal.m,1,12),L=dim(cal.y,cal.m),lead=(f.getDay()-st.weekStart+7)%7;
 let g=[...Array(7)].map((_,i)=>`<div class="w">${DN[(st.weekStart+i)%7].replace('ال','')}</div>`).join('')+'<div class="c e"></div>'.repeat(lead);
 for(let i=1;i<=L;i++){const d=new Date(cal.y,cal.m,i,12),k=key(d),s=k<=today()?ds(d):null;
  g+=`<button class="c ${k===today()?'td':''} ${k===cal.sel?'sel':''}" data-a="csel" data-k="${k}">${i}${st.showHijri?`<small>${fmt(addD(d,st.hijriAdj),{day:'numeric'},'islamic-umalqura')}</small>`:''}<span class="dots">${s?(s.done?'<i></i>':'')+(s.skip?'<i class="s"></i>':'')+(s.pend?'<i class="p"></i>':''):''}</span></button>`}
 const mid=new Date(cal.y,cal.m,15,12);
 return`${hdr('التقويم')}<div class="nav"><button data-a="cm" data-n="-1">›</button><b>${fmt(mid,{month:'long',year:'numeric'})}${st.showHijri?`<p>${fmt(addD(mid,st.hijriAdj),{month:'long',year:'numeric'},'islamic-umalqura')}</p>`:''}</b><button data-a="cm" data-n="1">‹</button></div><div class="grid">${g}</div><div class="sum" style="margin-top:10px"><span class="chip">● منجزة</span><span class="chip s">● متخطاة</span><span class="chip m">● معلّقة</span></div>`+(cal.sel?dayList(parse(cal.sel)):'')}
function buckets(){const n=parse(today()),m=stat.mode,o=stat.off,B=(l,a,b)=>({l,a,b});
 if(m==='year'){const y=n.getFullYear()+o;return{label:''+y,a:new Date(y,0,1,12),b:new Date(y,11,31,12),bk:[...Array(12)].map((_,i)=>B(i+1,new Date(y,i,1,12),new Date(y,i+1,0,12)))}}
 if(m==='month'){const f=new Date(n.getFullYear(),n.getMonth()+o,1,12),L=dim(f.getFullYear(),f.getMonth());return{label:fmt(f,{month:'long',year:'numeric'}),a:f,b:addD(f,L-1),bk:[...Array(L)].map((_,i)=>{const d=addD(f,i);return B(i+1,d,d)})}}
 if(m==='week'){const a=addD(wkStart(n),7*o);return{label:gd(a)+' – '+gd(addD(a,6)),a,b:addD(a,6),bk:[...Array(7)].map((_,i)=>{const d=addD(a,i);return B(DN[d.getDay()].slice(2,5),d,d)})}}
 const d=addD(n,o);return{label:dual(d),a:d,b:d,bk:[...Array(7)].map((_,i)=>{const x=addD(d,i-6);return B(x.getDate(),x,x)})}}
function stats(){const B=buckets(),r=rng(B.a,B.b),tot=r.done+r.skip+r.pend,s=streaks(),M={day:'يوم',week:'أسبوع',month:'شهر',year:'سنة'};
 const bars=B.bk.map(x=>{const q=rng(x.a,x.b);return pct(q.done,q.done+q.skip+q.pend)}),w=300/bars.length;
 const svg=`<svg class="bars" viewBox="0 0 300 100">${bars.map((p,i)=>`<rect x="${i*w+w*.15}" y="${88-p*.78}" width="${w*.7}" height="${Math.max(p*.78,1)}" rx="2"/>${bars.length<=12||i%5===0?`<text x="${i*w+w/2}" y="97">${B.bk[i].l}</text>`:''}`).join('')}</svg>`;
 const A={done:recs.filter(x=>x.status==='done').length,skip:recs.filter(x=>x.status==='skip').length};
 return`${hdr('الإحصائيات')}<div class="seg" style="margin:12px 0">${Object.entries(M).map(([k,v])=>`<button class="${stat.mode===k?'on':''}" data-a="sm" data-k="${k}">${v}</button>`).join('')}</div><div class="nav"><button data-a="so" data-n="-1">›</button><b>${B.label}</b><button data-a="so" data-n="1">‹</button></div>
 <div class="kpi"><div><b>${pct(r.done,tot)}%</b><span>نسبة الإنجاز</span></div><div><b style="color:var(--sk)">${pct(r.skip,tot)}%</b><span>نسبة التخطي</span></div><div><b>${r.done}</b><span>منجزة في الفترة</span></div><div><b>${r.skip}</b><span>متخطاة في الفترة</span></div></div>${svg}
 <div class="kpi"><div><b>${A.done}</b><span>إجمالي المنجز</span></div><div><b>${A.skip}</b><span>إجمالي المتخطى</span></div><div><b>${s.cur}</b><span>السلسلة الحالية (أيام)</span></div><div><b>${s.best}</b><span>أطول سلسلة (أيام)</span></div></div>
 <h2>إحصائيات كل مهمة</h2>`+(Object.values(r.per).map(p=>`<div class="li"><div class="t">${esc(p.title)}</div><div class="sum" style="margin:0"><span class="chip">${p.done}</span><span class="chip s">${p.skip}</span><span class="chip m">${pct(p.done,p.done+p.skip+p.pend)}%</span></div></div>`).join('')||'<div class="empty">لا توجد بيانات في هذه الفترة</div>')}
function history(){const l=recs.slice().sort((a,b)=>b.ts-a.ts),sl=l.slice(0,hLim);let h=hdr('السجل','للقراءة فقط'),last='';
 sl.forEach(r=>{if(r.date!==last){last=r.date;h+=`<h2>${dual(parse(r.date))}</h2>`}h+=`<div class="li"><div><div class="t">${esc(r.title)}</div><p>${FL[r.freq]||''}</p></div><span class="chip ${r.status==='skip'?'s':''}">${r.status==='done'?'منجزة':'متخطاة'} ${tm(r.ts)}</span></div>`});
 return h+(l.length?'':'<div class="empty">لا توجد سجلات بعد</div>')+(l.length>hLim?'<button style="width:100%" data-a="hmore">عرض المزيد</button>':'')}
const sel=(id,opts,v)=>`<select data-s="${id}">${opts.map(([a,b])=>`<option value="${a}" ${String(a)===String(v)?'selected':''}>${b}</option>`).join('')}</select>`;
function settings(){return`${hdr('الإعدادات')}
<div class="set"><span>أول يوم في الأسبوع</span>${sel('weekStart',[6,0,1,2,3,4,5].map(i=>[i,DN[i]]),st.weekStart)}</div>
<div class="set"><span>عرض التاريخ الهجري</span>${sel('showHijri',[[1,'نعم'],[0,'لا']],st.showHijri?1:0)}</div>
<div class="set"><span>تعديل الهجري (أيام)</span>${sel('hijriAdj',[-2,-1,0,1,2].map(i=>[i,i>0?'+'+i:i]),st.hijriAdj)}</div>
<div class="set"><span>المظهر</span>${sel('theme',[['light','فاتح'],['dark','داكن']],document.documentElement.dataset.theme)}</div>
<h2>المهام</h2><p style="margin-bottom:8px">استخدم الأسهم لترتيب المهام، ونفس الترتيب يظهر في الرئيسية.</p>`+(tasks.map(t=>`<div class="li" style="flex-wrap:wrap"><div class="t" style="flex:1;opacity:${t.off?.5:1}">${esc(t.title)}<p>${FL[t.freq]}${t.off?' – معطّلة':''}</p></div><div class="row" style="margin:0"><button data-a="up" data-id="${t.id}">↑</button><button data-a="dn" data-id="${t.id}">↓</button><button data-a="edit" data-id="${t.id}">تعديل</button><button data-a="tog" data-id="${t.id}">${t.off?'تفعيل':'تعطيل'}</button><button class="bad" data-a="del" data-id="${t.id}">حذف</button></div></div>`).join('')||'<div class="empty">لا توجد مهام</div>')+`<button style="width:100%;margin-top:6px" data-a="add">＋ مهمة جديدة</button>
<h2>حالة الأوفلاين</h2><div id="off" class="li" style="display:block">جاري الفحص...</div><h2>البيانات</h2><div class="row"><button data-a="export" style="flex:1">تصدير نسخة JSON</button><button data-a="import" style="flex:1">استعادة نسخة</button></div><input id="file" type="file" accept="application/json,.json" hidden>
<div class="row"><button class="bad" data-a="reset" style="flex:1">مسح كل البيانات</button></div><p style="margin-top:14px">تُحفظ البيانات على هذا الجهاز فقط ولا تُحذف تلقائيًا.</p>`}
function form(id){const t=tasks.find(x=>x.id===id)||{freq:'daily',wTarget:3},n=new Date();
 const inp=(i,v,ph)=>`<input id="${i}" type="number" inputmode="numeric" min="1" value="${v||''}" placeholder="${ph}">`;
 $('#sheet').hidden=false;$('#sheet').innerHTML=`<div data-f="${t.freq}" data-id="${id||''}"><h2 style="margin-top:0">${id?'تعديل المهمة':'مهمة جديدة'}</h2>
 <label>اسم المهمة</label><textarea id="f-title">${esc(t.title)}</textarea><label>وصف (اختياري)</label><textarea id="f-desc">${esc(t.desc)}</textarea>
 <label>التكرار</label>${sel('f-freq',Object.entries(FL),t.freq).replace('data-s="f-freq"','id="f-freq"')}
 <label>لون الاسم</label><select id="f-col">${[['','افتراضي'],['#e5484d','أحمر'],['#f0a030','برتقالي'],['#6fdc84','أخضر'],['#4c8dff','أزرق'],['#b57bee','بنفسجي']].map(([v,l])=>`<option value="${v}" style="color:${v||'inherit'}" ${(t.col||'')===v?'selected':''}>${l}</option>`).join('')}</select>
 <div class="sec weekly"><label>عدد مرات الإنجاز في الأسبوع</label>${inp('f-w',t.wTarget,'3')}</div>
 <div class="sec monthly"><label>عدد المرات في الشهر (اختياري)</label>${inp('f-m',t.mTarget,'مثال: 4')}<label>يوم محدد من الشهر (اختياري)</label><input id="f-md" type="number" inputmode="numeric" min="1" max="31" value="${t.mDay||''}" placeholder="مثال: 15"></div>
 <div class="sec yearly"><label>عدد المرات في السنة (اختياري)</label>${inp('f-y',t.yTarget,'مثال: 12')}<label>تاريخ محدد في السنة (اختياري)</label><div class="row" style="margin:0"><select id="f-ym"><option value="">—</option>${[...Array(12)].map((_,i)=>`<option value="${i+1}" ${t.yMonth===i+1?'selected':''}>${fmt(new Date(2024,i,1),{month:'long'})}</option>`).join('')}</select><input id="f-yd" type="number" inputmode="numeric" min="1" max="31" value="${t.yDay||''}" placeholder="اليوم"></div></div>
 <div class="row"><button class="ok" data-a="save">حفظ</button><button data-a="close" style="flex:1">إلغاء</button></div></div>`}
async function save(){const w=$('#sheet>div'),id=w.dataset.id,v=i=>$('#'+i).value,N=i=>parseInt(v(i))||0,title=v('f-title').trim(),freq=v('f-freq');
 if(!title)return alert('اكتب اسم المهمة');const o={title,desc:v('f-desc').trim(),freq,col:v('f-col'),wTarget:0,mTarget:0,mDay:0,yTarget:0,yMonth:0,yDay:0};
 if(freq==='weekly'){o.wTarget=Math.min(7,N('f-w'));if(!o.wTarget)return alert('حدد عدد المرات أسبوعيًا (1–7)')}
 if(freq==='monthly'){o.mTarget=N('f-m');o.mDay=Math.min(31,N('f-md'));if(!o.mTarget&&!o.mDay)return alert('حدد عددًا شهريًا أو يومًا من الشهر')}
 if(freq==='yearly'){o.yTarget=N('f-y');o.yMonth=N('f-ym');o.yDay=Math.min(31,N('f-yd'));if(!o.yMonth||!o.yDay)o.yMonth=o.yDay=0;if(!o.yTarget&&!o.yDay)return alert('حدد عددًا سنويًا أو تاريخًا محددًا')}
 const old=tasks.find(x=>x.id===id);await put('tasks',{...old,...o,id:id||(crypto.randomUUID?crypto.randomUUID():Date.now()+''+Math.random()),created:old?old.created:today(),order:old?old.order:Date.now()});$('#sheet').hidden=true;await load();R()}
async function move(id,n){const i=tasks.findIndex(t=>t.id===id),j=i+n;if(i<0||j<0||j>=tasks.length)return;tasks.forEach((t,x)=>t.order=x);const a=tasks[i].order;tasks[i].order=tasks[j].order;tasks[j].order=a;for(const t of tasks)await put('tasks',t);await load();R()}
async function act(id,s,el){const t=tasks.find(x=>x.id===id);if(!t)return;if(el){el.classList.add('out');await sleep(280)}
 await addRec({id:id+'|'+today(),taskId:id,title:t.title,freq:t.freq,date:today(),status:s,ts:Date.now()});await load();R()}
async function exportData(){const data=JSON.stringify({app:'habits',v:1,at:new Date().toISOString(),tasks,records:recs,settings:st}),name=`habits-backup-${today()}.json`,f=new File([data],name,{type:'application/json'});
 if(navigator.canShare&&navigator.canShare({files:[f]})){try{await navigator.share({files:[f]});return}catch(e){if(e.name==='AbortError')return}}
 const a=document.createElement('a');a.href=URL.createObjectURL(f);a.download=name;a.click()}
async function importData(file){try{const j=JSON.parse(await file.text());if(!Array.isArray(j.tasks)||!Array.isArray(j.records))throw 0;if(!confirm('سيتم استبدال البيانات الحالية بالنسخة المستعادة. هل تريد المتابعة؟'))return;
 await new Promise(ok=>{const t=db.transaction(['tasks','records','settings'],'readwrite');['tasks','records'].forEach(n=>t.objectStore(n).clear());j.tasks.forEach(x=>t.objectStore('tasks').put(x));j.records.forEach(x=>t.objectStore('records').put(x));if(j.settings)t.objectStore('settings').put({k:'prefs',v:j.settings});t.oncomplete=ok});await load();applyTheme();R();alert('تمت الاستعادة')}catch(e){alert('ملف غير صالح')}}
async function reset(){if(!confirm('سيتم حذف كل المهام والسجلات نهائيًا. هل أنت متأكد؟'))return;if(prompt('للتأكيد اكتب كلمة: حذف')!=='حذف')return;
 await new Promise(ok=>{const t=db.transaction(['tasks','records'],'readwrite');t.objectStore('tasks').clear();t.objectStore('records').clear();t.oncomplete=ok});await load();R()}
function applyTheme(){const t=st.theme||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');document.documentElement.dataset.theme=t;document.querySelector('meta[name=theme-color]').content=t==='dark'?'#0f1517':'#f2f4f5'}
async function offStatus(){const el=$('#off');if(!el)return;const m=[];try{if(!('serviceWorker'in navigator)){el.textContent='✗ المتصفح لا يدعم الأوفلاين';return}
const reg=await navigator.serviceWorker.getRegistration();m.push(reg?'✓ ملف التخزين مسجّل':'✗ ملف التخزين غير مسجّل');
m.push(navigator.serviceWorker.controller?'✓ التخزين يعمل على هذه الجلسة':'✗ لم يبدأ بعد: أغلق التطبيق تمامًا وافتحه من الأيقونة');
const miss=[];for(const f of['index.html','style.css','app.js','manifest.webmanifest','icon-180.png','icon-192.png','icon-512.png'])if(!(await caches.match(f,{ignoreSearch:true})))miss.push(f);
m.push(miss.length?'✗ ملفات ناقصة: '+miss.join('، '):'✓ كل الملفات محفوظة، جاهز للأوفلاين')}catch(e){m.push('✗ خطأ: '+e.message)}
el.innerHTML=m.map(x=>`<div>${esc(x)}</div>`).join('')}
async function saveOrder(vis){const set=new Set(vis),idx=[];tasks.forEach((t,i)=>{if(set.has(t.id))idx.push(i)});const by=Object.fromEntries(tasks.map(t=>[t.id,t])),arr=tasks.slice();idx.forEach((p,k)=>arr[p]=by[vis[k]]);arr.forEach((t,i)=>t.order=i);for(const t of arr)await put('tasks',t);await load();R()}
document.addEventListener('touchstart',e=>{const el=e.target.closest('#tl .trow');if(!el||e.target.closest('button')||e.touches.length>1)return;
 const g={s:e.touches[0].clientY,y0:e.touches[0].clientY,sx:e.touches[0].clientX,ox:0,off:0,on:false};
 const rm=()=>{clearTimeout(g.tm);el.removeEventListener('touchmove',mv);el.removeEventListener('touchend',fin);el.removeEventListener('touchcancel',fin)};
 const fin=async()=>{const was=g.on;rm();if(was){el.classList.remove('drag');el.style.transform='';await saveOrder([...document.querySelectorAll('#tl .trow')].map(c=>c.dataset.id))}};
 const mv=ev=>{const t=ev.touches[0],x=t.clientX,y=t.clientY;if(!g.on){if(Math.abs(y-g.y0)>8||Math.abs(x-g.sx)>8)rm();return}
  ev.preventDefault();if(y<110||y>innerHeight-140){const sy=scrollY;scrollBy(0,y<110?-10:10);g.s-=scrollY-sy}
  const T=()=>{el.style.transform=`translate(0px,${y-g.s+g.off}px)`};T();
  const L=[...document.querySelectorAll('#tl .trow')];let to=null;for(const c of L){if(c===el)continue;const q=c.getBoundingClientRect();if(x>q.left&&x<q.right&&y>q.top&&y<q.bottom){to=c;break}}
  if(to){const b=el.getBoundingClientRect();L.indexOf(to)>L.indexOf(el)?to.after(el):to.before(el);const a=el.getBoundingClientRect();g.off+=b.top-a.top;g.ox+=b.left-a.left;T()}};
 g.tm=setTimeout(()=>{g.on=true;el.classList.add('drag');navigator.vibrate&&navigator.vibrate(15)},380);
 el.addEventListener('touchmove',mv,{passive:false});el.addEventListener('touchend',fin);el.addEventListener('touchcancel',fin)},{passive:true});
const TABS=[['home','⌂','الرئيسية'],['cal','▦','التقويم'],['stats','◔','الإحصائيات'],['hist','☰','السجل']];
function R(){lastDay=realToday();$('#view').innerHTML={home,cal:calendar,stats,hist:history,set:settings}[tab]();$('#tabs').innerHTML=TABS.map(([k,i,l],j)=>(j===2?'<button class="addb" data-a="add" aria-label="مهمة جديدة">＋</button>':'')+`<button data-a="tab" data-k="${k}" class="${k===tab?'on':''}"><b>${i}</b>${l}</button>`).join('');if(tab==='set')offStatus()}
document.addEventListener('click',async e=>{const b=e.target.closest('[data-a]');if(!b)return;const a=b.dataset.a,id=b.dataset.id;
 if(a==='tab'){tab=b.dataset.k;scrollTo(0,0);R()}else if(a==='done'||a==='skip'){$('#sheet').hidden=true;act(id,a,b.closest('.trow'))}else if(a==='add')form();else if(a==='edit')form(id);else if(a==='close')$('#sheet').hidden=true;else if(a==='save')save();
 else if(a==='csel'){cal.sel=b.dataset.k;R()}else if(a==='cm'){cal.m+=+b.dataset.n;if(cal.m>11){cal.m=0;cal.y++}if(cal.m<0){cal.m=11;cal.y--}cal.sel=null;R()}
 else if(a==='sm'){stat={mode:b.dataset.k,off:0};R()}else if(a==='so'){stat.off+=+b.dataset.n;R()}else if(a==='hmore'){hLim+=60;R()}
 else if(a==='tog'){const t=tasks.find(x=>x.id===id);t.off=t.off?'':today();await put('tasks',t);await load();R()}
 else if(a==='del'){if(confirm('حذف هذه المهمة؟ سيبقى سجلها في التاريخ.')){await del('tasks',id);await load();R()}}
 else if(a==='tk'){const t=tasks.find(x=>x.id===id);if(!t)return;$('#sheet').hidden=false;$('#sheet').innerHTML=`<div><div class="t" style="font-size:19px;white-space:pre-wrap;color:${cc(t)}">${esc(t.title)}</div>${t.desc?`<p style="white-space:pre-wrap">${esc(t.desc)}</p>`:''}<div class="row"><button class="ok" data-a="done" data-id="${id}">✓ إنجاز</button><button class="sk" data-a="skip" data-id="${id}">تخطي</button></div><div class="row"><button data-a="edit" data-id="${id}" style="flex:1">تعديل</button><button data-a="close" style="flex:1">إغلاق</button></div></div>`}
 else if(a==='wd'){$('#sheet').hidden=false;$('#sheet').innerHTML='<div>'+dayList(parse(b.dataset.k))+'<div class="row"><button data-a="close" style="flex:1">إغلاق</button></div></div>'}
 else if(a==='dl'){show=show===b.dataset.k?null:b.dataset.k;R()}else if(a==='undo'){const r=recs.find(x=>x.id===id);if(r&&r.date===today()){await del('records',id);await load();R()}}else if(a==='up'||a==='dn')move(id,a==='up'?-1:1);
 else if(a==='nextday'){if(confirm('الانتقال لليوم التالي؟ لن تتمكن من تعديل مهام اليوم الحالي بعدها.')){st.cur=key(addD(parse(today()),1));await savePrefs();show=null;R()}}else if(a==='gotoreal'){if(confirm('الانتقال إلى اليوم الحالي؟ سيتم تخطي الأيام بينهما.')){st.cur=realToday();await savePrefs();show=null;R()}}
 else if(a==='export')exportData();else if(a==='import')$('#file').click();else if(a==='reset')reset()});
document.addEventListener('change',async e=>{const t=e.target;if(t.id==='f-freq')t.closest('[data-f]').dataset.f=t.value;
 else if(t.id==='file'&&t.files[0])importData(t.files[0]);
 else if(t.dataset.s){const k=t.dataset.s;st[k]=k==='showHijri'?t.value==='1':k==='theme'?t.value:+t.value;await savePrefs();applyTheme();R()}});
const tick=()=>{if(realToday()!==lastDay&&$('#sheet').hidden)R()};setInterval(tick,30000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick()});
(async()=>{db=await open();await load();applyTheme();R();navigator.storage&&navigator.storage.persist&&navigator.storage.persist();if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js')})();
