export function initMap({state, $, $status, text, fmt, esc, fetchJson, locateUser, loadWeather, loadAir, loadMarine, loadHistory, SOURCES}) {
    if(!window.L){$status('mapStatus','MAP LIBRARY FAILED','error');return;}
    const map=L.map('map',{worldCopyJump:true,preferCanvas:true,zoomControl:false,minZoom:2}).setView([20,0],2);
    L.control.zoom({position:'bottomright'}).addTo(map);
    const base=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);
    const satellite=L.tileLayer.wms('https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi',{layers:'MODIS_Terra_CorrectedReflectance_TrueColor',format:'image/jpeg',transparent:false,version:'1.1.1',time:new Date(Date.now()-86400000).toISOString().slice(0,10),attribution:'NASA GIBS / EOSDIS',tileSize:256});
    const clouds=L.tileLayer.wms('https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi',{layers:'MODIS_Terra_Cloud_Top_Temp_Day',format:'image/png',transparent:true,version:'1.1.1',attribution:'NASA GIBS'});
    base.on('tileload',()=>{$status('mapStatus','STREET MAP OK','ok');});base.on('tileerror',()=>{$status('mapStatus','TILE ERROR · CHECK NETWORK','error');});satellite.on('tileload',()=>{$status('mapStatus','NASA IMAGERY LOADED','ok');});satellite.on('tileerror',()=>{$status('mapStatus','NASA IMAGERY UNAVAILABLE','error');});clouds.on('tileerror',()=>{$status('mapStatus','CLOUD LAYER UNAVAILABLE','error');});state.map=map;state.layers={base,satellite,clouds,quakes:L.layerGroup().addTo(map),events:L.layerGroup().addTo(map),iss:L.layerGroup().addTo(map),issTrail:L.layerGroup().addTo(map),air:L.layerGroup(),transport:L.layerGroup(),aircraft:L.layerGroup(),energy:L.layerGroup()};
    map.on('click',async e=>{
      const point={latitude:e.latlng.lat,longitude:e.latlng.lng};state.location=point;
      text('selectedCoords',fmt(point.latitude,3)+'°, '+fmt(point.longitude,3)+'°');text('mobileSelectedCoords',fmt(point.latitude,3)+'°, '+fmt(point.longitude,3)+'°');
      const popup=L.popup({maxWidth:280}).setLatLng(e.latlng).setContent('<div class="map-popup"><strong>Сводка по точке</strong><p>Загружаем погоду…</p><p>Сейсмика: поиск ближайших событий…</p><p>Космическая погода: '+esc($('kpValue')?.textContent||'—')+' Kp</p></div>').openOn(map);
      const nearby=(state.quakeFeatures||[]).map(f=>{const c=f.geometry?.coordinates||[];if(c.length<2)return null;const dlat=(c[1]-point.latitude)*Math.PI/180,dlon=(c[0]-point.longitude)*Math.PI/180;const a=Math.sin(dlat/2)**2+Math.cos(point.latitude*Math.PI/180)*Math.cos(c[1]*Math.PI/180)*Math.sin(dlon/2)**2;return {f,km:6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))};}).filter(Boolean).sort((a,b)=>a.km-b.km)[0];
      let weather='Погода: данные недоступны';
      try{const d=await fetchJson(SOURCES.weather+'?latitude='+point.latitude+'&longitude='+point.longitude+'&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation&timezone=auto');const c=d.current||{};weather='Погода: '+fmt(c.temperature_2m,1)+' °C · влажность '+fmt(c.relative_humidity_2m,0)+'% · ветер '+fmt(c.wind_speed_10m,1)+' км/ч';}catch{}
      const quake=nearby&&nearby.km<500?'Ближайшее землетрясение: M '+fmt(nearby.f.properties?.mag,1)+' · '+Math.round(nearby.km)+' км · '+esc(nearby.f.properties?.place||'место неизвестно'):'В радиусе 500 км нет событий в загруженном фиде за 24 часа';
      const kp='Космическая погода: Kp '+esc($('kpValue')?.textContent||'—');
      if(state.map&&popup.isOpen())popup.setContent('<div class="map-popup"><strong>Сводка · '+fmt(point.latitude,3)+'°, '+fmt(point.longitude,3)+'°</strong><p>'+esc(weather)+'</p><p>'+quake+'</p><p>'+kp+'</p></div>');
      loadWeather();loadAir();loadMarine();loadHistory();
    });
    $('mapLocate').addEventListener('click',()=>locateUser());
    $('mapReset').addEventListener('click',()=>{state.location=null;map.setView([20,0],2);text('selectedCoords','GLOBAL VIEW');text('mobileSelectedCoords','GLOBAL VIEW');loadWeather();loadAir();loadMarine();loadHistory();});
    $status('mapStatus','MAP READY','ok');
  }