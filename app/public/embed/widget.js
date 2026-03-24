(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════
  // DEFAULTS — all tunable constants in one place
  // ═══════════════════════════════════════════════════════════════
  var DEFAULTS = {
    WIDTH: 350,
    HEIGHT: 420,
    SCALE: 1,
    ANCHOR: 'bottom-right',
    OFFSET_X: 0,
    OFFSET_Y: 0,
    Z_INDEX_BOX: 999998,
    Z_INDEX_CANVAS: 999999,
    RESIZE_DEBOUNCE_MS: 200,
    ITEM_DEFAULT_SIZE: 52,
    ITEM_CORNER_RADIUS: 4,
    PLACEHOLDER_COLOR: 'rgba(180,160,100,0.6)',
    // Responsive scaling: widget scales down between these breakpoints
    RESPONSIVE_MIN_VP: 768,   // viewport width where scale reaches minimum
    RESPONSIVE_MAX_VP: 1280,  // viewport width where scale is 1.0
    RESPONSIVE_MIN_SCALE: 0.6, // minimum responsive scale factor
  };

  // ═══════════════════════════════════════════════════════════════
  // Read config from window.__TB (set by inline IIFE embed code)
  // This is the industry-standard pattern used by Intercom, Hotjar,
  // Google Analytics, etc. — immune to platform HTML sanitization.
  // ═══════════════════════════════════════════════════════════════
  var cfg = window.__TB;
  delete window.__TB; // Clear for potential next widget instance

  if (!cfg || !cfg.boxId) {
    console.error('[treasure-box] Config not found. Use the embed code from your Treasure Box editor.');
    return;
  }

  var boxId = cfg.boxId;
  var origin = cfg.origin || window.location.origin;
  var bg = cfg.bg || 'transparent';
  var scale = parseFloat(cfg.scale) || DEFAULTS.SCALE;
  var width = cfg.width ? parseInt(cfg.width, 10) : Math.round(DEFAULTS.WIDTH * scale);
  var height = cfg.height ? parseInt(cfg.height, 10) : Math.round(DEFAULTS.HEIGHT * scale);
  var mode = cfg.mode || 'overlay';

  // ===== Shared: create embed iframe =====
  function createIframe(w, h, extraParams) {
    var params = 'box=' + encodeURIComponent(boxId) + '&bg=' + encodeURIComponent(bg);
    if (scale !== 1) params += '&scale=' + scale;
    if (extraParams) params += '&' + extraParams;
    var iframe = document.createElement('iframe');
    iframe.src = origin + '/embed?' + params;
    iframe.width = w;
    iframe.height = h;
    iframe.style.border = 'none';
    iframe.style.overflow = 'hidden';
    iframe.style.background = 'transparent';
    iframe.setAttribute('allowtransparency', 'true');
    iframe.loading = 'lazy';
    iframe.setAttribute('allow', 'accelerometer');
    iframe.title = 'Treasure Box';
    return iframe;
  }

  // ===== MODE: CONTAINED =====
  if (mode === 'contained') {
    var container = document.getElementById('treasure-box-embed') || document.body;
    if (!container) return;
    // Read padding from config
    var padTop = parseInt(cfg.padTop || '0', 10) || 0;
    var padRight = parseInt(cfg.padRight || '0', 10) || 0;
    var padBottom = parseInt(cfg.padBottom || '0', 10) || 0;
    var padLeft = parseInt(cfg.padLeft || '0', 10) || 0;
    var padParams = '';
    if (padTop > 0) padParams += '&pt=' + padTop;
    if (padRight > 0) padParams += '&pr=' + padRight;
    if (padBottom > 0) padParams += '&pb=' + padBottom;
    if (padLeft > 0) padParams += '&pl=' + padLeft;
    var iframe = createIframe(width, height, padParams ? padParams.substring(1) : '');
    iframe.style.maxWidth = '100%';
    container.appendChild(iframe);
    return;
  }

  // ===== MODE: OVERLAY (default) =====
  // Box is fixed-positioned on the page; physics runs inside the iframe,
  // body positions are streamed via postMessage and rendered on a host-page canvas.

  var anchor = cfg.anchor || DEFAULTS.ANCHOR;
  var offsetX = cfg.ox != null ? parseInt(cfg.ox, 10) : DEFAULTS.OFFSET_X;
  var offsetY = cfg.oy != null ? parseInt(cfg.oy, 10) : DEFAULTS.OFFSET_Y;

  // Container-relative mode: position inside a specific div instead of viewport
  var containerEl = cfg.container
    ? (typeof cfg.container === 'string' ? document.querySelector(cfg.container) : cfg.container)
    : null;

  // ═══════════════════════════════════════════════════════════════
  // Responsive scaling — shrinks widget proportionally on smaller viewports
  // ═══════════════════════════════════════════════════════════════
  function computeResponsiveScale() {
    var vw = window.innerWidth;
    if (vw >= DEFAULTS.RESPONSIVE_MAX_VP) return 1;
    if (vw <= DEFAULTS.RESPONSIVE_MIN_VP) return DEFAULTS.RESPONSIVE_MIN_SCALE;
    var t = (vw - DEFAULTS.RESPONSIVE_MIN_VP) / (DEFAULTS.RESPONSIVE_MAX_VP - DEFAULTS.RESPONSIVE_MIN_VP);
    return DEFAULTS.RESPONSIVE_MIN_SCALE + t * (1 - DEFAULTS.RESPONSIVE_MIN_SCALE);
  }

  var responsiveScale = computeResponsiveScale();

  // ═══════════════════════════════════════════════════════════════
  // Mobile responsive hiding — skip overlay on narrow viewports
  // ═══════════════════════════════════════════════════════════════
  var mobileQuery = window.matchMedia('(max-width: 767px)');
  if (mobileQuery.matches) return; // Skip all DOM creation on mobile

  // DOM collision opt-in
  var domCollide = cfg.domCollide;
  var domCollideDebug = !!cfg.domCollideDebug;

  // ═══════════════════════════════════════════════════════════════
  // DOM Collision scanning — reads host DOM rects, sends to iframe
  // ═══════════════════════════════════════════════════════════════
  var DOM_COLLIDE_DEFAULTS = 'h1,h2,h3,h4,h5,h6,img,video,[data-tb-collide],article,.card,gallery-slideshow,a,br,.flier';
  var DOM_COLLIDE_MAX = 30;
  var domCollideSelector = '';
  var domCollidePrevRects = [];
  var domCollidePrevScrollX = 0;
  var domCollidePrevScrollY = 0;
  var domCollideMutationTimer = null;

  if (domCollide) {
    if (typeof domCollide === 'string') {
      domCollideSelector = domCollide + ',[data-tb-collide]';
    } else {
      domCollideSelector = DOM_COLLIDE_DEFAULTS;
    }
  }

  function scanDomColliders(iframeEl) {
    if (!domCollideSelector || !iframeEl || !iframeEl.contentWindow) return;
    var elements = document.querySelectorAll(domCollideSelector);
    var rects = [];
    var collected = [];

    for (var i = 0; i < elements.length && rects.length < DOM_COLLIDE_MAX; i++) {
      var el = elements[i];
      // Skip excluded elements
      if (el.hasAttribute('data-tb-no-collide')) continue;
      // Skip widget's own elements
      if (el === boxContainer || el === canvas || boxContainer.contains(el)) continue;
      // Skip hidden elements
      if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') continue;

      var rect = el.getBoundingClientRect();
      // Skip tiny elements
      if (rect.width < 20 || rect.height < 20) continue;
      // Skip off-viewport
      if (rect.bottom < 0 || rect.top > window.innerHeight ||
        rect.right < 0 || rect.left > window.innerWidth) continue;

      // Skip elements fully contained within an already-collected rect
      var contained = false;
      for (var j = 0; j < collected.length; j++) {
        var c = collected[j];
        if (rect.left >= c.left && rect.right <= c.right &&
          rect.top >= c.top && rect.bottom <= c.bottom) {
          contained = true;
          break;
        }
      }
      if (contained) continue;

      collected.push(rect);
      rects.push({
        id: 'dom-' + i,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        width: rect.width,
        height: rect.height,
      });
    }

    domCollidePrevRects = rects;
    domCollidePrevScrollX = window.scrollX;
    domCollidePrevScrollY = window.scrollY;

    iframeEl.contentWindow.postMessage({
      type: 'treasure-box',
      action: 'dom-colliders',
      rects: rects,
    }, '*');
  }

  function onDomCollideScroll(iframeEl) {
    if (!domCollideSelector || !iframeEl || !iframeEl.contentWindow) return;
    var dx = window.scrollX - domCollidePrevScrollX;
    var dy = window.scrollY - domCollidePrevScrollY;
    if (dx === 0 && dy === 0) return;

    // Pure scroll: just send delta for efficient body translation
    domCollidePrevScrollX = window.scrollX;
    domCollidePrevScrollY = window.scrollY;

    iframeEl.contentWindow.postMessage({
      type: 'treasure-box',
      action: 'dom-colliders-scroll',
      deltaX: -dx,
      deltaY: -dy,
    }, '*');
  }

  // 1. Create box container — fixed to viewport or absolute in a parent div
  var boxContainer = document.createElement('div');
  boxContainer.id = 'treasure-box-overlay';
  boxContainer.style.position = containerEl ? 'absolute' : 'fixed';
  boxContainer.style.zIndex = String(DEFAULTS.Z_INDEX_BOX);

  // Apply responsive scale to offsets so the widget hugs edges more on smaller screens
  var effectiveOffsetX = Math.round(offsetX * responsiveScale);
  var effectiveOffsetY = Math.round(offsetY * responsiveScale);

  // Position using anchor + offsets
  if (anchor.indexOf('bottom') !== -1) {
    boxContainer.style.bottom = effectiveOffsetY + 'px';
  } else if (anchor.indexOf('top') !== -1) {
    boxContainer.style.top = effectiveOffsetY + 'px';
  } else {
    // middle — vertically center
    boxContainer.style.top = '50%';
    boxContainer.style.marginTop = '-' + Math.round(height / 2) + 'px';
  }
  if (anchor.indexOf('right') !== -1) {
    boxContainer.style.right = effectiveOffsetX + 'px';
  } else if (anchor.indexOf('left') !== -1) {
    boxContainer.style.left = effectiveOffsetX + 'px';
  } else {
    // center — horizontally center
    boxContainer.style.left = '50%';
    boxContainer.style.marginLeft = '-' + Math.round(width / 2) + 'px';
  }

  // 2. Create iframe inside box container — pass anchor/offset params for overlay positioning
  // Size the overlay tightly around the drawer dimensions (no oversized minimums)
  var overlayW = width;
  var overlayH = height;
  boxContainer.style.width = overlayW + 'px';
  boxContainer.style.height = overlayH + 'px';
  var overlayParams = 'mode=overlay&anchor=' + encodeURIComponent(anchor) +
    '&ox=' + offsetX + '&oy=' + offsetY;
  var boxIframe = createIframe(overlayW, overlayH, overlayParams);
  boxIframe.style.pointerEvents = 'none';
  boxContainer.appendChild(boxIframe);

  // Hit zone: small div positioned over the drawer to detect hover intent
  // while the iframe has pointer-events: none
  var hitZone = document.createElement('div');
  hitZone.style.cssText = 'position:absolute;z-index:1;cursor:pointer;display:none;';
  boxContainer.appendChild(hitZone);

  hitZone.addEventListener('mouseenter', function () {
    // Don't re-enable iframe events if items are on host canvas or drag is active
    if (isDraggingItem || frameBodies.length > 0) return;
    boxIframe.style.pointerEvents = 'auto';
    hitZone.style.display = 'none';
  });
  hitZone.addEventListener('touchstart', function () {
    if (isDraggingItem || frameBodies.length > 0) return;
    boxIframe.style.pointerEvents = 'auto';
    hitZone.style.display = 'none';
  }, { passive: true });

  // Safety net: if mouse leaves iframe without triggering drawer interaction,
  // re-disable pointer events so host page stays interactive
  boxIframe.addEventListener('mouseleave', function () {
    if (isDraggingItem) return;
    setTimeout(function () {
      if (isDraggingItem || frameBodies.length > 0) return;
      if (boxIframe.style.pointerEvents === 'auto' && hitZone.style.display === 'none') {
        boxIframe.style.pointerEvents = 'none';
        hitZone.style.display = 'block';
      }
    }, 100);
  });

  // ═══════════════════════════════════════════════════════════════
  // CSS Transform Ancestor Detection
  // When position:fixed is inside a CSS-transformed ancestor
  // (common in Readymag, Webflow, Squarespace, Framer),
  // it becomes relative to that ancestor instead of the viewport.
  // Fix: append widget elements to <html> (documentElement) so they
  // are siblings of <body>, not descendants — unaffected by its transform.
  // ═══════════════════════════════════════════════════════════════
  var fixedParent = document.body;
  (function detectTransformAncestor() {
    var probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;visibility:hidden;z-index:-1;';
    document.body.appendChild(probe);
    var r = probe.getBoundingClientRect();
    document.body.removeChild(probe);
    if (Math.abs(r.left) > 1 || Math.abs(r.top) > 1 ||
      Math.abs(r.width - window.innerWidth) > 2 || Math.abs(r.height - window.innerHeight) > 2) {
      // position:fixed is broken inside <body> — use <html> instead
      fixedParent = document.documentElement;
    }
  })();

  // Append to container div (container-relative mode) or fixedParent (viewport mode)
  if (containerEl) {
    // Ensure the container is a positioning context
    var containerPos = getComputedStyle(containerEl).position;
    if (containerPos === 'static') containerEl.style.position = 'relative';
    containerEl.appendChild(boxContainer);
  } else {
    fixedParent.appendChild(boxContainer);
  }

  // 3. Create full-viewport canvas overlay (renders items streamed from iframe physics)
  var canvas = document.createElement('canvas');
  canvas.id = 'treasure-box-canvas';
  var dpr = window.devicePixelRatio || 1;
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;' +
    'pointer-events:none;z-index:' + DEFAULTS.Z_INDEX_CANVAS + ';';
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  fixedParent.appendChild(canvas);
  var ctx = canvas.getContext('2d');
  if (ctx) ctx.scale(dpr, dpr);

  // ═══════════════════════════════════════════════════════════════
  // Mobile responsive: hide/show on viewport resize across breakpoint
  // ═══════════════════════════════════════════════════════════════
  function updateMobileVisibility() {
    var hidden = mobileQuery.matches;
    boxContainer.style.display = hidden ? 'none' : '';
    canvas.style.display = hidden ? 'none' : '';
  }
  mobileQuery.addEventListener('change', updateMobileVisibility);

  // State: latest frame data from iframe physics engine
  var frameBodies = [];
  var frameEffects = { brightness: 1, contrast: 1, tint: undefined };
  var itemImages = {};

  // Drawer interaction state: track drawer rect + state from iframe for forwarding
  var drawerRect = null;
  var isHoveringDrawer = false;

  // Drag tracking: when the user drags an item, we forward host-page mouse events
  // into the iframe so the drag continues even when the cursor leaves the iframe boundary.
  var isDraggingItem = false;

  // ═══════════════════════════════════════════════════════════════
  // Canvas interaction state machine
  // ═══════════════════════════════════════════════════════════════
  var canvasDragBody = null;       // body being interacted with
  var canvasDragStartPos = null;   // { x, y } of mousedown
  var canvasDidDrag = false;       // moved > 5px?
  var canvasLongPressFired = false;
  var canvasLongPressTimer = null;
  var canvasLastClickBody = null;  // body ID of last click (for double-click)
  var canvasLastClickTime = 0;     // timestamp of last click

  // Hit test: bounding circle against frameBodies (back-to-front for correct z-order)
  function hitTestBodies(clientX, clientY) {
    for (var i = frameBodies.length - 1; i >= 0; i--) {
      var body = frameBodies[i];
      var dx = clientX - body.x;
      var dy = clientY - body.y;
      var radius = (body.width || DEFAULTS.ITEM_DEFAULT_SIZE) / 2;
      if (dx * dx + dy * dy <= radius * radius) return body;
    }
    return null;
  }

  // Helper: send mouse-down to iframe physics to grab a body
  function startHostCanvasDrag(clientX, clientY) {
    isDraggingItem = true;
    document.body.style.cursor = 'grabbing';
    var iframeRect = boxIframe.getBoundingClientRect();
    boxIframe.contentWindow.postMessage({
      type: 'treasure-box-host',
      action: 'mouse-down',
      x: clientX - iframeRect.left,
      y: clientY - iframeRect.top,
    }, '*');
    document.addEventListener('mousemove', onHostMouseMove, true);
    document.addEventListener('mouseup', onHostMouseUp, true);
    document.addEventListener('touchmove', onHostTouchMove, { capture: true, passive: false });
    document.addEventListener('touchend', onHostTouchEnd, true);
  }

  // Helper: send mouse-up to iframe physics
  function sendMouseUpToIframe(clientX, clientY) {
    var iframeRect = boxIframe.getBoundingClientRect();
    boxIframe.contentWindow.postMessage({
      type: 'treasure-box-host',
      action: 'mouse-up',
      x: clientX - iframeRect.left,
      y: clientY - iframeRect.top,
    }, '*');
  }

  // Helper: check if a point (in client coords) is inside the drawer rect
  function isInsideDrawerRect(clientX, clientY) {
    if (!drawerRect) return false;
    var containerRect = boxContainer.getBoundingClientRect();
    var dx = clientX - containerRect.left;
    var dy = clientY - containerRect.top;
    return dx >= drawerRect.x && dx <= drawerRect.x + drawerRect.width &&
      dy >= drawerRect.y && dy <= drawerRect.y + drawerRect.height;
  }


  function onHostMouseMove(e) {
    if (!isDraggingItem) return;
    // Drag threshold detection for canvas interactions
    if (canvasDragStartPos && !canvasDidDrag) {
      var dx = e.clientX - canvasDragStartPos.x;
      var dy = e.clientY - canvasDragStartPos.y;
      if (dx * dx + dy * dy > 25) {
        canvasDidDrag = true;
        if (canvasLongPressTimer) { clearTimeout(canvasLongPressTimer); canvasLongPressTimer = null; }
      }
    }
    // Forward to iframe
    var iframeRect = boxIframe.getBoundingClientRect();
    boxIframe.contentWindow.postMessage({
      type: 'treasure-box-host',
      action: 'mouse-move',
      x: e.clientX - iframeRect.left,
      y: e.clientY - iframeRect.top,
    }, '*');
  }

  function onHostMouseUp(e) {
    if (!isDraggingItem) return;
    // Cancel long-press timer
    if (canvasLongPressTimer) { clearTimeout(canvasLongPressTimer); canvasLongPressTimer = null; }

    // Send mouse-up to iframe
    sendMouseUpToIframe(e.clientX, e.clientY);

    // Interaction resolution (only for canvas-initiated, not iframe-initiated)
    if (canvasDragBody && !canvasDidDrag && !canvasLongPressFired) {
      var bodyId = canvasDragBody.id;
      var now = Date.now();
      if (canvasLastClickBody === bodyId && now - canvasLastClickTime < 400) {
        // Double-click: open link (within user gesture = popup blocker safe)
        if (canvasDragBody.link) {
          window.open(canvasDragBody.link, '_blank', 'noopener,noreferrer');
        }
        canvasLastClickBody = null;
        canvasLastClickTime = 0;
      } else {
        canvasLastClickBody = bodyId;
        canvasLastClickTime = now;
      }
    }

    // Reset state
    canvasDragBody = null;
    canvasDragStartPos = null;
    isDraggingItem = false;
    document.body.style.cursor = '';
    document.removeEventListener('mousemove', onHostMouseMove, true);
    document.removeEventListener('mouseup', onHostMouseUp, true);
    document.removeEventListener('touchmove', onHostTouchMove, true);
    document.removeEventListener('touchend', onHostTouchEnd, true);
  }

  function onHostTouchMove(e) {
    if (!isDraggingItem || !e.touches[0]) return;
    e.preventDefault();
    // Drag threshold detection for canvas interactions
    if (canvasDragStartPos && !canvasDidDrag) {
      var dx = e.touches[0].clientX - canvasDragStartPos.x;
      var dy = e.touches[0].clientY - canvasDragStartPos.y;
      if (dx * dx + dy * dy > 25) {
        canvasDidDrag = true;
        if (canvasLongPressTimer) { clearTimeout(canvasLongPressTimer); canvasLongPressTimer = null; }
      }
    }
    var iframeRect = boxIframe.getBoundingClientRect();
    boxIframe.contentWindow.postMessage({
      type: 'treasure-box-host',
      action: 'mouse-move',
      x: e.touches[0].clientX - iframeRect.left,
      y: e.touches[0].clientY - iframeRect.top,
    }, '*');
  }

  function onHostTouchEnd(e) {
    if (!isDraggingItem) return;
    // Cancel long-press timer
    if (canvasLongPressTimer) { clearTimeout(canvasLongPressTimer); canvasLongPressTimer = null; }

    // Determine position from changedTouches for interaction resolution
    var clientX = 0, clientY = 0;
    if (e.changedTouches && e.changedTouches[0]) {
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    }

    sendMouseUpToIframe(clientX, clientY);

    // Interaction resolution (only for canvas-initiated touch)
    if (canvasDragBody && !canvasDidDrag && !canvasLongPressFired) {
      var bodyId = canvasDragBody.id;
      var now = Date.now();
      if (canvasLastClickBody === bodyId && now - canvasLastClickTime < 400) {
        if (canvasDragBody.link) {
          window.open(canvasDragBody.link, '_blank', 'noopener,noreferrer');
        }
        canvasLastClickBody = null;
        canvasLastClickTime = 0;
      } else {
        canvasLastClickBody = bodyId;
        canvasLastClickTime = now;
      }
    }

    // Reset state
    canvasDragBody = null;
    canvasDragStartPos = null;
    isDraggingItem = false;
    document.body.style.cursor = '';
    document.removeEventListener('mousemove', onHostMouseMove, true);
    document.removeEventListener('mouseup', onHostMouseUp, true);
    document.removeEventListener('touchmove', onHostTouchMove, true);
    document.removeEventListener('touchend', onHostTouchEnd, true);
  }

  // ═══════════════════════════════════════════════════════════════
  // Story overlay (full-screen DOM overlay on host page)
  // ═══════════════════════════════════════════════════════════════
  var storyOverlay = null;

  // Inject reactive CSS custom properties for story overlay theming.
  // Uses @media (prefers-color-scheme) so it auto-switches with OS setting,
  // and also checks host page data-theme attribute for manual toggles.
  function injectStoryStyles() {
    if (document.querySelector('style[data-tb-story-vars]')) return;
    var style = document.createElement('style');
    style.setAttribute('data-tb-story-vars', '1');
    style.textContent =
      ':root {' +
      '--tbs-bg:#0e0e0e;--tbs-border:#3a3a34;--tbs-border-subtle:#2a2a26;' +
      '--tbs-fg:#b8b8a8;--tbs-fg-muted:#8a8a7a;--tbs-fg-faint:#5e5e52;' +
      '--tbs-accent:#d0b888;--tbs-accent-hover:#e0c898;' +
      '}' +
      '@media(prefers-color-scheme:light){:root{' +
      '--tbs-bg:#f5f2ec;--tbs-border:#d0ccc2;--tbs-border-subtle:#ddd9d0;' +
      '--tbs-fg:#3a3832;--tbs-fg-muted:#6a685e;--tbs-fg-faint:#9a9888;' +
      '--tbs-accent:#8a6a3a;--tbs-accent-hover:#7a5a2a;' +
      '}}' +
      '[data-theme="light"]{' +
      '--tbs-bg:#f5f2ec;--tbs-border:#d0ccc2;--tbs-border-subtle:#ddd9d0;' +
      '--tbs-fg:#3a3832;--tbs-fg-muted:#6a685e;--tbs-fg-faint:#9a9888;' +
      '--tbs-accent:#8a6a3a;--tbs-accent-hover:#7a5a2a;' +
      '}' +
      '[data-theme="dark"]{' +
      '--tbs-bg:#0e0e0e;--tbs-border:#3a3a34;--tbs-border-subtle:#2a2a26;' +
      '--tbs-fg:#b8b8a8;--tbs-fg-muted:#8a8a7a;--tbs-fg-faint:#5e5e52;' +
      '--tbs-accent:#d0b888;--tbs-accent-hover:#e0c898;' +
      '}';
    document.head.appendChild(style);
  }

  function showStoryOverlay(body) {
    if (storyOverlay) dismissStoryOverlay();

    injectStoryStyles();

    // Inject font if not already present
    if (!document.querySelector('link[data-tb-story-font]')) {
      var fontLink = document.createElement('link');
      fontLink.rel = 'stylesheet';
      fontLink.setAttribute('data-tb-story-font', '1');
      fontLink.href = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700&family=Inconsolata:wght@400;600&display=swap';
      document.head.appendChild(fontLink);
    }

    storyOverlay = document.createElement('div');
    storyOverlay.style.cssText = 'position:fixed;inset:0;z-index:10000000;display:flex;' +
      'align-items:center;justify-content:center;background:rgba(0,0,0,0.82);cursor:pointer;';

    var card = document.createElement('div');
    card.style.cssText = 'background:var(--tbs-bg);border:1px solid var(--tbs-border);padding:32px 36px 28px;' +
      'border-radius:2px;max-width:420px;width:calc(100% - 40px);';
    card.addEventListener('click', function (e) { e.stopPropagation(); });

    if (body.imageUrl) {
      var imgWrap = document.createElement('div');
      imgWrap.style.cssText = 'text-align:center;margin-bottom:20px';
      var img = document.createElement('img');
      img.src = body.imageUrl;
      img.style.cssText = 'max-width:140px;max-height:140px;object-fit:contain;filter:drop-shadow(2px 4px 10px rgba(0,0,0,0.25))';
      imgWrap.appendChild(img);
      card.appendChild(imgWrap);
    }
    if (body.label) {
      var labelEl = document.createElement('div');
      labelEl.style.cssText = 'text-align:center;font-family:"Barlow Condensed",sans-serif;font-weight:700;' +
        'font-size:20px;letter-spacing:0.04em;text-transform:uppercase;line-height:1.1;margin-bottom:8px;color:var(--tbs-fg)';
      labelEl.textContent = body.label;
      card.appendChild(labelEl);
    }
    if (body.story) {
      var storyEl = document.createElement('div');
      storyEl.style.cssText = 'text-align:center;font-family:"Inconsolata",monospace;font-weight:400;' +
        'font-size:13px;line-height:1.75;letter-spacing:0.01em;margin:12px 0 20px;color:var(--tbs-fg-muted)';
      storyEl.textContent = '\u201c' + body.story + '\u201d';
      card.appendChild(storyEl);
    }
    if (body.link) {
      var linkWrap = document.createElement('div');
      linkWrap.style.cssText = 'text-align:center;padding-top:16px;border-top:1px solid var(--tbs-border-subtle)';
      var linkEl = document.createElement('a');
      linkEl.href = body.link;
      linkEl.target = '_blank';
      linkEl.rel = 'noopener noreferrer';
      linkEl.style.cssText = 'font-family:"Inconsolata",monospace;font-weight:600;font-size:12px;' +
        'letter-spacing:0.1em;text-transform:uppercase;text-decoration:none;color:var(--tbs-accent)';
      linkEl.textContent = 'Visit Link \u2192';
      linkEl.addEventListener('mouseenter', function () { linkEl.style.color = 'var(--tbs-accent-hover)'; });
      linkEl.addEventListener('mouseleave', function () { linkEl.style.color = 'var(--tbs-accent)'; });
      linkWrap.appendChild(linkEl);
      card.appendChild(linkWrap);
    }
    var hint = document.createElement('div');
    hint.style.cssText = 'text-align:center;margin-top:20px;font-family:"Inconsolata",monospace;' +
      'font-weight:400;font-size:10px;letter-spacing:0.08em;color:var(--tbs-fg-faint)';
    hint.textContent = 'click anywhere to close';
    card.appendChild(hint);

    storyOverlay.appendChild(card);
    storyOverlay.addEventListener('click', dismissStoryOverlay);
    fixedParent.appendChild(storyOverlay);
  }

  function dismissStoryOverlay() {
    if (storyOverlay) {
      storyOverlay.remove();
      storyOverlay = null;
      // Tell iframe to clear activeStory
      if (boxIframe.contentWindow) {
        boxIframe.contentWindow.postMessage({ type: 'treasure-box-host', action: 'dismiss-story' }, '*');
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Document-level interaction handlers
  // Canvas stays pointer-events:none permanently — it's a render-only surface.
  // All interaction is detected via document-level listeners so host-page
  // hover states, links, and clicks work unimpeded.
  // ═══════════════════════════════════════════════════════════════

  // Cursor feedback + drawer hover detection (document-level, always fires)
  document.addEventListener('mousemove', function (e) {
    if (frameBodies.length === 0 || isDraggingItem) return;
    var onItem = hitTestBodies(e.clientX, e.clientY);
    var onDrawer = isInsideDrawerRect(e.clientX, e.clientY);

    // Cursor feedback on body (canvas has no pointer-events)
    document.body.style.cursor = onItem ? 'grab' : (onDrawer ? 'pointer' : '');

    // Drawer hover state forwarding (mirrors handleCanvasMouseMove in TreasureBox.tsx)
    if (onDrawer && !isHoveringDrawer) {
      isHoveringDrawer = true;
      boxIframe.contentWindow.postMessage({
        type: 'treasure-box-host', action: 'drawer-hover-enter',
      }, '*');
    } else if (!onDrawer && isHoveringDrawer) {
      isHoveringDrawer = false;
      boxIframe.contentWindow.postMessage({
        type: 'treasure-box-host', action: 'drawer-hover-leave',
      }, '*');
    }
  }, true);

  // Mousedown: item drag or drawer click (document-level, capture phase)
  document.addEventListener('mousedown', function (e) {
    if (frameBodies.length === 0) return;
    var hit = hitTestBodies(e.clientX, e.clientY);
    if (hit) {
      e.preventDefault();
      e.stopPropagation();
      canvasDragBody = hit;
      canvasDragStartPos = { x: e.clientX, y: e.clientY };
      canvasDidDrag = false;
      canvasLongPressFired = false;

      // Start long-press timer (800ms)
      canvasLongPressTimer = setTimeout(function () {
        canvasLongPressFired = true;
        sendMouseUpToIframe(e.clientX, e.clientY);
        if (canvasDragBody) showStoryOverlay(canvasDragBody);
      }, 800);

      startHostCanvasDrag(e.clientX, e.clientY);
    } else if (isInsideDrawerRect(e.clientX, e.clientY)) {
      e.stopPropagation();
      boxIframe.contentWindow.postMessage({
        type: 'treasure-box-host', action: 'drawer-click',
      }, '*');
    }
    // Otherwise: do nothing — event reaches host page naturally
  }, true);

  // Touch: item drag or drawer tap (document-level, capture phase)
  document.addEventListener('touchstart', function (e) {
    if (frameBodies.length === 0 || !e.touches[0]) return;
    var touch = e.touches[0];
    var hit = hitTestBodies(touch.clientX, touch.clientY);
    if (hit) {
      e.preventDefault();
      canvasDragBody = hit;
      canvasDragStartPos = { x: touch.clientX, y: touch.clientY };
      canvasDidDrag = false;
      canvasLongPressFired = false;
      canvasLongPressTimer = setTimeout(function () {
        canvasLongPressFired = true;
        sendMouseUpToIframe(touch.clientX, touch.clientY);
        if (canvasDragBody) showStoryOverlay(canvasDragBody);
      }, 800);
      startHostCanvasDrag(touch.clientX, touch.clientY);
    } else if (isInsideDrawerRect(touch.clientX, touch.clientY)) {
      boxIframe.contentWindow.postMessage({
        type: 'treasure-box-host', action: 'drawer-click',
      }, '*');
    }
    // Otherwise: do nothing — tap reaches host page naturally
  }, { passive: false, capture: true });

  // 4. Send viewport info to iframe so it can create correct walls
  function sendViewportInfo() {
    if (!boxIframe.contentWindow) return;
    var boxRect = boxContainer.getBoundingClientRect();
    boxIframe.contentWindow.postMessage({
      type: 'treasure-box',
      action: 'viewport-info',
      width: window.innerWidth,
      height: window.innerHeight,
      offsetX: boxRect.left,
      offsetY: boxRect.top,
    }, '*');
  }

  // Send viewport info when iframe loads and on resize
  boxIframe.addEventListener('load', function () {
    sendViewportInfo();
    // Initial DOM collider scan after iframe is ready
    if (domCollideSelector) {
      setTimeout(function () { scanDomColliders(boxIframe); }, 300);
    }
  });

  var resizeTimer = null;
  function handleResize() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      // Recompute responsive scale and update offsets
      responsiveScale = computeResponsiveScale();
      effectiveOffsetX = Math.round(offsetX * responsiveScale);
      effectiveOffsetY = Math.round(offsetY * responsiveScale);

      // Update container position offsets
      if (anchor.indexOf('bottom') !== -1) {
        boxContainer.style.bottom = effectiveOffsetY + 'px';
      } else if (anchor.indexOf('top') !== -1) {
        boxContainer.style.top = effectiveOffsetY + 'px';
      }
      if (anchor.indexOf('right') !== -1) {
        boxContainer.style.right = effectiveOffsetX + 'px';
      } else if (anchor.indexOf('left') !== -1) {
        boxContainer.style.left = effectiveOffsetX + 'px';
      }

      // Update canvas size
      var curDpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * curDpr;
      canvas.height = window.innerHeight * curDpr;
      var resizeCtx = canvas.getContext('2d');
      if (resizeCtx) resizeCtx.scale(curDpr, curDpr);
      // Notify iframe of new viewport
      sendViewportInfo();
      // Full re-scan on resize (element positions may have changed)
      if (domCollideSelector) scanDomColliders(boxIframe);
    }, DEFAULTS.RESIZE_DEBOUNCE_MS);
  }
  window.addEventListener('resize', handleResize, { passive: true });

  // DOM collider event listeners (scroll, mutation)
  if (domCollideSelector) {
    window.addEventListener('scroll', function () {
      onDomCollideScroll(boxIframe);
    }, { passive: true });

    if (typeof MutationObserver !== 'undefined') {
      var domCollideObserver = new MutationObserver(function () {
        if (domCollideMutationTimer) clearTimeout(domCollideMutationTimer);
        domCollideMutationTimer = setTimeout(function () {
          scanDomColliders(boxIframe);
        }, 500);
      });
      domCollideObserver.observe(document.body, { childList: true, subtree: true });
    }
  }

  // 5. Listen for postMessage from iframe
  window.addEventListener('message', function handleMessage(event) {
    if (!event.data || event.data.type !== 'treasure-box') return;

    if (event.data.action === 'item-urls') {
      // Early preload: iframe sends item URLs before physics starts
      var urls = event.data.urls || [];
      for (var j = 0; j < urls.length; j++) {
        if (urls[j].url && !itemImages[urls[j].id]) {
          var preImg = new Image();
          preImg.crossOrigin = 'anonymous';
          preImg.src = urls[j].url;
          itemImages[urls[j].id] = preImg;
        }
      }
    }

    if (event.data.action === 'frame-sync') {
      // Receive body positions from iframe physics engine
      var hadBodies = frameBodies.length > 0;
      frameBodies = event.data.bodies || [];
      frameEffects = event.data.effects || frameEffects;

      // When items first appear on host canvas, disable iframe pointer-events
      // so ALL interaction goes through the host document-level path.
      // This prevents dual-path conflicts at the iframe boundary that cause
      // items to get "stuck" when dragged outside the boxContainer area.
      if (!hadBodies && frameBodies.length > 0) {
        boxIframe.style.pointerEvents = 'none';
        boxContainer.style.pointerEvents = 'none';
        hitZone.style.display = 'none';
      }
      // Canvas stays pointer-events:none — interaction is document-level

      // Preload images for new items
      for (var i = 0; i < frameBodies.length; i++) {
        var body = frameBodies[i];
        if (body.imageUrl && !itemImages[body.id]) {
          var img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = body.imageUrl;
          itemImages[body.id] = img;
        }
      }
    }

    if (event.data.action === 'items-cleared' || event.data.action === 'items-returned') {
      frameBodies = [];
      itemImages = {};
      document.body.style.cursor = '';
      boxContainer.style.pointerEvents = '';
      hitZone.style.display = 'block';
    }

    // Single item returned to drawer via drag
    if (event.data.action === 'item-returned-single' && event.data.itemId) {
      frameBodies = frameBodies.filter(function (b) { return b.id !== event.data.itemId; });
      if (frameBodies.length === 0) {
        document.body.style.cursor = '';
        boxContainer.style.pointerEvents = '';
        hitZone.style.display = 'block';
      }
    }

    if (event.data.action === 'request-viewport-info') {
      sendViewportInfo();
    }

    // Drawer rect: position hit zone over the drawer area + track for interaction forwarding
    if (event.data.action === 'drawer-rect' && event.data.rect) {
      drawerRect = event.data.rect;
      var rect = event.data.rect;
      hitZone.style.left = rect.x + 'px';
      hitZone.style.top = rect.y + 'px';
      hitZone.style.width = rect.width + 'px';
      hitZone.style.height = rect.height + 'px';
      if (boxIframe.style.pointerEvents === 'none') {
        hitZone.style.display = 'block';
      }
      // Ensure container is tall enough for the drawer (only grow once, cap growth
      // to prevent infinite loop with bottom-anchored drawers where each resize
      // pushes the drawer up, increasing rect.y and triggering more growth)
      var neededH = Math.ceil(rect.y + rect.height + 10);
      var currentH = parseInt(boxContainer.style.height, 10) || 0;
      var maxGrowth = Math.round(height * 0.3); // cap at 30% above initial height
      if (neededH > currentH && neededH <= height + maxGrowth) {
        boxContainer.style.height = neededH + 'px';
        boxIframe.height = neededH;
        boxIframe.style.height = neededH + 'px';
        sendViewportInfo();
      }
    }

    // Item drag: forward host-page mouse events into iframe during drag
    if (event.data.action === 'item-drag-start') {
      isDraggingItem = true;
      boxIframe.style.pointerEvents = 'none'; // Force host path during drag
      document.addEventListener('mousemove', onHostMouseMove, true);
      document.addEventListener('mouseup', onHostMouseUp, true);
      document.addEventListener('touchmove', onHostTouchMove, { capture: true, passive: false });
      document.addEventListener('touchend', onHostTouchEnd, true);
    }

    if (event.data.action === 'item-drag-end') {
      isDraggingItem = false;
      document.removeEventListener('mousemove', onHostMouseMove, true);
      document.removeEventListener('mouseup', onHostMouseUp, true);
      document.removeEventListener('touchmove', onHostTouchMove, true);
      document.removeEventListener('touchend', onHostTouchEnd, true);
    }

    // Drawer state: reset interaction state when drawer returns to IDLE
    if (event.data.action === 'drawer-state') {
      if (event.data.state === 'IDLE') {
        boxIframe.style.pointerEvents = 'none';
        hitZone.style.display = 'block';
        isHoveringDrawer = false;
        document.body.style.cursor = '';
      }
    }

    // Story overlay delegation from iframe (long-press initiated inside iframe)
    if (event.data.action === 'show-story' && event.data.item) {
      showStoryOverlay(event.data.item);
    }
    if (event.data.action === 'dismiss-story') {
      dismissStoryOverlay();
    }
  });

  // 6. Render loop — draws items at positions received from iframe
  function renderLoop() {
    if (!ctx) { requestAnimationFrame(renderLoop); return; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (var i = 0; i < frameBodies.length; i++) {
      var body = frameBodies[i];
      var img = itemImages[body.id];
      var size = body.width || DEFAULTS.ITEM_DEFAULT_SIZE;

      ctx.save();
      ctx.translate(body.x, body.y);
      ctx.rotate(body.angle || 0);

      if (body.opacity !== undefined && body.opacity < 1) {
        ctx.globalAlpha = body.opacity;
      }

      if (img && img.complete && img.naturalWidth > 0) {
        var br = frameEffects.brightness || 1;
        var ct = frameEffects.contrast || 1;
        var bw = frameEffects.tint === 'bw';
        if (br !== 1 || ct !== 1 || bw) {
          ctx.filter = 'brightness(' + br + ') contrast(' + ct + ')' + (bw ? ' grayscale(1)' : '');
        }

        var imgAspect = img.naturalWidth / img.naturalHeight;
        var drawW = size;
        var drawH = size;
        if (imgAspect > 1) drawH = size / imgAspect;
        else drawW = size * imgAspect;

        ctx.beginPath();
        ctx.roundRect(-drawW / 2, -drawH / 2, drawW, drawH, DEFAULTS.ITEM_CORNER_RADIUS);
        ctx.clip();
        ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);

        if (frameEffects.tint && frameEffects.tint !== 'bw') {
          ctx.globalCompositeOperation = 'source-atop';
          ctx.fillStyle = frameEffects.tint + '40';
          ctx.fillRect(-drawW / 2, -drawH / 2, drawW, drawH);
          ctx.globalCompositeOperation = 'source-over';
        }
        ctx.filter = 'none';
      } else {
        // Image not yet loaded — skip rendering (no placeholder circle)
        ctx.restore();
        continue;
      }

      ctx.restore();
    }

    // Debug: draw green dashed outlines around DOM collider rects
    if (domCollideDebug && domCollidePrevRects.length > 0) {
      ctx.save();
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      for (var di = 0; di < domCollidePrevRects.length; di++) {
        var dr = domCollidePrevRects[di];
        ctx.strokeRect(dr.x - dr.width / 2, dr.y - dr.height / 2, dr.width, dr.height);
      }
      ctx.restore();
    }

    requestAnimationFrame(renderLoop);
  }

  // Start render loop immediately
  requestAnimationFrame(renderLoop);
})();
