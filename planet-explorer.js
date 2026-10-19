/* EMONITO Planet Explorer: evidence-first discovery UI built on existing live modules. */
const $ = (id) => document.getElementById(id);
const STORAGE = 'emonito:planet-explorer:v1';
const HISTORY_LIMIT = 60;
const LABELS = {
  quakeCount: { title: 'Землетрясения', unit: 'событий', explain: 'Число событий в выбранном окне USGS. Рост числа не означает, что каждое событие опаснее.' },
  eventCount: { title: 'Природные события', unit: 'событий', explain: 'Открытые события NASA EONET. Каталог зависит от охвата и классификации источника.' },
  kpValue: { title: 'Геомагнитная активность', unit: 'Kp', explain: 'Индекс Kp характеризует геомагнитную активность; сам по себе он не подтверждает видимость сияния в конкретном месте.' },
  weatherTemp: { title: 'Температура', unit: '°C', explain: 'Текущая оценка Open-Meteo для выбранной точки; это не глобальная средняя температура.' },
  airAQI: { title: 'Качество воздуха', unit: 'AQI', explain: 'Индекс и загрязнители зависят от выбранного места, времени и модели.' },
  waveHeight: { title: 'Высота волн', unit: 'м', explain: 'Модельная оценка Open-Meteo Marine, не показание каждого морского буя.' },
  issAlt: { title: 'Высота МКС', unit: 'км', explain: 'Орбитальная телеметрия может иметь задержку; высота меняется в ходе орбиты.' }
};
const EXPEDITIONS = [
  { id:'aurora', title:'Почему появляются полярные сияния?', time:'3–5 минут', intro:'Сопоставьте геомагнитную активность, вероятность сияния NOAA OVATION и географию. Вероятность не гарантирует наблюдение: важны темнота, облачность и местные условия.', steps:[
    { title:'Проверьте Kp', body:'Найдите показатель Kp в блоке космической погоды. Запомните значение и время, к которому относится последняя запись.', action:'kp' },
    { title:'Включите слой вероятности', body:'Откройте карту и активируйте слой Aurora. Цветные ячейки показывают оценку вероятности по NOAA OVATION, а не фотографию сияния.', action:'aurora' },
    { title:'Сравните с облачностью', body:'Включите облачную подложку, если она доступна, и сравните области. Облачность и вероятность сияния — разные данные, и оба источника могут обновляться в разное время.', action:'clouds' }
  ]},
  { id:'quake', title:'Как читать карту землетрясений', time:'2–4 минуты', intro:'Научитесь отличать магнитуду, глубину, время и расстояние. Количество точек само по себе не говорит о риске для конкретного населённого пункта.', steps:[
    { title:'Откройте сейсмические события', body:'Найдите список USGS и выберите период. Карта показывает события, которые попали в открытый фид за это окно.', action:'quakes' },
    { title:'Сравните магнитуду и глубину', body:'Откройте несколько событий. Магнитуда описывает размер события, глубина — положение очага; интенсивность воздействия на поверхности зависит также от расстояния и местных условий.', action:'quake-list' },
    { title:'Проверьте первоисточник', body:'Откройте ссылку USGS из карточки события, чтобы увидеть детали и возможные обновления оценки.', action:'source' }
  ]},
  { id:'iss', title:'Проследите орбиту МКС', time:'2–3 минуты', intro:'Положение МКС — снимок положения во времени, а не неподвижная точка. Сравните координаты и след на карте, если они доступны.', steps:[
    { title:'Найдите МКС', body:'Откройте раздел SPACE и проверьте время телеметрии, широту, долготу и высоту.', action:'iss' },
    { title:'Посмотрите траекторию', body:'Убедитесь, что слой траектории МКС включён. След строится из полученных приложением точек и не является прогнозом будущей орбиты.', action:'iss-trail' },
    { title:'Обновите наблюдение', body:'Нажмите «Обновить данные» и сравните новое положение с предыдущим. Сравнивайте только точки с известным временем получения.', action:'refresh' }
  ]},
  { id:'lights', title:'Что рассказывают ночные огни?', time:'3 минуты', intro:'Спутниковая ночная освещённость помогает исследовать населённые территории, но изменение яркости не доказывает отключение электричества: возможны облака, лунный свет, сезонность и особенности съёмки.', steps:[
    { title:'Включите VIIRS', body:'Откройте модуль ночной освещённости и активируйте слой на карте. Слой отображается только если NASA GIBS отдаёт выбранные тайлы.', action:'night' },
    { title:'Изучите область', body:'Сравните освещённые и тёмные районы, учитывая масштаб и дату спутникового наблюдения.', action:'night-mode' },
    { title:'Не делайте вывод без подтверждения', body:'Для гипотезы о перебое нужны независимые данные: сообщения операторов, погодные условия, дополнительные снимки и время наблюдения.', action:'none' }
  ]}
];
function readStore() {
  try { return JSON.parse(localStorage.getItem(STORAGE) || '{}') || {}; } catch { return {}; }
}
function writeStore(patch) {
  try { localStorage.setItem(STORAGE, JSON.stringify({ ...readStore(), ...patch })); } catch { /* storage is optional */ }
}
function value(id) {
  const raw = $(id)?.textContent?.trim();
  if (!raw || raw === '—' || raw === '-') return null;
  const number = Number.parseFloat(raw.replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}
function fmtTime(date = new Date()) {
  return new Intl.DateTimeFormat('ru-DE', { hour:'2-digit', minute:'2-digit', second:'2-digit', timeZone:'UTC', hour12:false }).format(date) + ' UTC';
}
function safeText(el, text) { if (el) el.textContent = text; }
function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}
export function initPlanetExplorer({ state }) {
  if (!$('planetBriefing')) return;
  const watch = new Set(readStore().watch || ['space','earth']);
  let activeExpedition = null;
  let stepIndex = 0;
  const log = Array.isArray(readStore().timeline) ? readStore().timeline.slice(0, HISTORY_LIMIT) : [];
  const lastValues = readStore().values || {};
  const renderedSnapshots = new Map();
  let refreshObserver;
  const metricIds = Object.keys(LABELS);

  function addTimeline(title, detail, type = 'update') {
    const signature = title + '|' + detail;
    if (log[0]?.signature === signature) return;
    log.unshift({ signature, title, detail, time: new Date().toISOString(), type });
    log.splice(HISTORY_LIMIT);
    writeStore({ timeline: log });
    renderTimeline();
  }
  function renderTimeline() {
    const root = $('planetTimeline');
    if (!root) return;
    root.replaceChildren();
    if (!log.length) {
      root.append(node('li','empty','История появится после успешных обновлений данных. Время ниже — время получения приложением.'));
      return;
    }
    log.slice(0,12).forEach(item => {
      const li = node('li','timeline-item');
      const dot = node('span','timeline-dot');
      dot.setAttribute('aria-hidden','true');
      const body = node('div','timeline-body');
      body.append(node('strong','',item.title), node('p','',item.detail), node('time','',fmtTime(new Date(item.time))));
      li.append(dot,body);
      root.append(li);
    });
  }
  function inspectMetrics(initial = false) {
    const current = {};
    metricIds.forEach(id => {
      const n = value(id);
      if (n == null) return;
      current[id] = n;
      const old = lastValues[id];
      if (old != null && old !== n) {
        const meta = LABELS[id];
        const delta = n - old;
        const sign = delta > 0 ? '+' : '';
        addTimeline(meta.title + ': изменение', 'Было ' + old + ', стало ' + n + ' ' + meta.unit + ' (' + sign + delta + '). Сравнение двух полученных значений; само по себе не доказывает опасность события.', 'change');
      }
      if (initial && old == null) addTimeline(LABELS[id].title + ': первое наблюдение', 'Зафиксировано значение ' + n + ' ' + LABELS[id].unit + '. История начинается с момента работы этого браузера.', 'observation');
    });
    Object.assign(lastValues,current);
    writeStore({ values:lastValues });
    renderBriefing();
  }
  function renderBriefing() {
    const root = $('planetBriefingCards');
    if (!root) return;
    root.replaceChildren();
    const items = [
      { id:'kpValue', module:'space', title:'Космическая погода', text:()=>{const v=value('kpValue');return v==null?'NOAA SWPC: показатель пока не получен.': 'Kp ' + v + ' — геомагнитная активность. Для оценки шанса сияния откройте слой NOAA OVATION.';}, target:'#moduleAurora', action:'Открыть космическую погоду' },
      { id:'quakeCount', module:'earth', title:'Сейсмическая активность', text:()=>{const v=value('quakeCount');return v==null?'Ожидается ответ USGS.':v+' событий в выбранном временном окне. Проверьте магнитуду, глубину и время отдельных событий.';}, target:'#quakeList', action:'Изучить события USGS' },
      { id:'eventCount', module:'earth', title:'События планеты', text:()=>{const v=value('eventCount');return v==null?'Каталог NASA EONET пока не получен.':v+' открытых событий в каталоге NASA EONET. Каталог не является полным перечнем всех природных процессов.';}, target:'#eventList', action:'Открыть каталог событий' },
      { id:'weatherTemp', module:'weather', title:'Погода в выбранной точке', text:()=>{const v=value('weatherTemp');return v==null?'Выберите точку на карте или разрешите геолокацию вручную.':'Температура '+v+' °C. Это локальное значение, а не глобальный показатель климата.';}, target:'#weatherStatus', action:'Сравнить с прогнозом' },
      { id:'waveHeight', module:'earth', title:'Океан и волны', text:()=>{const v=value('waveHeight');return v==null?'Морская модель пока не вернула данные.':'Высота волн '+v+' м по модели Open-Meteo Marine. Сравните с прогнозом и временем модели.';}, target:'#marineStatus', action:'Открыть океанический модуль' },
      { id:'issAlt', module:'space', title:'Международная космическая станция', text:()=>{const v=value('issAlt');return v==null?'Ожидается телеметрия МКС.':'Высота орбиты около '+v+' км в последней полученной телеметрии. Положение меняется непрерывно.';}, target:'#issList', action:'Исследовать орбиту' },
      { id:'airAQI', module:'weather', title:'Качество воздуха', text:()=>{const v=value('airAQI');return v==null?'Нет значения для выбранной точки.':'AQI '+v+'. Интерпретация зависит от шкалы и источника; откройте данные загрязнителей.';}, target:'#airStatus', action:'Проверить загрязнители' }
    ];
    const available = items.filter(item => watch.has(item.module) && (value(item.id) != null || !renderedSnapshots.has(item.id)));
    const selected = available.slice(0,4);
    if (!selected.length) {
      root.append(node('p','empty','Пока нет данных по выбранным интересам. Обновите источники или измените наблюдения ниже.'));
      return;
    }
    selected.forEach(item => {
      const card = node('article','brief-card');
      card.append(node('span','brief-kicker',value(item.id)==null?'ОЖИДАНИЕ ИСТОЧНИКА':'НАБЛЮДЕНИЕ'), node('h3','',item.title), node('p','',item.text()));
      const actions = node('div','brief-actions');
      const open = node('button','',item.action);
      open.type='button';
      open.addEventListener('click',()=>openTarget(item.target,item.module));
      const track = node('button','brief-track',readStore().values?.[item.id] != null ? 'Наблюдать' : 'Добавить в наблюдение');
      track.type='button';
      track.addEventListener('click',()=>{watch.add(item.module);writeStore({watch:[...watch]});addTimeline('Добавлено в наблюдение',item.title,'watch');renderBriefing();renderWatch();});
      actions.append(open,track);card.append(actions);root.append(card);
      renderedSnapshots.set(item.id,true);
    });
  }
  function openTarget(selector, category) {
    const nav = document.querySelector('[data-category="'+category+'"]') || document.querySelector('[data-category="earth"]');
    nav?.click();
    const target = document.querySelector(selector);
    if (target) {
      const panel = target.closest('.panel');
      if (panel?.classList.contains('panel--collapsed')) {
        panel.classList.remove('panel--collapsed');
        const button = panel.querySelector('.panel__toggle');
        if (button) { button.textContent='−'; button.setAttribute('aria-expanded','true'); button.setAttribute('aria-label','Свернуть панель'); }
      }
      target.scrollIntoView({ behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth', block:'start' });
    }
  }
  function renderWatch() {
    const root=$('planetWatch');
    if (!root) return;
    root.replaceChildren();
    const options=[['earth','Земля и природные события'],['weather','Погода и воздух'],['space','Космос и геомагнитная активность'],['transport','Транспорт'],['energy','Энергетика']];
    options.forEach(([key,label])=>{
      const item=node('label','watch-option');
      const input=document.createElement('input');input.type='checkbox';input.checked=watch.has(key);
      input.addEventListener('change',()=>{input.checked?watch.add(key):watch.delete(key);writeStore({watch:[...watch]});addTimeline(input.checked?'Интерес добавлен':'Интерес убран',label,'watch');renderBriefing();});
      item.append(input,node('span','',label));root.append(item);
    });
  }
  function renderExpeditions() {
    const root=$('expeditionList');if(!root)return;root.replaceChildren();
    EXPEDITIONS.forEach(exp=>{
      const card=node('article','expedition-card');
      const head=node('div','expedition-head');head.append(node('div','expedition-icon','↗'),node('div','expedition-title'));head.lastChild.append(node('h3','',exp.title),node('span','',exp.time));
      card.append(head,node('p','',exp.intro));
      const button=node('button','expedition-start',activeExpedition?.id===exp.id?'Продолжить исследование':'Начать исследование');button.type='button';
      button.addEventListener('click',()=>{activeExpedition=exp;stepIndex=0;renderStep();});
      card.append(button);root.append(card);
    });
  }
  function renderStep() {
    const panel=$('expeditionPlayer');if(!panel||!activeExpedition)return;
    panel.hidden=false;
    safeText($('expeditionCounter'),'ШАГ '+(stepIndex+1)+' / '+activeExpedition.steps.length);
    safeText($('expeditionTitle'),activeExpedition.steps[stepIndex].title);
    safeText($('expeditionBody'),activeExpedition.steps[stepIndex].body);
    $('expeditionBack').disabled=stepIndex===0;
    $('expeditionNext').textContent=stepIndex===activeExpedition.steps.length-1?'Завершить':'Следующий шаг →';
    panel.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest'});
  }
  function doExpeditionAction(action) {
    if (!activeExpedition) return;
    const layerMap={aurora:'auroraToggle',night:'nightToggle'};
    const layerId=layerMap[action];
    if (layerId && $(layerId)) { $(layerId).checked=true;$(layerId).dispatchEvent(new Event('change',{bubbles:true})); }
    if (action==='quakes') { const cb=document.querySelector('[data-layer-toggle="quakes"]'); if(cb&&!cb.checked){cb.checked=true;cb.dispatchEvent(new Event('change',{bubbles:true}));} }
    if (action==='night-mode' && $('nightToggle')) { $('nightToggle').checked=true;$('nightToggle').dispatchEvent(new Event('change',{bubbles:true})); }
    if (action==='kp') openTarget('#kpValue','space');
    if (action==='aurora') { openTarget('#moduleAurora','space');if($('auroraToggle')){$('auroraToggle').checked=true;$('auroraToggle').dispatchEvent(new Event('change',{bubbles:true}));} }
    if (action==='clouds') { const select=$('imageryMode');if(select){select.value='clouds';select.dispatchEvent(new Event('change',{bubbles:true}));openTarget('#map','earth');} }
    if (action==='quakes'||action==='quake-list') openTarget('#quakeList','earth');
    if (action==='iss') openTarget('#issList','space');
    if (action==='iss-trail') {const cb=document.querySelector('[data-layer-toggle="issTrail"]');if(cb&&!cb.checked){cb.checked=true;cb.dispatchEvent(new Event('change',{bubbles:true}));}openTarget('#issList','space');}
    if (action==='night'||action==='night-mode') {openTarget('#moduleNight','earth');if($('nightToggle')){$('nightToggle').checked=true;$('nightToggle').dispatchEvent(new Event('change',{bubbles:true}));}}
    if (action==='refresh') $('refreshAll')?.click();
    if (action==='source') openTarget('#quakeList','earth');
  }
  $('expeditionNext')?.addEventListener('click',()=>{
    if(!activeExpedition)return;
    const action=activeExpedition.steps[stepIndex].action;
    doExpeditionAction(action);
    if(stepIndex===activeExpedition.steps.length-1){addTimeline('Экспедиция завершена',activeExpedition.title,'expedition');activeExpedition=null;$('expeditionPlayer').hidden=true;renderExpeditions();return;}
    stepIndex++;renderStep();
  });
  $('expeditionBack')?.addEventListener('click',()=>{if(stepIndex>0){stepIndex--;renderStep();}});
  $('expeditionClose')?.addEventListener('click',()=>{$('expeditionPlayer').hidden=true;activeExpedition=null;});
  $('timelineClear')?.addEventListener('click',()=>{log.length=0;writeStore({timeline:log});renderTimeline();});
  $('briefingRefresh')?.addEventListener('click',()=>{inspectMetrics(false);addTimeline('Сводка обновлена','Значения перечитаны из текущих модулей; источники не запрашиваются повторно.','update');});
  $('planetShowChanges')?.addEventListener('click',()=>openTarget('#planetTimeline','earth'));
  // Listen to existing live UI, so the new experience does not create duplicate API traffic.
  const watchedIds=[...metricIds,'quakeStatus','eventStatus','weatherStatus','airStatus','spaceStatus','issStatus','marineStatus','satelliteStatus','auroraStatus','nightStatus'];
  refreshObserver=new MutationObserver(records=>{
    const ids=new Set(records.map(r=>r.target.id).filter(Boolean));
    if([...ids].some(id=>metricIds.includes(id))) inspectMetrics(false);
    ids.forEach(id=>{
      if(!/Status$/.test(id))return;
      const el=$(id);if(!el)return;
      const label=el.closest('.panel')?.querySelector('.title')?.textContent||id.replace('Status','');
      const text=el.textContent.trim();
      if (/LIVE|NOAA|ДАННЫЕ ИСТОЧНИКА|ТАЙЛЫ ЗАГРУЖЕНЫ|VIIRS · DAILY/i.test(text)) {
        const key=id+'|'+text;
        if (!renderedSnapshots.has(key)) {addTimeline(label+': источник ответил',text+'; время получения приложением — '+fmtTime()+'.','update');renderedSnapshots.set(key,true);}
      }
    });
  });
  watchedIds.forEach(id=>{const el=$(id);if(el)refreshObserver.observe(el,{childList:true,characterData:true,subtree:true});});
  $('planetBriefing')?.addEventListener('click',event=>{if(event.target.closest('[data-briefing-anchor]'))openTarget('#planetBriefing','earth');});
  renderWatch();renderExpeditions();renderTimeline();inspectMetrics(true);
  addTimeline('EMONITO запущен','История наблюдений ведётся локально в этом браузере. Старые записи могут относиться к прошлому сеансу.','system');
  return { refresh:()=>inspectMetrics(false), destroy:()=>refreshObserver?.disconnect() };
}
