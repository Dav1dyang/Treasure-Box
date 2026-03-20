(function() {
  'use strict';

  const script = document.currentScript;
  if (!script) return;

  const boxId = script.getAttribute('data-box-id');
  const bg = script.getAttribute('data-bg') || '#0e0e0e';
  const width = script.getAttribute('data-width') || '700';
  const height = script.getAttribute('data-height') || '700';

  if (!boxId) {
    console.error('[treasure-box] Missing data-box-id attribute');
    return;
  }

  const container = document.getElementById('treasure-box-embed') || script.parentElement;
  if (!container) return;

  const iframe = document.createElement('iframe');
  const origin = script.src.replace(/\/embed\/widget\.js.*$/, '');
  iframe.src = `${origin}/embed?box=${encodeURIComponent(boxId)}&bg=${encodeURIComponent(bg)}`;
  iframe.width = width;
  iframe.height = height;
  iframe.style.border = 'none';
  iframe.style.overflow = 'hidden';
  iframe.style.maxWidth = '100%';
  iframe.loading = 'lazy';
  iframe.setAttribute('allow', 'accelerometer');
  iframe.title = 'Treasure Box';

  container.appendChild(iframe);
})();
