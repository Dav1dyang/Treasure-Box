(function() {
  'use strict';

  var script = document.currentScript;
  if (!script) return;

  var boxId = script.getAttribute('data-box-id');
  var bg = script.getAttribute('data-bg') || 'transparent';
  var scale = parseFloat(script.getAttribute('data-scale') || '1');
  var rawW = script.getAttribute('data-width');
  var rawH = script.getAttribute('data-height');
  var width = rawW ? parseInt(rawW, 10) : Math.round(350 * scale);
  var height = rawH ? parseInt(rawH, 10) : Math.round(300 * scale);
  var mode = script.getAttribute('data-mode') || 'overlay';
  var origin = script.src.replace(/\/embed\/widget\.js.*$/, '');

  if (!boxId) {
    console.error('[treasure-box] Missing data-box-id attribute');
    return;
  }

  // ===== Backward compat: map legacy modes to overlay =====
  if (mode === 'floating' || mode === 'fullpage') {
    mode = 'overlay';
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
    iframe.style.background = 'transparent';
    iframe.setAttribute('allowtransparency', 'true');
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
  // Consolidates former "floating" and "fullpage" modes.
  // Box is fixed-positioned on the page; physics runs inside the iframe,
  // body positions are streamed via postMessage and rendered on a host-page canvas.

  // Read position — support both new (px) and legacy (%) formats
  var anchor = script.getAttribute('data-anchor')
    || script.getAttribute('data-pin-anchor')
    || 'bottom-right';
  var rawOffsetX = script.getAttribute('data-offset-x')
    || script.getAttribute('data-pin-x')
    || '32';
  var rawOffsetY = script.getAttribute('data-offset-y')
    || script.getAttribute('data-pin-y')
    || '32';

  // Detect if offsets are percentages (legacy) or pixels (new)
  var offsetXIsPercent = rawOffsetX.indexOf('%') !== -1 || parseFloat(rawOffsetX) <= 50;
  var offsetYIsPercent = rawOffsetY.indexOf('%') !== -1 || parseFloat(rawOffsetY) <= 50;
  var offsetXVal = parseFloat(rawOffsetX);
  var offsetYVal = parseFloat(rawOffsetY);

  // DOM collision opt-in
  var domCollide = script.getAttribute('data-dom-collide') === 'true';

  // 1. Create fixed-position box container
  var boxContainer = document.createElement('div');
  boxContainer.id = 'treasure-box-overlay';
  boxContainer.style.cssText = 'all:initial;position:fixed;z-index:999999;' +
    'width:' + width + 'px;height:' + height + 'px;';

  // Position using anchor + offsets
  if (anchor.indexOf('bottom') !== -1) {
    boxContainer.style.bottom = offsetYIsPercent ? offsetYVal + '%' : offsetYVal + 'px';
  } else {
    boxContainer.style.top = offsetYIsPercent ? offsetYVal + '%' : offsetYVal + 'px';
  }
  if (anchor.indexOf('right') !== -1) {
    boxContainer.style.right = offsetXIsPercent ? offsetXVal + '%' : offsetXVal + 'px';
  } else {
    boxContainer.style.left = offsetXIsPercent ? offsetXVal + '%' : offsetXVal + 'px';
  }

  // 2. Create iframe inside box container — pass anchor/offset params for overlay positioning
  var overlayParams = 'mode=overlay&anchor=' + encodeURIComponent(anchor) +
    '&ox=' + Math.round(offsetXVal) + '&oy=' + Math.round(offsetYVal);
  var boxIframe = createIframe(width, height, overlayParams);
  boxContainer.appendChild(boxIframe);
  document.body.appendChild(boxContainer);

  // 3. Create full-viewport canvas overlay (renders items streamed from iframe physics)
  var canvas = document.createElement('canvas');
  canvas.id = 'treasure-box-canvas';
  var dpr = window.devicePixelRatio || 1;
  canvas.style.cssText = 'all:initial;position:fixed;top:0;left:0;width:100vw;height:100vh;' +
    'pointer-events:none;z-index:999998;';
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
    }, 200);
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

    // Legacy support: items-escaped still works for backward compat
    if (event.data.action === 'items-escaped') {
      var items = event.data.items || [];
      if (event.data.itemEffects) frameEffects = event.data.itemEffects;
      for (var j = 0; j < items.length; j++) {
        var item = items[j];
        if (!itemImages[item.id]) {
          var legacyImg = new Image();
          legacyImg.crossOrigin = 'anonymous';
          legacyImg.src = item.imageUrl;
          itemImages[item.id] = legacyImg;
        }
      }
      // Acknowledge receipt
      if (boxIframe.contentWindow) {
        boxIframe.contentWindow.postMessage({
          type: 'treasure-box',
          action: 'items-acknowledged'
        }, '*');
      }
    }
  });

  // 6. Render loop — draws items at positions received from iframe
  function renderLoop() {
    if (!ctx) { requestAnimationFrame(renderLoop); return; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (var i = 0; i < frameBodies.length; i++) {
      var body = frameBodies[i];
      var img = itemImages[body.id];
      var size = body.width || 52;

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
        ctx.roundRect(-drawW / 2, -drawH / 2, drawW, drawH, 4);
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
        ctx.fillStyle = 'rgba(180,160,100,0.6)';
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
