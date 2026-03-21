(function() {
  'use strict';

  // ═══════════════════════════════════════════════════════════════
  // DEFAULTS — all tunable constants in one place
  // ═══════════════════════════════════════════════════════════════
  var DEFAULTS = {
    WIDTH: 350,
    HEIGHT: 300,
    SCALE: 1,
    ANCHOR: 'bottom-right',
    OFFSET_X: 32,
    OFFSET_Y: 32,
    Z_INDEX_BOX: 999999,
    Z_INDEX_CANVAS: 999998,
    RESIZE_DEBOUNCE_MS: 200,
    ITEM_DEFAULT_SIZE: 52,
    ITEM_CORNER_RADIUS: 4,
    PLACEHOLDER_COLOR: 'rgba(180,160,100,0.6)',
  };

  var script = document.currentScript;
  if (!script) return;

  var boxId = script.getAttribute('data-box-id');
  var bg = script.getAttribute('data-bg') || 'transparent';
  var scale = parseFloat(script.getAttribute('data-scale') || String(DEFAULTS.SCALE));
  var rawW = script.getAttribute('data-width');
  var rawH = script.getAttribute('data-height');
  var width = rawW ? parseInt(rawW, 10) : Math.round(DEFAULTS.WIDTH * scale);
  var height = rawH ? parseInt(rawH, 10) : Math.round(DEFAULTS.HEIGHT * scale);
  var mode = script.getAttribute('data-mode') || 'overlay';
  var origin = script.src.replace(/\/embed\/widget\.js.*$/, '');

  if (!boxId) {
    console.error('[treasure-box] Missing data-box-id attribute');
    return;
  }

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
    iframe.loading = 'lazy';
    iframe.setAttribute('allow', 'accelerometer');
    iframe.title = 'Treasure Box';
    return iframe;
  }

  // ===== MODE: CONTAINED =====
  if (mode === 'contained') {
    var container = document.getElementById('treasure-box-embed') || script.parentElement;
    if (!container) return;
    // Read padding attributes
    var padTop = parseInt(script.getAttribute('data-pad-top') || '0', 10) || 0;
    var padRight = parseInt(script.getAttribute('data-pad-right') || '0', 10) || 0;
    var padBottom = parseInt(script.getAttribute('data-pad-bottom') || '0', 10) || 0;
    var padLeft = parseInt(script.getAttribute('data-pad-left') || '0', 10) || 0;
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

  var anchor = script.getAttribute('data-anchor') || DEFAULTS.ANCHOR;
  var offsetX = parseInt(script.getAttribute('data-offset-x') || String(DEFAULTS.OFFSET_X), 10);
  var offsetY = parseInt(script.getAttribute('data-offset-y') || String(DEFAULTS.OFFSET_Y), 10);

  // DOM collision opt-in
  var domCollide = script.getAttribute('data-dom-collide') === 'true';

  // 1. Create fixed-position box container
  var boxContainer = document.createElement('div');
  boxContainer.id = 'treasure-box-overlay';
  boxContainer.style.position = 'fixed';
  boxContainer.style.zIndex = String(DEFAULTS.Z_INDEX_BOX);
  boxContainer.style.width = width + 'px';
  boxContainer.style.height = height + 'px';

  // Position using anchor + offsets
  if (anchor.indexOf('bottom') !== -1) {
    boxContainer.style.bottom = offsetY + 'px';
  } else {
    boxContainer.style.top = offsetY + 'px';
  }
  if (anchor.indexOf('right') !== -1) {
    boxContainer.style.right = offsetX + 'px';
  } else {
    boxContainer.style.left = offsetX + 'px';
  }

  // 2. Create iframe inside box container — pass anchor/offset params for overlay positioning
  var overlayParams = 'mode=overlay&anchor=' + encodeURIComponent(anchor) +
    '&ox=' + offsetX + '&oy=' + offsetY;
  var boxIframe = createIframe(width, height, overlayParams);
  boxContainer.appendChild(boxIframe);
  document.body.appendChild(boxContainer);

  // 3. Create full-viewport canvas overlay (renders items streamed from iframe physics)
  var canvas = document.createElement('canvas');
  canvas.id = 'treasure-box-canvas';
  var dpr = window.devicePixelRatio || 1;
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;' +
    'pointer-events:none;z-index:' + DEFAULTS.Z_INDEX_CANVAS + ';';
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  document.body.appendChild(canvas);
  var ctx = canvas.getContext('2d');
  if (ctx) ctx.scale(dpr, dpr);

  // State: latest frame data from iframe physics engine
  var frameBodies = [];
  var frameEffects = { brightness: 1, contrast: 1, tint: undefined };
  var itemImages = {};

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
  boxIframe.addEventListener('load', function() {
    sendViewportInfo();
  });

  var resizeTimer = null;
  function handleResize() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() {
      // Update canvas size
      var curDpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * curDpr;
      canvas.height = window.innerHeight * curDpr;
      var resizeCtx = canvas.getContext('2d');
      if (resizeCtx) resizeCtx.scale(curDpr, curDpr);
      // Notify iframe of new viewport
      sendViewportInfo();
    }, DEFAULTS.RESIZE_DEBOUNCE_MS);
  }
  window.addEventListener('resize', handleResize, { passive: true });

  // 5. Listen for postMessage from iframe
  window.addEventListener('message', function handleMessage(event) {
    if (!event.data || event.data.type !== 'treasure-box') return;

    if (event.data.action === 'frame-sync') {
      // Receive body positions from iframe physics engine
      frameBodies = event.data.bodies || [];
      frameEffects = event.data.effects || frameEffects;

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
    }

    if (event.data.action === 'request-viewport-info') {
      sendViewportInfo();
    }
  });

  // 6. Render loop — draws items at positions received from iframe
  function renderLoop() {
    if (!ctx) { requestAnimationFrame(renderLoop); return; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (var i = 0; i < frameBodies.length; i++) {
      var body = frameBodies[i];
      var img = itemImages[body.id];
      var size = (body.width || DEFAULTS.ITEM_DEFAULT_SIZE) * (body.scale || 1);

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
        ctx.fillStyle = DEFAULTS.PLACEHOLDER_COLOR;
        ctx.beginPath();
        ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    requestAnimationFrame(renderLoop);
  }

  // Start render loop immediately
  requestAnimationFrame(renderLoop);
})();
