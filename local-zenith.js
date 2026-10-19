/* Local Zenith: location-aware calculations; astronomy is computed locally. */
const $=id=>document.getElementById(id);
const rad=d=>d*Math.PI/180;
const km=(a,b)=>{const p1=rad(a.latitude),p2=rad(b.latitude),dp=p2-p1,dl=rad(b.longitude-a.longitude);const h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));};
function sunTimes(date,lat,lon){
 const n=Math.floor((Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate())-Date.UTC(date.getUTCFullYear(),0,0))/86400000);
 const g=2*Math.PI/365*(n-1),eq=229.18*(.000075+.001868*Math.cos(g)-.032077*Math.sin(g)-.014615*Math.cos(2*g)-.040849*Math.sin(2*g));
 const dec=.006918-.399912*Math.cos(g)+.070257*Math.sin(g)-.006758*Math.cos(2*g)+.000907*Math.sin(2*g)-.002697*Math.cos(3*g)+.00148*Math.sin(3*g);
 const latr=rad(lat),zen=rad(90.833),cosH=Math.cos(zen)/(Math.cos(latr)*Math.cos(dec))-Math.tan(latr)*Math.tan(dec);
 if(cosH>1)return {rise:null,set:null,polar:'Полярная ночь / Солнце не восходит'};
 if(cosH< -1)return {rise:null,set:null,polar:'Полярный день / Солнце не заходит'};
 const ha=Math.acos(cosH)*180/Math.PI,noon=720-4*lon-eq,offset=-date.getTimezoneOffset();
 const fmt=m=>{const v=((Math.round(m)+offset)%1440+1440)%1440;return String(Math.floor(v/60)).padStart(2,'0')+':'+String(v%60).padStart(2,'0');};
 return {rise:fmt(noon-4*ha),set:fmt(noon+4*ha),polar:null};
}
function moonInfo(date){
 const syn=29.530588853,known=Date.UTC(2000,0,6,18,14),age=((date.getTime()-known)/86400000%syn+syn)%syn,phase=age/syn;
 const names=['Новолуние','Растущий серп','Первая четверть','Растущая Луна','Полнолуние','Убывающая Луна','Последняя четверть','Убывающий серп'];
 return {name:names[Math.round(phase*8)%8],illumination:Math.round((1-Math.cos(2*Math.PI*phase))/2*100),age:age.toFixed(1),next:Math.round((phase<.5?.5-phase:1-phase)*syn)};
}
export function initLocalZenith({state,fetchJson,text,$status}){
 const fmt=(n,d=1)=>Number.isFinite(Number(n))?Number(n).toFixed(d):'—';
 let loc=null,quakeCache=null,lastQuakeAt=0;
 function updateAstro(){
  if(!loc)return;const now=new Date(),times=sunTimes(now,loc.latitude,loc.longitude),moon=moonInfo(now);
  text('overheadSunset',times.set?'Закат '+times.set:times.polar);
  text('overheadSunrise',times.rise?'Рассвет: '+times.rise:'Время восхода недоступно');
  text('overheadMoonPhase',moon.name);
  text('overheadMoonDetail','Освещённость ~'+moon.illumination+'% · возраст '+moon.age+' дн. · до следующей фазы ~'+moon.next+' дн.');
  if(state.issPosition){const p=state.issPosition,d=km(loc,p);text('overheadIssDistance',Math.round(d).toLocaleString()+' км');text('overheadIssDetail','Подспутниковая точка '+fmt(p.latitude,2)+'°, '+fmt(p.longitude,2)+'° · высота '+fmt(p.altitude,0)+' км');}
  else{text('overheadIssDistance','Ожидание');text('overheadIssDetail','Координаты МКС появятся после обновления основного модуля');}
 }
 async function loadQuake(){
  if(!loc)return;text('overheadQuakeDetail','Запрос каталога USGS…');
  try{
   if(!quakeCache||Date.now()-lastQuakeAt>1800000){
    const end=new Date(),start=new Date(end.getTime()-365*86400000);
    const url='https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime='+start.toISOString().slice(0,10)+'&endtime='+end.toISOString().slice(0,10)+'&minmagnitude=4.5&orderby=time-asc&limit=2000';
    const data=await fetchJson(url);quakeCache=(data.features||[]).filter(f=>Array.isArray(f.geometry?.coordinates));lastQuakeAt=Date.now();
   }
   const nearest=quakeCache.map(f=>({f,d:km(loc,{latitude:f.geometry.coordinates[1],longitude:f.geometry.coordinates[0]})})).sort((a,b)=>a.d-b.d)[0];
   if(!nearest){text('overheadQuakeDistance','Нет записей');text('overheadQuakeDetail','USGS не вернул событий за год');return;}
   const p=nearest.f.properties||{};text('overheadQuakeDistance',Math.round(nearest.d).toLocaleString()+' км');
   text('overheadQuakeDetail','M '+fmt(p.mag,1)+' · '+(p.place||'место неизвестно')+' · '+(p.time?new Date(p.time).toLocaleDateString():'дата неизвестна'));
  }catch(e){text('overheadQuakeDistance','Недоступно');text('overheadQuakeDetail','USGS: '+String(e.message||e).slice(0,90));}
 }
 function setLocation(point,source){
  if(!point||!Number.isFinite(point.latitude)||!Number.isFinite(point.longitude))return;
  loc={latitude:point.latitude,longitude:point.longitude};text('localRadarLocation',source+': '+loc.latitude.toFixed(4)+'°, '+loc.longitude.toFixed(4)+'°');
  $status('localRadarStatus','ЛОКАЦИЯ ЗАДАНА','ok');updateAstro();loadQuake();
 }
 $('localRadarLocate')?.addEventListener('click',()=>{
  if(!navigator.geolocation){$status('localRadarStatus','ГЕОЛОКАЦИЯ НЕДОСТУПНА','error');return;}
  $status('localRadarStatus','ЗАПРОС РАЗРЕШЕНИЯ');
  navigator.geolocation.getCurrentPosition(p=>setLocation({latitude:p.coords.latitude,longitude:p.coords.longitude},'GPS браузера'),e=>$status('localRadarStatus',e.code===1?'ДОСТУП ЗАПРЕЩЁН':'НЕ УДАЛОСЬ ОПРЕДЕЛИТЬ','error'),{enableHighAccuracy:false,timeout:12000,maximumAge:300000});
 });
 $('localRadarUseMap')?.addEventListener('click',()=>{if(state.location)setLocation(state.location,'Выбранная точка карты');else $status('localRadarStatus','СНАЧАЛА ВЫБЕРИТЕ ТОЧКУ НА КАРТЕ','error');});
 setLocation(state.location||{latitude:48.89,longitude:8.70},'Стартовая точка Pforzheim');$status('localRadarStatus','ОЖИДАНИЕ GPS','');
 window.setInterval(updateAstro,60000);window.setInterval(()=>{if(loc)loadQuake();},1800000);
}
