/* EMONITO — open-data monitoring dashboard. No secrets are embedded. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const state = { map:null, layers:{}, activeMarkers:{}, location:null, chart:null, lastUpdated:null, requests:new Map(), selectedCategory:'all', issHistory:[] };
  const SOURCES = {
    usgs:'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson',
    eonet:'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=100',
    iss:'https://api.wheretheiss.at/v1/satellites/25544',
    weather:'https://api.open-meteo.com/v1/forecast',
    air:'https://air-quality-api.open-meteo.com/v1/air-quality',
    swpc:'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json',
    solar:'https://services.swpc.noaa.gov/json/solar-cycle/observed-solar-cycle-indices.json',
    neo:'https://api.nasa.gov/neo/rest/v1/feed?api_key=DEMO_KEY',
    openSky:'https://opensky-network.org/api/states/all',
    energy:'https://ourworldindata.org/grapher/electricity-prod-source-stacked.csv'
  };
  const $status = (id, text, mode='') => { const el=$(id); if(!el)return; el.textContent=text; el.className='status '+mode; };
  const text = (id, value) => { if($(id)) $(id).textContent = value == null ? '—' : String(value); };
  const fmt = (n,d=1) => Number.isFinite(Number(n)) ? Number(n).toFixed(d) : '—';
  const dateTime = value => value ? new Date(value).toLocaleString() : 'Time unavailable';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  async function fetchJson(url, timeout=14000) {
    const previous=state.requests.get(url); if(previous) previous.abort();
    const controller=new AbortController(); state.requests.set(url,controller);
    const timer=setTimeout(()=>controller.abort(),timeout);
    try { const response=await fetch(url,{signal:controller.signal,headers:{Accept:'application/json'}}); if(!response.ok) throw new Error('HTTP '+response.status); return await response.json(); }
    finally { clearTimeout(timer); if(state.requests.get(url)===controller)state.requests.delete(url); }
  }
  function setList(id, items, empty='No data available') {
    const el=$(id); if(!el)return; el.replaceChildren();
    if(!items.length){const li=document.createElement('li');li.className='empty';li.textContent=empty;el.append(li);return;}
    items.forEach(item=>el.append(item));
  }
  function makeRow(title, detail, value='', href='') {
    const li=document.createElement('li');li.className='data-row';
    const left=document.createElement('div');left.className='row-main';
    const heading=document.createElement(href?'a':'div');heading.className='row-title';heading.textContent=title;
    if(href){heading.href=href;heading.target='_blank';heading.rel='noopener noreferrer';}
    const sub=document.createElement('div');sub.className='row-detail';sub.textContent=detail;
    left.append(heading,sub);li.append(left);
    if(value){const right=document.createElement('div');right.className='row-value';right.textContent=value;li.append(right);}
    return li;
  }
  function initMap(){
    if(!window.L){$status('mapStatus','MAP LIBRARY FAILED','error');return;}
    const map=L.map('map',{worldCopyJump:true,preferCanvas:true,zoomControl:false,minZoom:2}).setView([20,0],2);
    L.control.zoom({position:'bottomright'}).addTo(map);
    const base=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);
    const satellite=L.tileLayer.wms('https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi',{layers:'MODIS_Terra_CorrectedReflectance_TrueColor',format:'image/jpeg',transparent:false,version:'1.1.1',time:new Date(Date.now()-86400000).toISOString().slice(0,10),attribution:'NASA GIBS / EOSDIS',tileSize:256});
    const clouds=L.tileLayer.wms('https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi',{layers:'MODIS_Terra_Cloud_Top_Temp_Day',format:'image/png',transparent:true,version:'1.1.1',attribution:'NASA GIBS'});
    base.on('tileload',()=>{$status('mapStatus','STREET MAP OK','ok');});base.on('tileerror',()=>{$status('mapStatus','TILE ERROR · CHECK NETWORK','error');});satellite.on('tileload',()=>{$status('mapStatus','NASA IMAGERY LOADED','ok');});satellite.on('tileerror',()=>{$status('mapStatus','NASA IMAGERY UNAVAILABLE','error');});clouds.on('tileerror',()=>{$status('mapStatus','CLOUD LAYER UNAVAILABLE','error');});state.map=map;state.layers={base,satellite,clouds,quakes:L.layerGroup().addTo(map),events:L.layerGroup().addTo(map),iss:L.layerGroup().addTo(map),issTrail:L.layerGroup().addTo(map),air:L.layerGroup(),transport:L.layerGroup(),aircraft:L.layerGroup(),energy:L.layerGroup()};
    L.control.layers({'Street map':base,'NASA satellite imagery':satellite},{'Cloud-top temperature':clouds,'Earthquakes':state.layers.quakes,'Natural events':state.layers.events,'ISS position':state.layers.iss,'ISS sampled trail':state.layers.issTrail,'Transport data':state.layers.transport,'Aircraft (OpenSky)':state.layers.aircraft,'Energy infrastructure':state.layers.energy},{collapsed:true,position:'topright'}).addTo(map);
    map.on('click',e=>{state.location={latitude:e.latlng.lat,longitude:e.latlng.lng};text('selectedCoords',fmt(e.latlng.lat,3)+'°, '+fmt(e.latlng.lng,3)+'°');loadWeather();loadAir();loadMarine();loadHistory();});
    $('mapLocate').addEventListener('click',()=>locateUser());
    $('mapReset').addEventListener('click',()=>map.setView([20,0],2));
    $status('mapStatus','MAP READY','ok');
  }
  function popupLink(title,detail,href){return '<strong>'+esc(title)+'</strong><br>'+esc(detail)+(href?'<br><a href="'+esc(href)+'" target="_blank" rel="noopener noreferrer">Open source ↗</a>':'');}
  async function loadQuakes(){
    $status('quakeStatus','LOADING');
    try{const d=await fetchJson(SOURCES.usgs);const features=d.features||[];text('quakeCount',features.length);
      const sorted=[...features].sort((a,b)=>(b.properties?.mag||0)-(a.properties?.mag||0));
      setList('quakeList',sorted.slice(0,8).map(f=>{const p=f.properties||{},c=f.geometry?.coordinates||[];return makeRow(p.place||'Unknown location','Depth '+fmt(c[2],1)+' km · '+dateTime(p.time),'M '+fmt(p.mag,1),p.url)}),'No earthquakes reported in this period.');
      const group=state.layers.quakes;if(group){group.clearLayers();features.forEach(f=>{const p=f.properties||{},c=f.geometry?.coordinates||[];if(!state.map||c.length<2)return;const m=L.circleMarker([c[1],c[0]],{radius:Math.max(4,Math.min(13,3+(Number(p.mag)||0)*1.4)),color:(p.mag||0)>=5?'#ff5f5f':'#e6d34b',weight:1,fillOpacity:.55});m.bindPopup(popupLink('Magnitude '+fmt(p.mag,1),p.place+' · depth '+fmt(c[2],1)+' km',p.url));m.addTo(group);});}
      text('quakePeak','M '+fmt(sorted[0]?.properties?.mag,1));$status('quakeStatus','LIVE · '+new Date().toLocaleTimeString(),'ok');
    }catch(e){$status('quakeStatus','UNAVAILABLE','error');setList('quakeList',[],'USGS unavailable: '+e.message);text('quakeCount','—');}
  }
  async function loadEvents(){
    $status('eventStatus','LOADING');
    try{const d=await fetchJson(SOURCES.eonet);const events=d.events||[];text('eventCount',events.length);
      setList('eventList',events.slice(0,8).map(e=>{const g=e.geometry?.[e.geometry.length-1];const coords=g?.coordinates;const loc=Array.isArray(coords)?coords.slice(0,2).map(v=>fmt(v,2)).join(', '):'Location not supplied';return makeRow(e.title||'Natural event',(e.categories||[]).map(c=>c.title).join(', ')+' · '+loc,g?.date?dateTime(g.date):'Date unavailable',e.sources?.[0]?.url||e.link)}),'No open events returned by NASA EONET.');
      const group=state.layers.events;if(group){group.clearLayers();events.forEach(e=>{const g=e.geometry?.[e.geometry.length-1],c=g?.coordinates;if(!Array.isArray(c)||c.length<2||!Number.isFinite(c[0])||!Number.isFinite(c[1]))return;const marker=L.circleMarker([c[1],c[0]],{radius:6,color:'#ff9b47',fillColor:'#ff9b47',fillOpacity:.75,weight:1});marker.bindPopup(popupLink(e.title,(e.categories||[]).map(x=>x.title).join(', ')+' · '+(g.date||''),e.sources?.[0]?.url||e.link));marker.addTo(group);});}
      $status('eventStatus','LIVE · '+new Date().toLocaleTimeString(),'ok');
    }catch(e){text('eventCount','—');$status('eventStatus','UNAVAILABLE','error');setList('eventList',[],'NASA EONET unavailable: '+e.message);}
  }
  async function loadISS(){
    $status('issStatus','LOADING');
    try{const d=await fetchJson(SOURCES.iss);if(!Number.isFinite(Number(d.latitude))||!Number.isFinite(Number(d.longitude)))throw new Error('Invalid coordinates');
      text('issLat',fmt(d.latitude,2)+'°');text('issLon',fmt(d.longitude,2)+'°');text('issAlt',fmt(d.altitude,1)+' km');text('issSpeed',fmt(d.velocity,0)+' km/h');
      setList('issList',[makeRow('ISS / NORAD 25544','Lat '+fmt(d.latitude,4)+'° · Lon '+fmt(d.longitude,4)+'°','ALT '+fmt(d.altitude,1)+' km','https://wheretheiss.at/'),makeRow('Orbital velocity','Reported by WhereTheISS.at',fmt(d.velocity,0)+' km/h'),makeRow('Measurement timestamp',dateTime(Number(d.timestamp)*1000),'UTC')]);
      const group=state.layers.iss;if(group&&state.map){group.clearLayers();const icon=L.divIcon({className:'iss-icon',html:'ISS',iconSize:[34,20],iconAnchor:[17,10]});L.marker([d.latitude,d.longitude],{icon}).bindPopup(popupLink('International Space Station','Altitude '+fmt(d.altitude,1)+' km · velocity '+fmt(d.velocity,0)+' km/h','https://wheretheiss.at/')).addTo(group);state.issHistory.push([Number(d.latitude),Number(d.longitude)]);if(state.issHistory.length>180)state.issHistory.shift();const trail=state.layers.issTrail;if(trail){trail.clearLayers();if(state.issHistory.length>1)L.polyline(state.issHistory,{color:'#d9ff45',weight:2,opacity:.7}).addTo(trail);}}
      $status('issStatus','LIVE · '+new Date().toLocaleTimeString(),'ok');
    }catch(e){['issLat','issLon','issAlt','issSpeed'].forEach(id=>text(id,'—'));$status('issStatus','UNAVAILABLE','error');setList('issList',[],'ISS provider unavailable: '+e.message);}
  }
  async function loadWeather(){
    const loc=state.location||{latitude:48.89,longitude:8.70};$status('weatherStatus','LOADING');
    const url=SOURCES.weather+'?latitude='+loc.latitude+'&longitude='+loc.longitude+'&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m,wind_direction_10m,surface_pressure&hourly=temperature_2m,precipitation,wind_speed_10m&past_days=7&forecast_days=3&timezone=auto';
    try{const d=await fetchJson(url);const c=d.current;if(!c)throw new Error('No current conditions');text('weatherTemp',fmt(c.temperature_2m,1)+'°C');text('weatherFeels',fmt(c.apparent_temperature,1)+'°C feels like');text('weatherWind',fmt(c.wind_speed_10m,1)+' km/h');text('weatherPressure',fmt(c.surface_pressure,0)+' hPa');text('weatherHumidity',fmt(c.relative_humidity_2m,0)+'%');text('weatherRain',fmt(c.precipitation,1)+' mm');text('weatherUpdated',dateTime(c.time));text('selectedCoords',fmt(loc.latitude,3)+'°, '+fmt(loc.longitude,3)+'°');drawHistory(d.hourly);$status('weatherStatus','LIVE · '+new Date().toLocaleTimeString(),'ok');}
    catch(e){$status('weatherStatus','UNAVAILABLE','error');['weatherTemp','weatherFeels','weatherWind','weatherPressure','weatherHumidity','weatherRain'].forEach(id=>text(id,'—'));text('weatherUpdated','Source unavailable: '+e.message);}
  }
  async function loadAir(){
    const loc=state.location||{latitude:48.89,longitude:8.70};$status('airStatus','LOADING');
    try{const d=await fetchJson(SOURCES.air+'?latitude='+loc.latitude+'&longitude='+loc.longitude+'&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,ozone,european_aqi&timezone=auto');const c=d.current||{};text('airAQI',c.european_aqi??'—');text('airPM25',fmt(c.pm2_5,1)+' µg/m³');text('airPM10',fmt(c.pm10,1)+' µg/m³');text('airNO2',fmt(c.nitrogen_dioxide,1)+' µg/m³');text('airUpdated',dateTime(c.time));$status('airStatus','MODELLED / LIVE','ok');}
    catch(e){$status('airStatus','UNAVAILABLE','error');['airAQI','airPM25','airPM10','airNO2'].forEach(id=>text(id,'—'));text('airUpdated','Air-quality API unavailable: '+e.message);}
  }
  async function loadSpaceWeather(){
    $status('spaceStatus','LOADING');
    try{const d=await fetchJson(SOURCES.swpc);const rows=Array.isArray(d)?d:[];const values=rows.slice(1).map(r=>({time:r[0],kp:Number(r[1])})).filter(r=>Number.isFinite(r.kp));const last=values[values.length-1];text('kpValue',last?fmt(last.kp,1):'—');text('kpTime',last?last.time:'No recent index');setList('solarList',values.slice(-8).reverse().map(v=>makeRow('Planetary K-index',v.time,'Kp '+fmt(v.kp,1))),'NOAA returned no K-index data.');$status('spaceStatus','LIVE · NOAA SWPC','ok');}
    catch(e){$status('spaceStatus','UNAVAILABLE','error');text('kpValue','—');setList('solarList',[],'NOAA SWPC unavailable: '+e.message);}
    try{const d=await fetchJson(SOURCES.solar);const rows=Array.isArray(d)?d:[];const last=rows[rows.length-1];if(last){text('solarNumber',last['ssn']??last['sunspot number']??last['sunspot_number']??'—');text('solarDate',last['time-tag']||last.time_tag||last['Year']||'Solar cycle observation');}}catch(e){text('solarNumber','—');text('solarDate','Solar cycle feed unavailable');}
  }
  async function loadNEO(){
    $status('neoStatus','LOADING');
    const start=new Date().toISOString().slice(0,10),end=new Date(Date.now()+86400000).toISOString().slice(0,10);
    try{const d=await fetchJson('https://api.nasa.gov/neo/rest/v1/feed?start_date='+start+'&end_date='+end+'&api_key=DEMO_KEY');const list=Object.values(d.near_earth_objects||{}).flat();text('neoCount',list.length);const sorted=list.sort((a,b)=>(a.close_approach_data?.[0]?.miss_distance?.kilometers||Infinity)-(b.close_approach_data?.[0]?.miss_distance?.kilometers||Infinity));setList('neoList',sorted.slice(0,6).map(n=>{const a=n.close_approach_data?.[0]||{};return makeRow(n.name,'Closest approach '+(a.close_approach_date_full||a.close_approach_date||'unknown')+' · '+(n.is_potentially_hazardous_asteroid?'potentially hazardous':'no NASA hazard flag'),a.miss_distance?.kilometers?fmt(Number(a.miss_distance.kilometers)/1000000,3)+' million km':'—',n.nasa_jpl_url)}),'No NEO records returned.');$status('neoStatus','LIVE · NASA DEMO KEY','ok');}
    catch(e){text('neoCount','—');$status('neoStatus','LIMITED / UNAVAILABLE','error');setList('neoList',[],'NASA NEO API unavailable or DEMO_KEY rate-limited. No substitute values shown.');}
  }
  async function loadTransport(){
    $status('transportStatus','LOADING');
    if(!state.map||state.map.getZoom()<5){text('transportCount','Zoom in');$status('transportStatus','ZOOM TO LEVEL 5+');setList('transportList',[],'Zoom in to a regional view before querying OpenStreetMap. This avoids sending global queries to public Overpass servers.');return;}
    try{const bounds=state.map?state.map.getBounds():L.latLngBounds([35,-10],[60,30]);const s=bounds.getSouth(),w=bounds.getWest(),n=bounds.getNorth(),e=bounds.getEast();const query='[out:json][timeout:12];(node["aeroway"="aerodrome"]('+s+','+w+','+n+','+e+');way["aeroway"="aerodrome"]('+s+','+w+','+n+','+e+');node["railway"="station"]('+s+','+w+','+n+','+e+'););out center tags 80;';
      const d=await fetchJson('https://overpass-api.de/api/interpreter?data='+encodeURIComponent(query),18000);const els=d.elements||[];const group=state.layers.transport;if(group){group.clearLayers();els.forEach(o=>{const lat=o.lat??o.center?.lat,lon=o.lon??o.center?.lon;if(!Number.isFinite(lat)||!Number.isFinite(lon))return;const name=o.tags?.name||o.tags?.['name:en']||o.tags?.aeroway||'Transport feature';L.circleMarker([lat,lon],{radius:4,color:'#60d9ff',fillColor:'#60d9ff',fillOpacity:.7,weight:1}).bindPopup(popupLink(name,o.tags?.railway||o.tags?.aeroway||'OpenStreetMap feature','https://www.openstreetmap.org/'+o.type+'/'+o.id)).addTo(group);});}
      text('transportCount',els.length);setList('transportList',els.slice(0,8).map(o=>makeRow(o.tags?.name||o.tags?.['name:en']||'Unnamed transport feature',o.tags?.railway||o.tags?.aeroway||o.type,'OSM', 'https://www.openstreetmap.org/'+o.type+'/'+o.id)),'No transport features in the current map view.');$status('transportStatus','LIVE · OPENSTREETMAP','ok');
    }catch(e){text('transportCount','—');$status('transportStatus','UNAVAILABLE / RATE LIMITED','error');setList('transportList',[],'Overpass unavailable or rate-limited. Base map remains available.');}
  }
  async function loadMarine(){
    $status('marineStatus','LOADING');
    const loc=state.location||{latitude:20,longitude:0};
    try{const url='https://marine-api.open-meteo.com/v1/marine?latitude='+loc.latitude+'&longitude='+loc.longitude+'&current=wave_height,wave_direction,wave_period&daily=wave_height_max&forecast_days=3&timezone=auto';const d=await fetchJson(url);const c=d.current||{};text('waveHeight',Number.isFinite(Number(c.wave_height))?fmt(c.wave_height,2)+' m':'—');text('waveDirection',Number.isFinite(Number(c.wave_direction))?fmt(c.wave_direction,0)+'°':'—');text('wavePeriod',Number.isFinite(Number(c.wave_period))?fmt(c.wave_period,1)+' s':'—');const dates=d.daily?.time||[],max=d.daily?.wave_height_max||[];setList('marineList',dates.map((day,i)=>makeRow('Wave forecast',day,Number.isFinite(Number(max[i]))?fmt(max[i],2)+' m max':'—')),'Marine model returned no forecast.');$status('marineStatus','MODEL DATA · OPEN-METEO','ok');}
    catch(e){['waveHeight','waveDirection','wavePeriod'].forEach(id=>text(id,'—'));setList('marineList',[],'Marine API unavailable at this location. Ocean variables may be unavailable over land.');$status('marineStatus','UNAVAILABLE','error');}
  }
  async function loadAircraft(){
    $status('aircraftStatus','LOADING');
    if(!state.map||state.map.getZoom()<5){text('aircraftCount','Zoom in');$status('aircraftStatus','ZOOM TO LEVEL 5+');setList('aircraftList',[],'Zoom to a regional view, then query transport. OpenSky has coverage and access limitations.');return;}
    try{const b=state.map.getBounds();const url=SOURCES.openSky+'?lamin='+Math.max(-85,b.getSouth())+'&lomin='+Math.max(-180,b.getWest())+'&lamax='+Math.min(85,b.getNorth())+'&lomax='+Math.min(180,b.getEast());const d=await fetchJson(url,16000);const states=d.states||[];text('aircraftCount',states.length);const group=state.layers.aircraft;if(group){group.clearLayers();states.forEach(a=>{const lon=a[5],lat=a[6];if(!Number.isFinite(lat)||!Number.isFinite(lon)||a[8])return;const label=String(a[1]||a[0]||'Aircraft').trim();L.circleMarker([lat,lon],{radius:3,color:'#d9ff45',fillColor:'#d9ff45',fillOpacity:.85,weight:1}).bindPopup(popupLink(label,'Altitude '+(Number.isFinite(a[7])?fmt(a[7]/1000,1)+' km':'—')+' · speed '+(Number.isFinite(a[9])?fmt(a[9],0)+' m/s':'—'),'https://opensky-network.org/')).addTo(group);});}setList('aircraftList',states.slice(0,8).map(a=>makeRow(String(a[1]||a[0]||'Aircraft').trim(),(a[2]||'Origin unavailable')+' · '+(Number.isFinite(a[6])?fmt(a[6],2)+', '+fmt(a[5],2):'Position unavailable'),Number.isFinite(a[7])?fmt(a[7]/1000,1)+' km':'—','https://opensky-network.org/')),'No aircraft states returned for this view.');$status('aircraftStatus','LIVE · OPENSKY','ok');}
    catch(e){text('aircraftCount','—');$status('aircraftStatus','UNAVAILABLE / RESTRICTED','error');setList('aircraftList',[],'OpenSky API is unavailable, CORS-blocked, or requires authenticated access.');}
  }
  async function loadEnergy(){
    $status('energyStatus','LOADING');
    try{const d=await fetch('https://ourworldindata.org/grapher/electricity-prod-source-stacked.csv?tab=chart&time=latest&csvType=full&useColumnShortNames=true');if(!d.ok)throw new Error('HTTP '+d.status);const csv=await d.text();const lines=csv.trim().split(/\r?\n/);const header=lines[0].split(',');const countryIndex=header.indexOf('Entity');const yearIndex=header.indexOf('Year');const rows=lines.slice(1).filter(line=>line.split(',')[countryIndex]==='Germany').slice(-5);setList('energyList',rows.map(line=>{const cells=line.split(',');return makeRow('Germany electricity production', 'Year '+(cells[yearIndex]||'—')+' · Our World in Data',cells.slice(2).filter(v=>v&&v!=='').slice(0,3).join(' / '))}),'Historical electricity dataset returned no rows.');text('energyCount','Historical');$status('energyStatus','HISTORICAL · OWID','ok');}
    catch(e){text('energyCount','—');$status('energyStatus','UNAVAILABLE','error');setList('energyList',[],'Energy dataset unavailable. ENTSO-E near-real-time data needs a registered API token.');}
  }
  async function loadHistory(){
    const loc=state.location||{latitude:48.89,longitude:8.70};$status('historyStatus','LOADING');
    try{const url='https://archive-api.open-meteo.com/v1/archive?latitude='+loc.latitude+'&longitude='+loc.longitude+'&start_date='+new Date(Date.now()-29*86400000).toISOString().slice(0,10)+'&end_date='+new Date(Date.now()-86400000).toISOString().slice(0,10)+'&daily=temperature_2m_mean,precipitation_sum,wind_speed_10m_max&timezone=auto';const d=await fetchJson(url,18000);const days=d.daily?.time||[];if(!days.length)throw new Error('No history returned');drawHistoricalChart(days,d.daily.temperature_2m_mean||[],d.daily.precipitation_sum||[]);text('historySummary',days.length+' daily observations · '+days[0]+' to '+days[days.length-1]);$status('historyStatus','ARCHIVE API · '+days.length+' DAYS','ok');}
    catch(e){$status('historyStatus','UNAVAILABLE','error');text('historySummary','Historical API unavailable: '+e.message);}
  }
  function drawHistory(hourly){
    if(!hourly||!window.Chart)return;const ctx=$('forecastChart');if(!ctx)return;
    if(state.chart)state.chart.destroy();state.chart=new Chart(ctx,{type:'line',data:{labels:(hourly.time||[]).slice(0,72).map(t=>t.slice(5,16)),datasets:[{label:'Temperature °C',data:(hourly.temperature_2m||[]).slice(0,72),borderColor:'#d9ff45',backgroundColor:'rgba(217,255,69,.08)',pointRadius:0,borderWidth:2,tension:.25},{label:'Wind km/h',data:(hourly.wind_speed_10m||[]).slice(0,72),borderColor:'#60d9ff',pointRadius:0,borderWidth:1,tension:.25}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{labels:{color:'#b8c0c4',boxWidth:10,font:{family:'monospace',size:10}}}},scales:{x:{ticks:{color:'#858d92',maxTicksLimit:7},grid:{color:'#22272a'}},y:{ticks:{color:'#858d92'},grid:{color:'#22272a'}}}}});
  }
  function drawHistoricalChart(labels,temps,rain){
    if(!window.Chart)return;const ctx=$('historyChart');if(!ctx)return;if(state.historyChart)state.historyChart.destroy();state.historyChart=new Chart(ctx,{type:'line',data:{labels,datasets:[{label:'Daily mean temperature °C',data:temps,borderColor:'#d9ff45',pointRadius:1,tension:.2,yAxisID:'y'},{label:'Precipitation mm',data:rain,borderColor:'#60d9ff',pointRadius:1,tension:.2,yAxisID:'y1'}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{labels:{color:'#b8c0c4',boxWidth:10,font:{family:'monospace',size:10}}}},scales:{x:{ticks:{color:'#858d92',maxTicksLimit:8},grid:{color:'#22272a'}},y:{position:'left',ticks:{color:'#d9ff45'},grid:{color:'#22272a'}},y1:{position:'right',ticks:{color:'#60d9ff'},grid:{drawOnChartArea:false}}}}});}
  function locateUser(){if(!navigator.geolocation){text('weatherUpdated','Geolocation not supported');return;}text('weatherUpdated','Requesting location permission…');navigator.geolocation.getCurrentPosition(p=>{state.location={latitude:p.coords.latitude,longitude:p.coords.longitude};state.map?.setView([p.coords.latitude,p.coords.longitude],7);loadWeather();loadAir();loadMarine();loadHistory();},e=>text('weatherUpdated',e.code===1?'Location permission denied':'Could not determine location'),{enableHighAccuracy:false,timeout:10000,maximumAge:300000});}
  function setClock(){text('clock','UTC '+new Date().toISOString().slice(11,19));}
  function setupControls(){
    $('refreshAll')?.addEventListener('click',refreshAll);
    $('weatherLocate')?.addEventListener('click',locateUser);
    const categoryGroups={earth:new Set(['earth','geology','disasters','ecology','oceans']),weather:new Set(['weather','ecology','history']),space:new Set(['space']),transport:new Set(['transport']),energy:new Set(['energy'])};
    function applyCategory(category){
      const allowed=categoryGroups[category];
      document.querySelectorAll('[data-category]').forEach(b=>b.classList.toggle('active',b.dataset.category===category));
      document.querySelectorAll('[data-module]').forEach(el=>{
        if(el.classList.contains('map-panel')){el.hidden=false;return;}
        if(el.classList.contains('mobile-map-summary')){el.hidden=false;return;}
        el.hidden=category!=='all'&&!(allowed?.has(el.dataset.module)||el.dataset.module===category);
      });
      const mobileNav=document.getElementById('mobileNav');
      mobileNav?.querySelectorAll('[data-nav-section]').forEach(b=>{
        const active=b.dataset.navSection===category;
        b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));
      });
      state.selectedCategory=category;
      if(state.map)setTimeout(()=>state.map.invalidateSize({pan:false}),80);
    }
    document.querySelectorAll('[data-category]').forEach(btn=>btn.addEventListener('click',()=>applyCategory(btn.dataset.category)));
    $('imageryMode')?.addEventListener('change',e=>{if(!state.map)return;state.map.removeLayer(state.layers.satellite);state.map.removeLayer(state.layers.clouds);if(e.target.value==='satellite')state.layers.satellite.addTo(state.map);if(e.target.value==='clouds')state.layers.clouds.addTo(state.map);});
    $('mapRefreshTransport')?.addEventListener('click',()=>{loadTransport();loadAircraft();});
  }
  async function refreshAll(){text('lastRefresh','Updating…');await Promise.allSettled([loadQuakes(),loadEvents(),loadISS(),loadWeather(),loadAir(),loadMarine(),loadSpaceWeather(),loadNEO(),loadTransport(),loadAircraft(),loadEnergy(),loadHistory()]);state.lastUpdated=new Date();text('lastRefresh','Updated '+state.lastUpdated.toLocaleTimeString());}

  function setupMobileNavigation(){
    if(!window.matchMedia('(max-width: 760px)').matches)return;
    const grid=document.querySelector('.grid'), mapPanel=document.querySelector('.map-panel'), intro=document.querySelector('.intro');
    if(!grid||!mapPanel||document.getElementById('mobileNav'))return;

    // Put the existing category filters directly under the app header.
    const toolbar=intro?.querySelector('.toolbar');
    if(toolbar){
      toolbar.classList.add('mobile-category-tabs');
      document.querySelector('.top')?.insertAdjacentElement('afterend',toolbar);
    }

    // Flatten metric tiles so every module follows one readable column.
    const side=grid.querySelector('.side');
    if(side){[...side.children].forEach(card=>grid.insertBefore(card,side));side.remove();}

    // Map is the primary workspace; location actions become a readable summary card below it.
    const mapNote=mapPanel.querySelector('.map-note');
    const summary=document.createElement('section');
    summary.className='mobile-map-summary panel';
    summary.innerHTML='<div class="summary-coordinate" id="mobileSelectedCoords">GLOBAL VIEW</div><div class="summary-hint">Нажмите на карту, чтобы посмотреть данные в выбранной точке</div><div class="summary-actions"><button id="mobileLocate" type="button">◎ МОЯ ГЕОЛОКАЦИЯ</button><button id="mobileReset" type="button">↺ СБРОС</button></div>';
    mapPanel.insertAdjacentElement('afterend',summary);
    if(mapNote){mapNote.style.display='none';}

    // The same existing module elements are used; only their mobile presentation changes.
    const cards=[...grid.children].filter(el=>el!==mapPanel&&el!==summary);
    const titles={
      quakeCount:'Землетрясения за 24 часа',eventCount:'Природные события',kpValue:'Космическая погода',
      issLat:'Положение МКС',weatherTemp:'Погода и прогноз',airAQI:'Качество воздуха',
      quakeList:'Землетрясения',eventList:'Природные катастрофы',solarList:'Солнечная активность',
      issList:'Телеметрия МКС',neoList:'Околоземные объекты',transportList:'Транспортная инфраструктура',
      marineList:'Океаны и вода',energyList:'Энергетика',historyChart:'Историческая аналитика'
    };
    const titleFor=el=>{
      const label=el.querySelector('.head .title')?.textContent?.replace(/^\s*\d+\s*\/\s*/,'').trim();
      if(label)return label;
      const id=el.querySelector('[id]')?.id;
      return titles[id]||el.querySelector('.label')?.textContent?.replace(/^\s*\d+\s*\/\s*/,'').trim()||'Данные мониторинга';
    };
    cards.forEach((card,index)=>{
      card.classList.add('mobile-accordion');
      const head=card.querySelector(':scope > .head');
      let title=titleFor(card);
      if(card.classList.contains('metric'))title=titleFor(card);
      if(head){
        const titleNode=head.querySelector('.title');
        if(titleNode)titleNode.textContent=title;
        head.classList.add('mobile-accordion-head');
        head.setAttribute('role','button');head.setAttribute('tabindex','0');head.setAttribute('aria-expanded','false');
        const status=head.querySelector('.status');
        if(status)status.classList.add('status-badge');
        const chevron=document.createElement('span');chevron.className='accordion-chevron';chevron.textContent='⌄';head.appendChild(chevron);
      }else{
        const headNode=document.createElement('button');
        headNode.type='button';headNode.className='mobile-accordion-head metric-head';
        const label=card.querySelector('.label');
        if(label)label.textContent=title;
        headNode.innerHTML='<span class="accordion-icon" aria-hidden="true">◈</span><span class="metric-head-title"></span><span class="accordion-chevron">⌄</span>';
        headNode.querySelector('.metric-head-title').textContent=title;
        card.insertBefore(headNode,card.firstChild);
      }
      const accordionHead=head||card.querySelector('.mobile-accordion-head');
      const content=document.createElement('div');content.className='mobile-accordion-content';
      [...card.children].forEach(child=>{if(child!==accordionHead)content.appendChild(child);});
      card.appendChild(content);
      const toggle=()=>{
        const expanded=card.classList.toggle('expanded');
        accordionHead.setAttribute('aria-expanded',String(expanded));
      };
      accordionHead.addEventListener('click',toggle);
      accordionHead.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle();}});
      // Compact summary metrics remain visible in collapsed cards; detailed lists stay inside.
      if(card.classList.contains('metric'))card.classList.add('metric-accordion');
      card.dataset.mobileAccordion=String(index);
    });

    // Persistent category shortcuts. The main map and location summary always remain visible.
    const nav=document.createElement('nav');nav.id='mobileNav';nav.className='mobile-nav';nav.setAttribute('aria-label','Главные разделы');
    const items=[['earth','◎','Земля'],['weather','☁','Погода'],['space','◉','Космос'],['transport','✈','Транспорт'],['energy','ϟ','Энергия']];
    nav.innerHTML=items.map(([key,icon,label])=>'<button type="button" data-nav-section="'+key+'" aria-pressed="'+(key==='all')+'"><span class="nav-icon" aria-hidden="true">'+icon+'</span><span>'+label+'</span></button>').join('');
    document.body.appendChild(nav);
    const groups={earth:new Set(['earth','geology','disasters','ecology','oceans']),weather:new Set(['weather','ecology','history']),space:new Set(['space']),transport:new Set(['transport']),energy:new Set(['energy'])};
    function openSection(key){
      const categoryButton=toolbar?.querySelector('[data-category="'+key+'"]');
      if(categoryButton){categoryButton.click();return;}
      // Keep map visible and synchronize both navigation rows for the "All" view.
      document.querySelectorAll('[data-category]').forEach(b=>b.classList.toggle('active',b.dataset.category==='all'));
      grid.querySelectorAll('[data-module]').forEach(el=>{el.hidden=false;});
      nav.querySelectorAll('button').forEach(b=>{const active=b.dataset.navSection===key;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
      state.selectedCategory=key;
      if(state.map)setTimeout(()=>state.map.invalidateSize({pan:false}),100);
    }
    nav.addEventListener('click',e=>{const b=e.target.closest('[data-nav-section]');if(b)openSection(b.dataset.navSection);});
    document.getElementById('mobileLocate')?.addEventListener('click',locateUser);
    document.getElementById('mobileReset')?.addEventListener('click',()=>{if(state.map)state.map.setView([20,0],2);state.location=null;text('selectedCoords','GLOBAL VIEW');text('mobileSelectedCoords','GLOBAL VIEW');});
    const syncCoords=()=>{const source=document.getElementById('selectedCoords'),target=document.getElementById('mobileSelectedCoords');if(source&&target){const observer=new MutationObserver(()=>target.textContent=source.textContent);observer.observe(source,{childList:true,subtree:true,characterData:true});target.textContent=source.textContent;}};
    syncCoords();
    window.addEventListener('resize',()=>{if(state.map)state.map.invalidateSize({pan:false});},{passive:true});
    openSection('earth');
  }
  function start(){setupControls();setupMobileNavigation();initMap();setClock();setInterval(setClock,1000);refreshAll();setInterval(()=>{Promise.allSettled([loadQuakes(),loadEvents(),loadISS(),loadWeather(),loadAir(),loadMarine(),loadSpaceWeather()]);},5*60*1000);setInterval(loadNEO,30*60*1000);setInterval(loadHistory,60*60*1000);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();