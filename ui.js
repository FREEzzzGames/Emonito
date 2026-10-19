/* Mobile panel controls use BEM classes and never reparent content. */
export function setupMobileCollapsibles() {
  const media = window.matchMedia('(max-width: 760px)');
  const panels = Array.from(document.querySelectorAll('.grid > .panel:not(.map-panel)'));
  const apply = () => {
    panels.forEach((panel, index) => {
      const head = panel.querySelector(':scope > .head');
      if (!head) return;
      let button = head.querySelector(':scope > .panel__toggle');
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'panel__toggle';
        button.textContent = '−';
        button.setAttribute('aria-expanded', 'true');
        button.setAttribute('aria-label', 'Свернуть панель');
        head.append(button);
        button.addEventListener('click', () => {
          const collapsed = panel.classList.toggle('panel--collapsed');
          button.textContent = collapsed ? '+' : '−';
          button.setAttribute('aria-expanded', String(!collapsed));
          button.setAttribute('aria-label', collapsed ? 'Развернуть панель' : 'Свернуть панель');
        });
      }
      button.hidden = !media.matches;
      if (!media.matches) {
        panel.classList.remove('panel--collapsed');
        button.textContent = '−';
        button.setAttribute('aria-expanded', 'true');
      } else if (index > 1 && panel.dataset.collapseInitialized !== 'true') {
        panel.classList.add('panel--collapsed');
        panel.dataset.collapseInitialized = 'true';
        button.textContent = '+';
        button.setAttribute('aria-expanded', 'false');
        button.setAttribute('aria-label', 'Развернуть панель');
      }
    });
  };
  apply();
  media.addEventListener('change', apply);
}
