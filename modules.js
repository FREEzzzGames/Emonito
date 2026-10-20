import { EmonitoApiManager } from './api.js?v=api-rewrite-2';

const GIBS='https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi';
const CABLES='https://www.submarinecablemap.com/api/v3/cable/cable-geo.json';
const AURORA='https://services.swpc.noaa.gov/json/ovation_aurora_latest.json';
const KP='https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json';
const $=id=>document.getElementById(id);
const txt=(id,v)=>{if($(id))$(id).textContent=v==null?'—':String(v);};
const status=(id,v,kind='')=>{if($(id)){$(id).textContent=v;$(id).className='status '+kind;}};
const info={
 maritime:'Кабели: владельцы, длина и ёмкость показываются только если они присутствуют в исходных данных. Без проверенного AIS-потока суда не отображаются.',
 satellite:'GOES наблюдает ограниченную область Земли. Исторические кадры зависят от доступности архива и временной метки.',
 radio:'PSKReporter и WebSDR открывают внешние источники. Спектрограмма ниже — визуальный индикатор интерфейса, а не live-измерение радиоэфира.',
 aurora:'NOAA OVATION оценивает вероятность сияния; Kp описывает геомагнитную активность. Эти показатели связаны, но не взаимозаменяемы.',
 night:'VIIRS измеряет ночную освещённость в условиях пролёта. Изменение яркости не подтверждает отключение электричества без дополнительных данных.'
};
function wms(L,name,extra={}){return L.tileLayer.wms(GIBS,{layers:name,format:'image/png',transparent:true,version:'1.1.1',attribution:'NASA GIBS / EOSDIS',...extra});}

export function initMonitoringModules({state}){
 const map=state.map,L=window.L;
 const ids={maritime:'maritimeStatus',satellite:'satelliteStatus',radio:'radioStatus',aurora:'auroraStatus',night:'nightStatus'};
 if(!map||!L){Object.values(ids).forEach(id=>status(id,'MAP UNAVAILABLE','error'));return;}
 const api=new EmonitoApiManager({requests:state.requests,timeout:16000,retries:2});
 const layers={
  cables:null,
  powerInfra:L.layerGroup(),
  goes:L.tileLayer.wms(GIBS,{layers:'GOES-East_ABI_GeoColor',format:'image/jpeg',transparent:false,version:'1.1.1',attribution:'NOAA / NASA GIBS',opacity:.84}),
  aurora:L.layerGroup(),
  night:wms(L,'VIIRS_SNPP_DayNightBand_ENCC',{opacity:.84})
 };
 Object.assign(state.layers,{cables:null,powerInfra:layers.powerInfra,goes:layers.goes,aurora:layers.aurora,night:layers.night});
 document.querySelectorAll('[data-info]').forEach(b=>{b.title=info[b.dataset.info]||'';b.addEventListener('click',()=>{const tip=$(b.dataset.info+'Tip');if(tip)tip.hidden=!tip.hidden;});});
 const busy=(name,on)=>document.querySelectorAll('[data-retry="'+name+'"]').forEach(b=>{b.disabled=on;b.textContent=on?'… Загрузка':'↻ Повторить';});
 document.querySelector('[data-layer-toggle="powerInfra"]')?.addEventListener('change',e=>{if(e.target.checked){if(map.getZoom()<7){map.flyTo(map.getCenter(),7,{duration:.5});}else loadPowerInfrastructure();layers.powerInfra.addTo(map);}else if(map.hasLayer(layers.powerInfra))map.removeLayer(layers.powerInfra);});
 document.querySelector('[data-layer-toggle="cables"]')?.addEventListener('change',e=>{if(e.target.checked){if(layers.cables)layers.cables.addTo(map);else loadCables();}else if(layers.cables&&map.hasLayer(layers.cables))map.removeLayer(layers.cables);});
 const cableMenu=document.querySelector('[data-layer-toggle="cables"]'),cableModule=$('cablesToggle');
 cableMenu?.addEventListener('change',e=>{if(cableModule)cableModule.checked=e.target.checked;});
 cableModule?.addEventListener('change',e=>{if(cableMenu)cableMenu.checked=e.target.checked;});
 let lastPowerBounds='';
 map.on('moveend',()=>{const t=document.querySelector('[data-layer-toggle="powerInfra"]');if(!t?.checked||map.getZoom()<7)return;const b=map.getBounds(),key=[b.getSouth(),b.getWest(),b.getNorth(),b.getEast()].map(n=>n.toFixed(3)).join(',');if(key!==lastPowerBounds){lastPowerBounds=key;loadPowerInfrastructure();}});


 async function loadPowerInfrastructure(){
  const checkbox=document.querySelector('[data-layer-toggle="powerInfra"]');
  if(!map||map.getZoom()<7){status('powerInfraStatus','МАСШТАБ 7+','error');return;}
  status('powerInfraStatus','ЗАПРОС OSM…');
  const b=map.getBounds(),bbox=[b.getSouth(),b.getWest(),b.getNorth(),b.getEast()].map(n=>n.toFixed(5)).join(',');
  const query='[out:json][timeout:20];(node["power"~"^(plant|substation|transformer|generator)$"]('+bbox+');way["power"~"^(plant|substation|line|cable)$"]('+bbox+'););out geom center tags;';
  try{
   const response=await fetch('https://overpass-api.de/api/interpreter?data='+encodeURIComponent(query),{headers:{Accept:'application/json'},signal:AbortSignal.timeout(22000),cache:'no-store'});
   if(!response.ok)throw new Error('Overpass HTTP '+response.status);
   const data=await response.json(),items=Array.isArray(data.elements)?data.elements:[];
   layers.powerInfra.clearLayers();
   items.forEach(item=>{
    const tags=item.tags||{},lat=item.lat??item.center?.lat,lon=item.lon??item.center?.lon,kind=tags.power||'power infrastructure';
    const name=tags.name||tags['name:en']||({'plant':'Электростанция','substation':'Подстанция','transformer':'Трансформатор','line':'Линия электропередачи','cable':'Энергетический кабель','generator':'Генератор'}[kind]||kind);
    const geometry=Array.isArray(item.geometry)?item.geometry.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)).map(p=>[p.lat,p.lon]):[];
    let layer;if(['line','cable'].includes(kind)&&geometry.length>1)layer=L.polyline(geometry,{color:kind==='cable'?'#ffb703':'#baff45',weight:2,opacity:.85});
    else if(Number.isFinite(lat)&&Number.isFinite(lon))layer=L.circleMarker([lat,lon],{radius:kind==='plant'?6:4,color:kind==='plant'?'#ffb703':'#baff45',fillColor:'#111b1d',fillOpacity:.9,weight:1.5});else return;
    const popup=document.createElement('div');popup.className='map-popup';const title=document.createElement('strong');title.textContent=name;popup.append(title);
    const detail=document.createElement('p');detail.textContent='Тип: '+kind+' · '+(tags.voltage?'Напряжение: '+tags.voltage+' V':'напряжение не указано');popup.append(detail);
    const link=document.createElement('a');link.href='https://www.openstreetmap.org/'+item.type+'/'+item.id;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Источник OpenStreetMap ↗';popup.append(link);layer.bindPopup(popup);layer.addTo(layers.powerInfra);
   });
   if(checkbox?.checked&&!map.hasLayer(layers.powerInfra))layers.powerInfra.addTo(map);
   status('powerInfraStatus','OSM · '+items.length+' ОБЪЕКТ.','ok');
  }catch(error){status('powerInfraStatus','НЕДОСТУПНО · ПОВТОРИТЕ','error');console.warn('[EMONITO power infrastructure]',error);}
 }
 async function loadCables(force=false){
  busy('maritime',true);status(ids.maritime,'ЗАГРУЗКА');
  try{
   const r=await api.request(CABLES,{cacheKey:'subsea-cable-geojson-v1',ttl:43200000,timeout:16000,retries:2,force});
   const geo=r.data;if(!Array.isArray(geo?.features))throw Error('Источник не вернул GeoJSON');
   if(layers.cables)map.removeLayer(layers.cables);
   layers.cables=L.geoJSON(geo,{
    style:()=>({color:'#56f0ff',weight:2.5,opacity:.95,className:'subsea-cable-line'}),
    pointToLayer:(_f,ll)=>L.circleMarker(ll,{radius:5,color:'#baff45',weight:1.5,fillColor:'#101c20',fillOpacity:1}),
    onEachFeature:(f,layer)=>{const p=f.properties||{},box=document.createElement('div');box.className='map-popup';
     const title=document.createElement('strong');title.textContent=p.name||p.cable_name||p.title||'Подводный кабель';box.append(title);
     [['Владелец',p.owners||p.owner],['Длина',p.length||p.length_km],['Пропускная способность',p.capacity||p.capacity_tbps]].forEach(([k,v])=>{const row=document.createElement('p');row.textContent=k+': '+(v??'нет данных в источнике');box.append(row);});layer.bindPopup(box);}
   });
   layers.cables.addTo(map);state.layers.cables=layers.cables;
   const lines=geo.features.filter(f=>['LineString','MultiLineString'].includes(f.geometry?.type)),points=geo.features.filter(f=>f.geometry?.type==='Point');
   txt('cableCount',lines.length);txt('portCount',points.length||'—');
   const list=$('maritimeList');list.replaceChildren();
   lines.slice(0,8).forEach(f=>{const p=f.properties||{},li=document.createElement('li');li.className='data-row';const left=document.createElement('div');left.className='row-main';const name=document.createElement('div');name.className='row-title';name.textContent=p.name||p.cable_name||p.title||'Подводный кабель';const detail=document.createElement('div');detail.className='row-detail';detail.textContent=[p.owners||p.owner||'Владелец неизвестен',p.length||p.length_km||'Длина неизвестна',p.capacity||p.capacity_tbps||'Ёмкость неизвестна'].join(' · ');left.append(name,detail);li.append(left);list.append(li);});
   if(!lines.length){const li=document.createElement('li');li.className='empty';li.textContent='В ответе нет линейных объектов кабелей.';list.append(li);}
   status(ids.maritime,r.stale?'АРХИВНЫЙ КЭШ':'ДАННЫЕ ИСТОЧНИКА',r.stale?'error':'ok');
   txt('maritimeMessage',r.stale?'API недоступен. Используется сохранённый векторный набор от '+new Date(r.savedAt).toLocaleString():'Маршруты загружены. Суда AIS не отображаются без проверенного потока данных.');
  }catch(e){
   const cached=(()=>{try{return JSON.parse(window.localStorage.getItem('emonito:api:v2:subsea-cable-geojson-v1')||'null');}catch{return null;}})();
   if(cached?.data?.features){if(layers.cables)map.removeLayer(layers.cables);layers.cables=L.geoJSON(cached.data,{style:()=>({color:'#56f0ff',weight:2.5,opacity:.95})});layers.cables.addTo(map);state.layers.cables=layers.cables;txt('cableCount',cached.data.features.length);status(ids.maritime,'АРХИВНЫЙ КЭШ','error');txt('maritimeMessage','API недоступен; показан сохранённый векторный слой от '+new Date(cached.savedAt).toLocaleString());}
   else{txt('cableCount','—');txt('portCount','—');status(ids.maritime,'НЕТ ДАННЫХ','error');txt('maritimeMessage','Каталог недоступен; кэш отсутствует. Непроверенные маршруты не подставляются. '+e.message);}
  }finally{busy('maritime',false);}
 }
 const slider=$('satelliteHours');
 function setGoesTime(hours){
  const target=new Date(Date.now()-Number(hours)*3600000),date=target.toISOString().slice(0,10);
  txt('satelliteTimeLabel','−'+hours+' ч · '+target.toISOString().slice(11,16)+'Z');
  if(map.hasLayer(layers.goes))map.removeLayer(layers.goes);
  layers.goes=wms(L,'GOES-East_ABI_GeoColor',{format:'image/jpeg',transparent:false,opacity:.84,time:date});
  state.layers.goes=layers.goes;
  layers.goes.on('tileload',()=>status(ids.satellite,'ТАЙЛЫ ЗАГРУЖЕНЫ','ok'));
  layers.goes.on('tileerror',()=>{status(ids.satellite,'ТАЙЛЫ НЕДОСТУПНЫ','error');txt('satelliteMessage','Тайлы GOES недоступны для этого временного среза. Метка архивного кадра не подтверждена.');});
  if($('goesToggle')?.checked)layers.goes.addTo(map);
  txt('satelliteMessage','Запрошенный срез: '+target.toLocaleString()+'. Доступность исторического кадра зависит от источника.');
 }
 slider?.addEventListener('input',()=>setGoesTime(slider.value));setGoesTime(slider?.value||3);status(ids.satellite,'ОЖИДАНИЕ ТАЙЛОВ');
 $('satellitePlay')?.addEventListener('click',e=>{const b=e.currentTarget,play=b.getAttribute('aria-pressed')!=='true';b.setAttribute('aria-pressed',String(play));b.textContent=play?'Ⅱ PAUSE':'▶ PLAY';clearInterval(b._timer);if(play)b._timer=setInterval(()=>{if(slider){slider.value=String((Number(slider.value)+1)%7);setGoesTime(slider.value);}},1800);});
 layers.goes.on('tileload',()=>status(ids.satellite,'ТАЙЛЫ ЗАГРУЖЕНЫ','ok'));layers.goes.on('tileerror',()=>status(ids.satellite,'ТАЙЛЫ НЕДОСТУПНЫ','error'));

 async function loadAurora(force=false){
  busy('aurora',true);status(ids.aurora,'ЗАГРУЗКА');
  try{
   const [a,k]=await Promise.all([api.request(AURORA,{cacheKey:'noaa-ovation-aurora-v1',ttl:600000,force,timeout:18000}),api.request(KP,{cacheKey:'noaa-kp-v1',ttl:300000,force})]);
   const points=a.data.coordinates;if(!Array.isArray(points)||!points.length)throw Error('NOAA OVATION не вернул координаты');
   layers.aurora.clearLayers();let count=0;
   points.forEach((p,i)=>{if(!Array.isArray(p)||p.length<3||i%2) return;const [lon,lat,prob]=p.map(Number);if(!Number.isFinite(lat)||!Number.isFinite(lon)||!Number.isFinite(prob)||prob<25)return;L.circleMarker([lat,lon],{radius:Math.max(2,Math.min(7,prob/12)),stroke:false,fillColor:prob>65?'#d28cff':'#68ffad',fillOpacity:Math.min(.82,.18+prob/110),className:'aurora-glow'}).bindTooltip('Вероятность сияния: '+prob+'%').addTo(layers.aurora);count++;});
   const rows=Array.isArray(k.data)?k.data.slice(1):[],last=rows.filter(r=>Array.isArray(r)&&Number.isFinite(Number(r[1]))).at(-1),kp=last?Number(last[1]):null;
   txt('auroraLevel',kp===null?'OVATION':'Kp '+kp.toFixed(1));let explanation='🟢 Тихо · сияние преимущественно на крайнем севере',cls='quiet';
   if(kp>=6){explanation='🔴 Сильный шторм · возможны помехи связи и яркое сияние';cls='storm';}
   else if(kp>=4){explanation='🟡 Повышенная активность · шанс сияния в умеренных широтах выше';cls='active';}
   if($('auroraBadge')){$('auroraBadge').textContent=explanation;$('auroraBadge').className='aurora-badge '+cls;}
   txt('auroraMessage','NOAA OVATION: '+count+' ячеек вероятности на карте. Время Kp: '+(last?.[0]||'не указано')+'.');
   status(ids.aurora,a.stale||k.stale?'АРХИВНЫЕ ДАННЫЕ':'NOAA · OVATION',a.stale||k.stale?'error':'ok');
  }catch(e){status(ids.aurora,'НЕТ ДАННЫХ','error');txt('auroraMessage','NOAA недоступен; слой не обновлён. '+e.message);}
  finally{busy('aurora',false);}
 }
 layers.aurora.on('add',()=>{});$('auroraToggle')?.addEventListener('change',e=>e.target.checked?layers.aurora.addTo(map):map.removeLayer(layers.aurora));

 $('nightToggle')?.addEventListener('change',e=>e.target.checked?layers.night.addTo(map):map.removeLayer(layers.night));
 layers.night.on('tileload',()=>status(ids.night,'VIIRS · DAILY','ok'));layers.night.on('tileerror',()=>{status(ids.night,'ТАЙЛЫ НЕДОСТУПНЫ','error');txt('nightMessage','NASA GIBS не вернул тайлы; сравнение не выполняется без изображений.');});
 document.querySelectorAll('[data-night-mode]').forEach(b=>b.addEventListener('click',()=>{const anomaly=b.dataset.nightMode==='anomaly';document.querySelectorAll('[data-night-mode]').forEach(x=>x.classList.toggle('active',x===b));layers.night.setOpacity(anomaly ? 0.48 : 0.84);txt('nightModeNote',anomaly?'Сравнение яркости не подтверждает blackout':'VIIRS наблюдения, не live-датчик отключений');status(ids.night,anomaly?'РЕЖИМ СРАВНЕНИЯ':'VIIRS · DAILY','ok');}));

 const canvas=$('radioWaterfall'),ctx=canvas?.getContext('2d');let frame=0,raf=0;
 function draw(){if(!canvas||!ctx||document.hidden)return;const w=Math.max(1,Math.floor(canvas.clientWidth*(window.devicePixelRatio||1))),h=Math.max(1,Math.floor(canvas.clientHeight*(devicePixelRatio||1)));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}ctx.drawImage(canvas,0,0,w,h);ctx.fillStyle='rgba(4,10,14,.16)';ctx.fillRect(0,0,w,h);for(let i=0;i<13;i++){const x=(i*73+frame*(i%3+1))%w,bh=3+(i*19+frame*3)%Math.max(4,h*.65);ctx.fillStyle=i%4===0?'rgba(186,255,69,.65)':'rgba(88,217,255,.45)';ctx.fillRect(x,h-bh,2+i%3,bh);}frame++;if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches)raf=window.requestAnimationFrame(draw);}
 if(canvas&&ctx)draw();document.addEventListener('visibilitychange',()=>{if(document.hidden)window.cancelAnimationFrame(raf);else if(!matchMedia('(prefers-reduced-motion: reduce)').matches)draw();});
 $('radioBand')?.addEventListener('change',e=>{const d={hf:'КВ-связь · 3–30 МГц. Дальняя связь часто использует ионосферу.',aviation:'Гражданская авиация · 118–137 МГц. Для прослушивания нужен приёмник и соблюдение местных правил.',vhf:'Любительский VHF · 144–146 МГц. Диапазон зависит от регионального плана частот.',uhf:'UHF · 430–440 МГц. Распределение зависит от страны.'};txt('radioMessage',d[e.target.value]||d.hf);});
 document.querySelectorAll('[data-retry]').forEach(b=>b.addEventListener('click',()=>{switch(b.dataset.retry){case'maritime':loadCables(true);break;case'aurora':loadAurora(true);break;case'satellite':setGoesTime(slider?.value||3);status(ids.satellite,'ПОВТОРНАЯ ЗАГРУЗКА');break;case'night':if(map.hasLayer(layers.night))map.removeLayer(layers.night);layers.night=wms(L,'VIIRS_SNPP_DayNightBand_ENCC',{opacity:.84});state.layers.night=layers.night;if($('nightToggle')?.checked)layers.night.addTo(map);status(ids.night,'ПОВТОРНАЯ ЗАГРУЗКА');break;case'radio':status(ids.radio,'REFERENCE MODE');txt('radioMessage','Live-сигнал не подключён. Откройте PSKReporter или WebSDR для реальных данных.');break;}}));
 $('cablesToggle')?.addEventListener('change',e=>{if(!layers.cables){if(e.target.checked)loadCables();return;}e.target.checked?layers.cables.addTo(map):map.removeLayer(layers.cables);});
 document.querySelectorAll('[data-module-layer]').forEach(input=>{const key=input.dataset.moduleLayer;if(key==='cables'||key==='aurora'||key==='night'||key==='goes')return;});
 const goestoggle=$('goesToggle');goestoggle?.addEventListener('change',e=>e.target.checked?layers.goes.addTo(map):map.removeLayer(layers.goes));
 loadCables();loadAurora();
}
