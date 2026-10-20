const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const STORAGE_KEY = 'pulse.preferences.v1';
const defaultPrefs = { interests: ['gaming', 'sport', 'culture'], view: 'now' };
let prefs = loadPrefs();
let items = [];
let loading = false;
const views = {
 now: { eyebrow: 'LIVE OVERVIEW / 01', title: 'Что происходит', description: 'События и сигналы из мира твоих интересов.' },
 gaming: { eyebrow: 'PLAY / 02', title: 'Игровой радар', description: 'Новости игр и обновления из доступных открытых источников.' },
 sport: { eyebrow: 'COMPETE / 03', title: 'Спорт в движении', description: 'Матчи и результаты из открытого спортивного фида.' },
 culture: { eyebrow: 'CULTURE / 04', title: 'Культура без границ', description: 'Музыка, видео и культурные открытия.' },
 trends: { eyebrow: 'SIGNAL ANALYSIS / 05', title: 'Trend radar', description: 'Направления для исследования. Не выдаём подборки за измеренную популярность.' },
 discover: { eyebrow: 'DISCOVERY / 06', title: 'Открой новое', description: 'Проверенные отправные точки для поиска новых впечатлений.' }
};
const sources = [
 { id: 'sport', label: 'SPORT / ESPN', icon: '🏆', title: 'Матчи и результаты', description: 'Открытый scoreboard: доступность зависит от выбранного вида спорта и ответа источника.', url: 'https://www.espn.com/', kind: 'sports' },
 { id: 'gaming', label: 'GAMING / STEAM', icon: '🎮', title: 'Новости игрового мира', description: 'Последние публикации Steam News. Данные могут быть недоступны в браузере или ограничены источником.', url: 'https://store.steampowered.com/news/', kind: 'games' },
 { id: 'culture', label: 'CULTURE / MUSIC', icon: '🎵', title: 'Музыка и новые релизы', description: 'Открой новые релизы и редакционные подборки музыкальных сервисов.', url: 'https://music.apple.com/', kind: 'music' },
 { id: 'culture', label: 'CULTURE / VIDEO', icon: '▶', title: 'Что смотрят', description: 'Официальная страница популярных видео. PULSE не придумывает счётчики просмотров.', url: 'https://www.youtube.com/feed/trending', kind: 'video' },
 { id: 'gaming', label: 'GAMING / ESPORTS', icon: '⌁', title: 'Киберспорт и турниры', description: 'Расписание и результаты турниров — через официальные страницы организаторов.', url: 'https://www.esports.net/', kind: 'esports' },
 { id: 'culture', label: 'CULTURE / EVENTS', icon: '✳', title: 'События рядом', description: 'Поиск концертов, выставок и городских мероприятий в выбранном регионе.', url: 'https://www.eventbrite.com/', kind: 'events' }
];
const trends = [
 { title: 'Инди-игры и демоверсии', tag: 'GAMING', url: 'https://store.steampowered.com/tags/en/Indie/' },
 { title: 'Киберспорт', tag: 'GAMING', url: 'https://www.esports.net/' },
 { title: 'Новая музыка', tag: 'CULTURE', url: 'https://music.apple.com/' },
 { title: 'Аниме и анимация', tag: 'CULTURE', url: 'https://www.crunchyroll.com/' },
 { title: 'Женский и молодёжный спорт', tag: 'SPORT', url: 'https://olympics.com/' },
 { title: 'Бесплатные события', tag: 'DISCOVER', url: 'https://www.eventbrite.com/' }
];
function loadPrefs() {
 try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  return { ...defaultPrefs, ...(saved || {}), interests: Array.isArray(saved?.interests) ? saved.interests : [...defaultPrefs.interests] };
 } catch { return { ...defaultPrefs, interests: [...defaultPrefs.interests] }; }
}
function savePrefs() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* private browsing */ } }
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); }
function updateClock() { $('#clock').textContent = new Intl.DateTimeFormat('ru-RU', { hour:'2-digit', minute:'2-digit', second:'2-digit' }).format(new Date()); }
function categoryName(id) { return ({ gaming:'ИГРЫ', sport:'СПОРТ', culture:'КУЛЬТУРА', discover:'ОТКРЫТИЯ' })[id] || 'PULSE'; }
function visibleItems() {
 const query = $('#search').value.trim().toLocaleLowerCase('ru');
 return items.filter(item => {
  const viewMatch = prefs.view === 'now' || prefs.view === 'discover' || prefs.view === 'trends' || item.id === prefs.view;
  const interestMatch = prefs.view !== 'now' || prefs.interests.includes(item.id);
  const queryMatch = !query || [item.title,item.description,item.label].join(' ').toLocaleLowerCase('ru').includes(query);
  return viewMatch && interestMatch && queryMatch;
 });
}
function render() {
 const view = views[prefs.view] || views.now;
 $('#viewEyebrow').textContent = view.eyebrow;
 $('#viewTitle').textContent = view.title;
 $('#viewDescription').textContent = view.description;
 $$('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === prefs.view));
 $$('.chip').forEach(button => {
  const selected = prefs.interests.includes(button.dataset.interest);
  button.classList.toggle('selected', selected);
  button.setAttribute('aria-pressed', String(selected));
 });
 const filtered = visibleItems();
 $('#featureGrid').innerHTML = filtered.length ? filtered.map((item,index) => `<article class="feature-card"><div class="card-top"><span class="category-label">${esc(item.label)}</span><span class="status-pill">${esc(item.status || 'SOURCE LINK')}</span></div><div class="card-icon">${item.icon}</div><h3>${esc(item.title)}</h3><p>${esc(item.description)}</p><a class="card-link" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">Открыть источник <span>↗</span></a></article>`).join('') : '<div class="empty-state">Нет карточек по этому фильтру. Выбери другой раздел или измени запрос.</div>';
 const feed = filtered.slice(0,5);
 $('#feedList').innerHTML = feed.length ? feed.map(item => `<article class="feed-item"><div class="feed-icon">${item.icon}</div><div><h4>${esc(item.title)}</h4><p>${esc(item.description)}</p></div><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">Источник ↗</a></article>`).join('') : '<div class="empty-state">По выбранным интересам ничего не найдено.</div>';
 $('#feedCount').textContent = `${feed.length} ITEMS`;
 const chosenTrends = prefs.view === 'gaming' ? trends.filter(x => x.tag === 'GAMING') : prefs.view === 'sport' ? trends.filter(x => x.tag === 'SPORT') : prefs.view === 'culture' ? trends.filter(x => x.tag === 'CULTURE') : trends;
 $('#trendList').innerHTML = chosenTrends.map(t => `<a class="trend-link" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer"><span>${esc(t.title)}</span><span>${esc(t.tag)} ↗</span></a>`).join('');
}
async function loadLiveData() {
 if (loading) return;
 loading = true;
 $('#refresh').disabled = true;
 $('#sourceState').textContent = 'ОБНОВЛЕНИЕ';
 $('#notice').classList.remove('error');
 $('#notice').textContent = 'Проверяем открытые источники. Недоступные фиды останутся помеченными как внешние ссылки.';
 const statuses = [];
 // These feeds are optional enhancements. Core UI remains usable if CORS or provider limits block requests.
 const jobs = [
  (async () => {
   try {
    const response = await fetch('https://store.steampowered.com/feeds/news/app/593110/?cc=us&l=en', { headers: { Accept: 'application/atom+xml,application/xml,text/xml' }, signal: AbortSignal.timeout(7000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const xmlText = await response.text();
    const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (xml.querySelector('parsererror')) throw new Error('Invalid XML feed');
    const entries = [...xml.querySelectorAll('entry')].slice(0,3);
    if (!entries.length) throw new Error('No entries');
    entries.forEach(entry => {
     const title = entry.querySelector('title')?.textContent?.trim();
     const link = entry.querySelector('link')?.getAttribute('href');
     if (title && link) items.unshift({ id:'gaming', label:'GAMING / STEAM NEWS', icon:'🎮', title, description:'Публикация из открытого фида Steam News. Проверь дату и детали на странице источника.', url:link, status:'FEED OK', dynamic:true });
    });
    statuses.push('Steam: feed OK');
   } catch (error) { statuses.push('Steam: source link fallback'); }
  })(),
  (async () => {
   try {
    const response = await fetch('https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard', { signal: AbortSignal.timeout(7000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const events = (data.events || []).slice(0,3);
    if (!events.length) throw new Error('No events');
    events.forEach(event => {
     const competition = event.competitions?.[0];
     const teams = (competition?.competitors || []).map(team => team.team?.displayName).filter(Boolean);
     const state = competition?.status?.type?.shortDetail || 'Schedule';
     items.unshift({ id:'sport', label:'SPORT / FOOTBALL', icon:'🏆', title:teams.join(' vs ') || event.name || 'Матч', description:`${state}. Данные из открытого scoreboard ESPN; время и статус проверяй на странице источника.`, url:event.links?.[0]?.href || 'https://www.espn.com/soccer/', status:'FEED OK', dynamic:true });
    });
    statuses.push('ESPN: scoreboard OK');
   } catch (error) { statuses.push('ESPN: source link fallback'); }
  })()
 ];
 await Promise.all(jobs);
 // De-duplicate dynamic items between refreshes.
 const seen = new Set();
 items = items.filter(item => { const key = item.url + item.title; if (seen.has(key)) return false; seen.add(key); return true; });
 render();
 const successful = statuses.filter(x => x.includes('OK')).length;
 $('#sourceState').textContent = successful ? `ИСТОЧНИКОВ ДОСТУПНО: ${successful}/2` : 'ОТКРЫТЫЕ ССЫЛКИ';
 $('#updatedAt').textContent = `Проверено: ${new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit'}).format(new Date())}`;
 $('#notice').textContent = statuses.join(' · ') + '. Если фид заблокирован браузером, доступны прямые ссылки на первоисточники.';
 if (!successful) $('#notice').classList.add('error');
 loading = false;
 $('#refresh').disabled = false;
}
function init() {
 items = sources.map(source => ({ ...source, status:'SOURCE LINK' }));
 $$('.nav-item').forEach(button => button.addEventListener('click', () => {
  prefs.view = button.dataset.view; savePrefs(); render();
  $('.content-head').scrollIntoView({ behavior:'smooth', block:'start' });
 }));
 $$('.chip').forEach(button => button.addEventListener('click', () => {
  const id = button.dataset.interest;
  prefs.interests = prefs.interests.includes(id) ? prefs.interests.filter(x => x !== id) : [...prefs.interests,id];
  savePrefs(); render();
 }));
 $('#search').addEventListener('input', render);
 $('#refresh').addEventListener('click', () => { items = sources.map(source => ({ ...source, status:'SOURCE LINK' })); render(); loadLiveData(); });
 $('#resetPrefs').addEventListener('click', () => { prefs = { ...defaultPrefs, interests:[...defaultPrefs.interests] }; savePrefs(); $('#search').value=''; render(); });
 updateClock(); window.setInterval(updateClock,1000);
 render();
 loadLiveData();
}
init();
