/* EMONITO — open-data monitoring dashboard. No secrets are embedded. */
import { SOURCES as SOURCE_CONFIG, DEFAULT_LOCATION, GLOBAL_VIEW } from './config.js';
import { createApi } from './api.js?v=api-rewrite-1';
import { initMap as initializeMap } from './map.js?v=solar-terminator-1';
import { setupMobileCollapsibles } from './ui.js?v=ui-stable-1';
import { initMonitoringModules } from './modules.js?v=modules-1';
import { initPlanetExplorer } from './planet-explorer.js?v=dashboard-reorg-2';
import { initLocalZenith } from './local-zenith.js?v=ambient-local-radar-1';
import { initAmbientEngine } from './ambient-engine.js?v=ambient-local-radar-1';
import { initSatelliteIntercept } from './satellite-intercept.js?v=satellite-intercept-1';
import { initEarthWatch } from './earth-watch.js?v=earth-watch-3';
import { initEnhancements } from './enhancements.js?v=geo-ambient-1';
(() => {
  const $ = id => document.getElementById(id);
  const state = { map:null, layers:{}, activeMarkers:{}, location:null, chart:null, lastUpdated:null, requests:new Map(), selectedCategory:'earth', issHistory:[], quakeFeatures:[], quakeWindowHours:24 };
  const SOURCES = SOURCE_CONFIG;
  const $status = (id, text, mode='') => { const el=$(id); if(!el)return; el.textContent=text; el.className='status '+mode; };
  const text = (id, value) => { if($(id)) $(id).textContent = value == null ? '—' : String(value); };
  const fmt = (n,d=1) => Number.isFinite(Number(n)) ? Number(n).toFixed(d) : '—';
  const dateTime = value => value ? new Date(value).toLocaleString() : 'Time unavailable';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const fetchJson = createApi(state.requests);

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

  function popupLink(title,detail,href){return '<strong>'+esc(title)+'</strong><br>'+esc(detail)+(href?'<br><a href="'+esc(href)+'" target="_blank" rel="noopener noreferrer">Open source ↗</a>':'');}
  async function loadQuakes(){
    $status('quakeStatus','LOADING');
    try{const d=await fetchJson(SOURCES.usgs);const features=d.features||[];state.quakeFeatures=features;text('quakeCount',features.filter(f=>Date.now()-(f.properties?.time||0)<=state.quakeWindowHours*3600000).length);
      const filtered=features.filter(f=>Date.now()-(f.properties?.time||0)<=state.quakeWindowHours*3600000);const sorted=[...filtered].sort((a,b)=>(b.properties?.mag||0)-(a.properties?.mag||0));
      setList('quakeList',sorted.slice(0,8).map(f=>{const p=f.properties||{},c=f.geometry?.coordinates||[];return makeRow(p.place||'Unknown location','Depth '+fmt(c[2],1)+' km · '+dateTime(p.time),'M '+fmt(p.mag,1),p.url)}),'No earthquakes reported in this period.');
      const group=state.layers.quakes;if(group){group.clearLayers();filtered.forEach(f=>{const p=f.properties||{},c=f.geometry?.coordinates||[];if(!state.map||c.length<2)return;const m=L.circleMarker([c[1],c[0]],{radius:Math.max(4,Math.min(13,3+(Number(p.mag)||0)*1.4)),color:(p.mag||0)>=5?'#ff5f5f':'#e6d34b',weight:1,fillOpacity:.55});m.bindPopup(popupLink('Magnitude '+fmt(p.mag,1),p.place+' · depth '+fmt(c[2],1)+' km',p.url));m.addTo(group);});}
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
      state.issPosition={latitude:Number(d.latitude),longitude:Number(d.longitude),altitude:Number(d.altitude),velocity:Number(d.velocity),timestamp:Number(d.timestamp)};text('issLat',fmt(d.latitude,2)+'°');text('issLon',fmt(d.longitude,2)+'°');text('issAlt',fmt(d.altitude,1)+' km');text('issSpeed',fmt(d.velocity,0)+' km/h');
      setList('issList',[makeRow('ISS / NORAD 25544','Lat '+fmt(d.latitude,4)+'° · Lon '+fmt(d.longitude,4)+'°','ALT '+fmt(d.altitude,1)+' km','https://wheretheiss.at/'),makeRow('Orbital velocity','Reported by WhereTheISS.at',fmt(d.velocity,0)+' km/h'),makeRow('Measurement timestamp',dateTime(Number(d.timestamp)*1000),'UTC')]);
      const group=state.layers.iss;if(group&&state.map){group.clearLayers();const icon=L.divIcon({className:'iss-icon',html:'ISS',iconSize:[34,20],iconAnchor:[17,10]});L.marker([d.latitude,d.longitude],{icon}).bindPopup(popupLink('International Space Station','Altitude '+fmt(d.altitude,1)+' km · velocity '+fmt(d.velocity,0)+' km/h','https://wheretheiss.at/')).addTo(group);state.issHistory.push([Number(d.latitude),Number(d.longitude)]);if(state.issHistory.length>180)state.issHistory.shift();const trail=state.layers.issTrail;if(trail){trail.clearLayers();if(state.issHistory.length>1)L.polyline(state.issHistory,{color:'#d9ff45',weight:2,opacity:.7}).addTo(trail);}}
      $status('issStatus','LIVE · '+new Date().toLocaleTimeString(),'ok');
    }catch(e){['issLat','issLon','issAlt','issSpeed'].forEach(id=>text(id,'—'));$status('issStatus','UNAVAILABLE','error');setList('issList',[],'ISS provider unavailable: '+e.message);}
  }
  async function loadWeather(){
    const loc=state.location||DEFAULT_LOCATION;$status('weatherStatus','LOADING');
    const url=SOURCES.weather+'?latitude='+loc.latitude+'&longitude='+loc.longitude+'&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m,wind_direction_10m,surface_pressure&hourly=temperature_2m,precipitation,wind_speed_10m&past_days=7&forecast_days=3&timezone=auto';
    try{const d=await fetchJson(url);const c=d.current;if(!c)throw new Error('No current conditions');text('weatherTemp',fmt(c.temperature_2m,1)+'°C');text('weatherFeels',fmt(c.apparent_temperature,1)+'°C feels like');text('weatherWind',fmt(c.wind_speed_10m,1)+' km/h');text('weatherPressure',fmt(c.surface_pressure,0)+' hPa');text('weatherHumidity',fmt(c.relative_humidity_2m,0)+'%');text('weatherRain',fmt(c.precipitation,1)+' mm');text('weatherUpdated',dateTime(c.time));text('selectedCoords',fmt(loc.latitude,3)+'°, '+fmt(loc.longitude,3)+'°');text('mobileSelectedCoords',fmt(loc.latitude,3)+'°, '+fmt(loc.longitude,3)+'°');drawHistory(d.hourly);$status('weatherStatus','LIVE · '+new Date().toLocaleTimeString(),'ok');}
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
    // JPL CAD is a public, keyless NASA endpoint; unlike NeoWs DEMO_KEY it avoids the shared demo-key quota.
    const url='https://ssd-api.jpl.nasa.gov/cad.api?date-min='+start+'&date-max='+end+'&dist-max=0.05&sort=dist&limit=20&fullname=true';
    try{
      const d=await fetchJson(url,15000);
      if(d.code||!Array.isArray(d.data))throw new Error(d.message||'Unexpected JPL CAD response');
      const fields=d.fields||[],idx=Object.fromEntries(fields.map((name,i)=>[name,i]));
      const list=d.data.map(row=>({
        name:row[idx.des]||row[idx.fullname]||'Unidentified object',
        date:row[idx.cd]||'Date unavailable',
        distance: Number(row[idx.dist]),
        velocity:Number(row[idx.v_rel]),
        designation:row[idx.des]||'',
        id:row[idx.des]||''
      })).filter(o=>Number.isFinite(o.distance)).sort((a,b)=>a.distance-b.distance);
      text('neoCount',list.length);
      setList('neoList',list.slice(0,6).map(n=>makeRow(n.name,'Closest approach '+n.date+' · JPL close-approach data',Number.isFinite(n.distance)?fmt(n.distance,5)+' au'+(Number.isFinite(n.velocity)?' · '+fmt(n.velocity,1)+' km/s':''):'—','https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr='+encodeURIComponent(n.id))),'JPL returned no close-approach records for this period.');
      $status('neoStatus','LIVE · NASA JPL CAD','ok');
    }catch(e){
      text('neoCount','—');$status('neoStatus','UNAVAILABLE','error');
      setList('neoList',[],'NASA JPL close-approach service did not return usable data. No substitute values shown.');
    }
  }
  async function loadTransport(){
    $status('transportStatus','LOADING');
    if(!state.map||state.map.getZoom()<5){text('transportCount','Zoom in');$status('transportStatus','ZOOM TO LEVEL 5+');setList('transportList',[],'Zoom in to a regional view before querying OpenStreetMap. This avoids sending global queries to public Overpass servers.');return;}
    try{const bounds=state.map?state.map.getBounds():L.latLngBounds([35,-10],[60,30]);const s=bounds.getSouth(),w=bounds.getWest(),n=bounds.getNorth(),e=bounds.getEast();const query='[out:json][timeout:12];(node["aeroway"="aerodrome"]('+s+','+w+','+n+','+e+');way["aeroway"="aerodrome"]('+s+','+w+','+n+','+e+');node["railway"="station"]('+s+','+w+','+n+','+e+'); );out center tags;';
      const d=await fetchJson('https://overpass-api.de/api/interpreter?data='+encodeURIComponent(query),18000);const els=d.elements||[];const group=state.layers.transport;if(group){group.clearLayers();els.forEach(o=>{const lat=o.lat??o.center?.lat,lon=o.lon??o.center?.lon;if(!Number.isFinite(lat)||!Number.isFinite(lon))return;const name=o.tags?.name||o.tags?.['name:en']||o.tags?.aeroway||'Transport feature';L.circleMarker([lat,lon],{radius:4,color:'#60d9ff',fillColor:'#60d9ff',fillOpacity:.7,weight:1}).bindPopup(popupLink(name,o.tags?.railway||o.tags?.aeroway||'OpenStreetMap feature','https://www.openstreetmap.org/'+o.type+'/'+o.id)).addTo(group);});}
      text('transportCount',els.length);setList('transportList',els.slice(0,8).map(o=>makeRow(o.tags?.name||o.tags?.['name:en']||'Unnamed transport feature',o.tags?.railway||o.tags?.aeroway||o.type,'OSM', 'https://www.openstreetmap.org/'+o.type+'/'+o.id)),'No transport features in the current map view.');$status('transportStatus','LIVE · OPENSTREETMAP','ok');
    }catch(e){text('transportCount','—');$status('transportStatus','UNAVAILABLE / RATE LIMITED','error');setList('transportList',[],'Overpass unavailable or rate-limited. Base map remains available.');}
  }
  async function loadMarine(){
    $status('marineStatus','LOADING');
    const loc=state.location||{latitude:GLOBAL_VIEW.latitude,longitude:GLOBAL_VIEW.longitude};
    try{const url='https://marine-api.open-meteo.com/v1/marine?latitude='+loc.latitude+'&longitude='+loc.longitude+'&current=wave_height,wave_direction,wave_period&daily=wave_height_max&forecast_days=3&timezone=auto';const d=await fetchJson(url);const c=d.current||{};text('waveHeight',Number.isFinite(Number(c.wave_height))?fmt(c.wave_height,2)+' m':'—');text('waveDirection',Number.isFinite(Number(c.wave_direction))?fmt(c.wave_direction,0)+'°':'—');text('wavePeriod',Number.isFinite(Number(c.wave_period))?fmt(c.wave_period,1)+' s':'—');const dates=d.daily?.time||[],max=d.daily?.wave_height_max||[];setList('marineList',dates.map((day,i)=>makeRow('Wave forecast',day,Number.isFinite(Number(max[i]))?fmt(max[i],2)+' m max':'—')),'Marine model returned no forecast.');$status('marineStatus','MODEL DATA · OPEN-METEO','ok');}
    catch(e){['waveHeight','waveDirection','wavePeriod'].forEach(id=>text(id,'—'));setList('marineList',[],'Marine API unavailable at this location. Ocean variables may be unavailable over land.');$status('marineStatus','UNAVAILABLE','error');}
  }
  async function loadAircraft(){
    $status('aircraftStatus','LOADING');
    if(!state.map||state.map.getZoom()<5){
      text('aircraftCount','Zoom in');$status('aircraftStatus','ZOOM TO LEVEL 5+');
      setList('aircraftList',[],'Zoom to a regional view before querying live aircraft. Coverage depends on public receiver data.');
      return;
    }
    try{
      const center=state.map.getCenter();
      // ADS-B.lol exposes a public regional endpoint without the browser-side OpenSky authentication/CORS failure.
      const url='https://api.adsb.lol/v2/lat/'+encodeURIComponent(center.lat)+'/lon/'+encodeURIComponent(center.lng)+'/dist/135';
      const d=await fetchJson(url,16000);
      if(!Array.isArray(d.ac))throw new Error('Unexpected ADS-B response');
      const aircraft=d.ac.filter(a=>Number.isFinite(Number(a.lat))&&Number.isFinite(Number(a.lon)));
      text('aircraftCount',aircraft.length);
      const group=state.layers.aircraft;
      if(group){
        group.clearLayers();
        aircraft.forEach(a=>{
          const label=String(a.flight||a.hex||a.r||'Aircraft').trim();
          const altitude=Number(a.alt_baro);
          const speed=Number(a.gs);
          L.circleMarker([Number(a.lat),Number(a.lon)],{radius:3,color:'#d9ff45',fillColor:'#d9ff45',fillOpacity:.85,weight:1})
            .bindPopup(popupLink(label,'Altitude '+(Number.isFinite(altitude)?fmt(altitude/1000,1)+' km':'—')+' · ground speed '+(Number.isFinite(speed)?fmt(speed,0)+' kt':'—'),'https://api.adsb.lol/'))
            .addTo(group);
        });
      }
      setList('aircraftList',aircraft.slice(0,8).map(a=>{
        const altitude=Number(a.alt_baro),speed=Number(a.gs);
        return makeRow(String(a.flight||a.hex||a.r||'Aircraft').trim(),(a.t||'Aircraft')+' · '+fmt(a.lat,2)+', '+fmt(a.lon,2),Number.isFinite(altitude)?fmt(altitude/1000,1)+' km':'—','https://api.adsb.lol/');
      }),'No aircraft reported by the public ADS-B feed in this region.');
      $status('aircraftStatus','LIVE · ADS-B.LOL','ok');
    }catch(e){
      text('aircraftCount','—');$status('aircraftStatus','UNAVAILABLE','error');
      setList('aircraftList',[],'Public ADS-B feed unavailable or rate-limited. Retry later; no aircraft are simulated.');
    }
  }
  function parseCSVLine(line){
    const cells=[];let value='',quoted=false;
    for(let i=0;i<line.length;i++){
      const ch=line[i];
      if(ch==='"'&&quoted&&line[i+1]==='"'){value+='"';i++;}
      else if(ch==='"')quoted=!quoted;
      else if(ch===','&&!quoted){cells.push(value);value='';}
      else value+=ch;
    }
    cells.push(value);return cells;
  }
  async function loadEnergy(){
    $status('energyStatus','LOADING');
    try{const d=await fetch('https://ourworldindata.org/grapher/electricity-prod-source-stacked.csv?tab=chart&time=latest&csvType=full&useColumnShortNames=true');if(!d.ok)throw new Error('HTTP '+d.status);const csv=await d.text();const lines=csv.trim().split(/\r?\n/);const header=parseCSVLine(lines[0]);const countryIndex=header.indexOf('Entity');const yearIndex=header.indexOf('Year');const rows=lines.slice(1).map(parseCSVLine).filter(cells=>cells[countryIndex]==='Germany').sort((a,b)=>Number(b[yearIndex])-Number(a[yearIndex])).slice(0,5);setList('energyList',rows.map(cells=>makeRow('Germany electricity production','Year '+(cells[yearIndex]||'—')+' · Our World in Data',cells.filter((v,i)=>i>yearIndex&&v!==undefined&&v!=='').slice(0,3).join(' / '))),'Historical electricity dataset returned no rows.');text('energyCount','Historical');$status('energyStatus','HISTORICAL · OWID','ok');}
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
  function locateUser(){if(!navigator.geolocation){text('weatherUpdated','Geolocation not supported');return;}text('weatherUpdated','Requesting location permission…');navigator.geolocation.getCurrentPosition(p=>{state.location={latitude:p.coords.latitude,longitude:p.coords.longitude};state.map?.setView([p.coords.latitude,p.coords.longitude],7);text('selectedCoords',fmt(p.coords.latitude,3)+'°, '+fmt(p.coords.longitude,3)+'°');text('mobileSelectedCoords',fmt(p.coords.latitude,3)+'°, '+fmt(p.coords.longitude,3)+'°');loadWeather();loadAir();loadMarine();loadHistory();},e=>text('weatherUpdated',e.code===1?'Location permission denied':'Could not determine location'),{enableHighAccuracy:false,timeout:10000,maximumAge:300000});}
  function setClock(){text('clock','UTC '+new Date().toISOString().slice(11,19));}
  function setupControls(){
    $('refreshAll')?.addEventListener('click',refreshAll);
    const explorerToggle = $('planetExplorerToggle');
    const explorer = $('planetExplorer');
    explorerToggle?.addEventListener('click', () => {
      if (!explorer) return;
      explorer.hidden = !explorer.hidden;
      explorerToggle.setAttribute('aria-expanded', String(!explorer.hidden));
      explorerToggle.textContent = explorer.hidden ? 'Открыть инструменты +' : 'Скрыть инструменты −';
    });
    $('weatherLocate')?.addEventListener('click',locateUser);

    const categoryGroups={
      earth:new Set(['earth','geology','disasters','oceans','ecology']),
      weather:new Set(['weather','history']),
      space:new Set(['space']),
      transport:new Set(['transport','maritime']),
      energy:new Set(['energy'])
    };
    function applyCategory(category){
      const allowed=categoryGroups[category]||categoryGroups.earth;
      document.querySelectorAll('[data-category]').forEach(b=>{
        const active=b.dataset.category===category;
        b.classList.toggle('active',active);
        b.setAttribute('aria-pressed',String(active));
      });
      document.querySelectorAll('[data-module]').forEach(el=>{
        if(el.classList.contains('map-panel'))return;
        const visible=allowed.has(el.dataset.module);
        el.classList.toggle('category-screen-hidden',!visible);
        el.classList.toggle('category-screen-item',visible);
      });
      document.querySelectorAll('[data-category-screen]').forEach(screen=>{
        screen.hidden=screen.dataset.categoryScreen!==category;
      });
      const side=document.querySelector('.side');
      if(side)side.classList.toggle('category-screen-hidden',!side.querySelector('[data-module]:not(.category-screen-hidden)'));
      state.selectedCategory=category;
      if(state.map)requestAnimationFrame(()=>state.map.invalidateSize({pan:false}));
    }
    document.querySelectorAll('[data-category]').forEach(btn=>{
      btn.type='button';
      btn.addEventListener('click',e=>{
        e.preventDefault();
        applyCategory(btn.dataset.category);

      });
    });
    $('imageryMode')?.addEventListener('change',e=>{
      if(!state.map)return;
      state.map.removeLayer(state.layers.satellite);state.map.removeLayer(state.layers.clouds);
      if(e.target.value==='satellite')state.layers.satellite.addTo(state.map);
      if(e.target.value==='clouds')state.layers.clouds.addTo(state.map);
      document.querySelectorAll('[data-layer-toggle="satellite"],[data-layer-toggle="clouds"]').forEach(input=>{input.checked=input.dataset.layerToggle===e.target.value;});
    });
    $('mapRefreshTransport')?.addEventListener('click',()=>{zoomToTransport();});
    $('layerMenuToggle')?.addEventListener('click',()=>{const menu=$('layerMenu'),button=$('layerMenuToggle');if(!menu)return;menu.hidden=!menu.hidden;button.setAttribute('aria-expanded',String(!menu.hidden));});
    document.querySelectorAll('[data-layer-toggle]').forEach(input=>input.addEventListener('change',()=>{
      const key=input.dataset.layerToggle,layer=state.layers[key];
      if(key==='solarTerminator'){
        if(!layer)return;
        if(input.checked)layer.addTo(state.map);
        else state.map.removeLayer(layer);
        return;
      }
      if(key==='satellite'||key==='clouds'){
        const mode=$('imageryMode'),other=key==='satellite'?'clouds':'satellite';
        if(input.checked){
          state.map.removeLayer(state.layers[other]);state.layers[key]?.addTo(state.map);
          document.querySelector('[data-layer-toggle="'+other+'"]')?.setAttribute('checked','');
          const otherInput=document.querySelector('[data-layer-toggle="'+other+'"]');if(otherInput)otherInput.checked=false;
          if(mode)mode.value=key;
        }else{
          if(layer&&state.map.hasLayer(layer))state.map.removeLayer(layer);
          if(mode&&mode.value===key)mode.value='street';
        }
        return;
      }
      if(!layer||!state.map)return;
      if(input.checked){layer.addTo(state.map);if(key==='transport'||key==='aircraft')zoomToTransport();}
      else if(state.map.hasLayer(layer))state.map.removeLayer(layer);
    }));
    $('quakeTimeline')?.addEventListener('change',e=>{state.quakeWindowHours=Number(e.target.value)||24;loadQuakes();});
    addStatusActions();
  }
  function zoomToTransport(load=true){
    if(!state.map)return;
    const current=state.map.getZoom(),target=Math.max(5,current);
    if(current<5){state.map.flyTo(state.map.getCenter(),5,{animate:true,duration:0.8});state.map.once('moveend',()=>{if(load){loadTransport();loadAircraft();}});}
    else if(load){loadTransport();loadAircraft();}
  }
  function addStatusActions(){
    const retryMap={energyStatus:loadEnergy,transportStatus:()=>zoomToTransport(),aircraftStatus:()=>zoomToTransport(),weatherStatus:loadWeather,airStatus:loadAir,quakeStatus:loadQuakes,eventStatus:loadEvents,spaceStatus:loadSpaceWeather,issStatus:loadISS,neoStatus:loadNEO,marineStatus:loadMarine,historyStatus:loadHistory};
    const enhance=status=>{
      const id=status.id,handler=retryMap[id];if(!handler)return;
      const text=status.textContent||'',needsRetry=status.classList.contains('error')||/UNAVAILABLE|RATE LIMITED|ZOOM TO LEVEL/i.test(text);
      let actions=status.parentElement?.querySelector(':scope > .status-actions');
      if(!needsRetry){actions?.remove();return;}
      if(!actions){actions=document.createElement('span');actions.className='status-actions';status.insertAdjacentElement('afterend',actions);}
      if(!actions.querySelector('.status-info')){const info=document.createElement('button');info.type='button';info.className='status-info';info.textContent='ⓘ';info.title='Пояснение о статусе источника';info.setAttribute('aria-label',info.title);info.setAttribute('aria-expanded','false');info.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();let note=actions.querySelector('.status-explanation');if(note){note.remove();info.setAttribute('aria-expanded','false');return;}note=document.createElement('span');note.className='status-explanation';note.textContent=/ZOOM TO LEVEL/i.test(status.textContent)?'Для этого слоя нужен региональный масштаб. Нажмите «Приблизить», чтобы перейти к уровню 5.':'Источник не ответил или ограничил доступ. Проверьте соединение и повторите запрос.';actions.append(note);info.setAttribute('aria-expanded','true');});actions.append(info);}
      let retry=actions.querySelector('.status-retry');
      if(!retry){retry=document.createElement('button');retry.type='button';retry.className='status-retry';retry.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();handler();});actions.append(retry);}
      // Status can change after a retry; never leave a stale "Приблизить" action beside an API error.
      retry.textContent=/ZOOM TO LEVEL/i.test(status.textContent)?'Приблизить':'Повторить';
      retry.setAttribute('aria-label',retry.textContent+' — '+(status.closest('.panel')?.querySelector('.title')?.textContent||'источник данных'));
      const info=actions.querySelector('.status-info');
      if(info)info.title=/ZOOM TO LEVEL/i.test(status.textContent)?'Для этого слоя нужен региональный масштаб.':'Источник не ответил или ограничил доступ. Можно повторить запрос.';
    };
    document.querySelectorAll('.status[id]').forEach(enhance);
    const observer=new MutationObserver(records=>records.forEach(record=>{const el=record.target.nodeType===1?record.target:record.target.parentElement;if(el?.matches?.('.status[id]'))enhance(el);else el?.closest?.('.status[id]')&&enhance(el.closest('.status[id]'));}));
    document.querySelectorAll('.status[id]').forEach(el=>observer.observe(el,{attributes:true,attributeFilter:['class'],childList:true,characterData:true,subtree:true}));
  }
  async function refreshAll(){text('lastRefresh','Updating…');await Promise.allSettled([loadQuakes(),loadEvents(),loadISS(),loadWeather(),loadAir(),loadMarine(),loadSpaceWeather(),loadNEO(),loadTransport(),loadAircraft(),loadEnergy(),loadHistory()]);state.lastUpdated=new Date();text('lastRefresh','Updated '+state.lastUpdated.toLocaleTimeString());}

  function setupMobileNavigation(){
    setupMobileCollapsibles();
    // Preserve the original DOM order; CSS makes the category toolbar a fixed mobile nav.
    const resizeMap=()=>{if(state.map)requestAnimationFrame(()=>state.map.invalidateSize({pan:false}));};
    window.addEventListener('resize',resizeMap,{passive:true});
    window.addEventListener('orientationchange',resizeMap,{passive:true});

    const fullMapButton=$('fullMapMode');
    const metricsButton=$('metricsMode');
    const prefersReduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const setMode=(mode)=>{
      document.body.classList.toggle('map-fullscreen',mode==='map');
      document.body.classList.toggle('dashboard-mode',mode==='metrics');
      fullMapButton?.setAttribute('aria-pressed',String(mode==='map'));
      metricsButton?.setAttribute('aria-pressed',String(mode==='metrics'));
      if(state.map)requestAnimationFrame(()=>state.map.invalidateSize({pan:false}));
      if(mode==='metrics')document.querySelector('.side')?.scrollIntoView({block:'start',behavior:prefersReduced()?'auto':'smooth'});
      if(mode==='map')window.scrollTo({top:0,behavior:prefersReduced()?'auto':'smooth'});
    };
    fullMapButton?.addEventListener('click',()=>setMode(document.body.classList.contains('map-fullscreen')?'normal':'map'));
    metricsButton?.addEventListener('click',()=>setMode(document.body.classList.contains('dashboard-mode')?'normal':'metrics'));

    const metricTargets={
      quakeCount:'#quakeList',
      eventCount:'#eventList',
      kpValue:'#solarList',
      issLat:'#issList',
      weatherTemp:'#weatherStatus',
      airAQI:'#airStatus'
    };
    document.querySelectorAll('.metric').forEach(card=>{
      const value=card.querySelector('.value');
      const targetSelector=value&&metricTargets[value.id];
      if(!targetSelector)return;
      card.tabIndex=0;
      card.setAttribute('role','link');
      card.setAttribute('aria-label',(card.querySelector('.label')?.textContent||'Показатель')+' — открыть подробности');
      const openDetails=()=>{
        const target=document.querySelector(targetSelector);
        const panel=target?.closest('.panel');
        if(panel?.classList.contains('panel--collapsed')){
          panel.classList.remove('panel--collapsed');
          const toggle=panel.querySelector('.panel__toggle');
          if(toggle){toggle.textContent='−';toggle.setAttribute('aria-expanded','true');toggle.setAttribute('aria-label','Свернуть панель');}
        }
        target?.scrollIntoView({block:'start',behavior:prefersReduced()?'auto':'smooth'});
      };
      card.addEventListener('click',openDetails);
      card.addEventListener('keydown',event=>{
        if(event.key==='Enter'||event.key===' '){event.preventDefault();openDetails();}
      });
    });

  }

  // Onboarding is an isolated UI layer; it never owns data fetching or map state.
  function initOnboarding(){
    const STORAGE_KEY='emonito-onboarding-v1';
    const readProgress=()=>{
      try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');}
      catch{return {};}
    };
    const saveProgress=next=>{
      try{localStorage.setItem(STORAGE_KEY,JSON.stringify({...readProgress(),...next,updatedAt:new Date().toISOString()}));}
      catch{/* Private browsing or storage restrictions must not block the app. */}
    };
    const progress=readProgress();
    const tour=document.getElementById('onboardingTour');
    const overlay=document.getElementById('onboardingOverlay');
    const card=document.getElementById('onboardingCard');
    const title=document.getElementById('onboardingTitle');
    const body=document.getElementById('onboardingBody');
    const counter=document.getElementById('onboardingCounter');
    const back=document.getElementById('onboardingBack');
    const next=document.getElementById('onboardingNext');
    const skip=document.getElementById('onboardingSkip');
    const close=document.getElementById('onboardingClose');
    const help=document.getElementById('helpTour');
    const steps=[
      {id:'categories',target:'.intro .toolbar button[data-category="earth"]',category:'earth',title:'Сферы мониторинга',body:'Выбирайте EARTH, WEATHER, SPACE, TRANSPORT или ENERGY. Вкладки переключают наборы данных внутри одной панели.'},
      {id:'map',target:'.map-panel .map-wrap',category:'earth',title:'Карта и слои',body:'Меняйте масштаб карты, выбирайте подложку и включайте тематические слои. Геолокация включается только по вашему действию.'},
      {id:'metrics',target:'.metric .value#quakeCount',category:'earth',title:'Карточки показателей',body:'Некоторые карточки открывают подробности в соответствующем модуле. Время и источник помогают правильно интерпретировать значения.'},
      {id:'statuses',target:'#mapStatus',category:'earth',title:'Статусы источников',body:'LIVE означает, что источник ответил, но не гарантирует мгновенное обновление каждого значения. UNAVAILABLE означает, что данные сейчас недоступны.'},
      {id:'refresh',target:'#refreshAll',category:'earth',title:'Обновление и UTC',body:'UTC — универсальное координированное время. Кнопка обновления повторно запрашивает данные; источники могут обновляться с разной периодичностью.'}
    ];
    let index=0,activeTarget=null,previousFocus=null,scrollHandler=null;
    const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const visible=el=>!!el&&el.isConnected&&el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden';
    function removeSpotlight(){document.querySelectorAll('.onboarding-spotlight').forEach(el=>el.classList.remove('onboarding-spotlight'));activeTarget=null;}
    function position(){
      if(!tour||tour.hidden||!activeTarget)return;
      const rect=activeTarget.getBoundingClientRect();
      overlay.style.setProperty('--spot-x',Math.max(0,rect.left-6)+'px');
      overlay.style.setProperty('--spot-y',Math.max(0,rect.top-6)+'px');
      overlay.style.setProperty('--spot-w',Math.min(window.innerWidth- Math.max(0,rect.left-6),rect.width+12)+'px');
      overlay.style.setProperty('--spot-h',Math.min(window.innerHeight- Math.max(0,rect.top-6),rect.height+12)+'px');
      const cardRect=card.getBoundingClientRect();
      const below=window.innerHeight-rect.bottom;
      card.classList.toggle('onboarding-card--top',below<cardRect.height+18&&rect.top>cardRect.height+18);
    }
    function finish(status){
      if(!tour||tour.hidden)return;
      tour.hidden=true;overlay.hidden=true;overlay.setAttribute('aria-hidden','true');removeSpotlight();
      document.body.classList.remove('onboarding-open');
      window.removeEventListener('resize',position);
      window.removeEventListener('scroll',scrollHandler,true);
      saveProgress({tourStatus:status,completedSteps:status==='completed'?steps.map(s=>s.id):(progress.completedSteps||[])});
      if(previousFocus&&previousFocus.isConnected)previousFocus.focus({preventScroll:true});
    }
    function render(){
      const step=steps[index];
      document.querySelectorAll('[data-category]').forEach(btn=>{
        if(btn.dataset.category===step.category&&!btn.classList.contains('active'))btn.click();
      });
      let target=document.querySelector(step.target);
      if(!visible(target)&&step.id==='metrics')target=document.querySelector('.metric .value#eventCount');
      if(!visible(target)){
        // A missing target must never leave an unusable modal.
        index++;
        if(index>=steps.length){finish('completed');return;}
        render();return;
      }
      removeSpotlight();activeTarget=target;target.classList.add('onboarding-spotlight');
      title.textContent=step.title;body.textContent=step.body;
      counter.textContent=(index+1)+' / '+steps.length;
      back.disabled=index===0;
      next.textContent=index===steps.length-1?'Начать мониторинг':'Далее →';
      overlay.hidden=false;overlay.setAttribute('aria-hidden','false');tour.hidden=false;document.body.classList.add('onboarding-open');
      requestAnimationFrame(position);
    }
    function start(){
      previousFocus=document.activeElement;
      index=0;saveProgress({tourStatus:'in_progress'});
      render();
      scrollHandler=()=>requestAnimationFrame(position);
      window.addEventListener('resize',position,{passive:true});
      window.addEventListener('scroll',scrollHandler,true);
      card.focus({preventScroll:true});
    }
    back.addEventListener('click',()=>{if(index>0){index--;render();}});
    next.addEventListener('click',()=>{if(index===steps.length-1)finish('completed');else{index++;render();}});
    skip.addEventListener('click',()=>finish('skipped'));
    close.addEventListener('click',()=>finish('skipped'));
    help.addEventListener('click',start);
    overlay.addEventListener('click',event=>{if(event.target===overlay)finish('skipped');});
    document.addEventListener('keydown',event=>{
      if(tour.hidden)return;
      if(event.key==='Escape'){event.preventDefault();finish('skipped');}
      if(event.key==='Tab'){
        const focusables=[back,next,skip,close].filter(el=>!el.disabled&&el.offsetParent!==null);
        if(!focusables.length)return;
        const first=focusables[0],last=focusables[focusables.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
    });
    if(!['completed','skipped'].includes(progress.tourStatus)){
      // Do not interrupt initial rendering/data loading; show after the page has initialized.
      window.setTimeout(start,700);
    }
  }

  function start(){
    if(start.started)return;
    start.started=true;
    const safe=(label,fn)=>{
      try{return fn();}
      catch(error){
        console.error('[EMONITO startup] '+label,error);
        const message=String(error?.message||error||'unknown error').slice(0,90);
        if(label==='map')$status('mapStatus','MAP INIT ERROR · '+message,'error');
        else if(label==='controls')$status('mapStatus','UI INIT ERROR · '+message,'error');
        return undefined;
      }
    };
    // Initialize each subsystem independently so a non-critical UI error cannot
    // prevent the map or live data requests from starting.
    safe('controls',setupControls);
    safe('mobile navigation',setupMobileNavigation);
    safe('onboarding',initOnboarding);
    safe('map',()=>initializeMap({state, $, $status, text, fmt, esc, fetchJson, locateUser, loadWeather, loadAir, loadMarine, loadHistory, SOURCES}));
    safe('new monitoring modules',()=>initMonitoringModules({state}));
    safe('planet explorer',()=>initPlanetExplorer({state}));
    safe('local zenith',()=>initLocalZenith({state, fetchJson, SOURCES, text, fmt, $status}));
    safe('ambient engine',()=>initAmbientEngine());
    safe('satellite intercept',()=>initSatelliteIntercept({state}));
    safe('environment and infrastructure watch',()=>initEarthWatch({state}));
    safe('geo-inspector, favorites, presets and ambient mode',()=>initEnhancements({state}));
    safe('default category',()=>document.querySelector('[data-category="earth"]')?.click());
    safe('clock',()=>{setClock();setInterval(()=>safe('clock tick',setClock),1000);});
    safe('data refresh',()=>{
      refreshAll();
      setInterval(()=>{Promise.allSettled([loadQuakes(),loadEvents(),loadISS(),loadWeather(),loadAir(),loadMarine(),loadSpaceWeather()]);},5*60*1000);
      setInterval(loadNEO,30*60*1000);
      setInterval(loadHistory,60*60*1000);
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();