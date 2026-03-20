(function() {
  'use strict';

  var script = document.currentScript;
  if (!script) return;

  var boxId = script.getAttribute('data-box-id');
  var bg = script.getAttribute('data-bg') || 'transparent';
  var width = parseInt(script.getAttribute('data-width') || '350', 10);
  var height = parseInt(script.getAttribute('data-height') || '300', 10);
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
    var iframe = createIframe(width, height);
    iframe.style.maxWidth = '100%';
    container.appendChild(iframe);
    return;
  }

  // ===== MODE: OVERLAY (default) =====
  // Consolidates former "floating" and "fullpage" modes.
  // Box is fixed-positioned on the page; items fly across the entire viewport.

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
  boxContainer.style.position = 'fixed';
  boxContainer.style.zIndex = '999999';
  boxContainer.style.width = width + 'px';
  boxContainer.style.height = height + 'px';

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

  // 2. Create iframe inside box container
  var boxIframe = createIframe(width, height, 'mode=overlay');
  boxContainer.appendChild(boxIframe);
  document.body.appendChild(boxContainer);

  // 3. Create full-viewport canvas overlay
  var canvas = document.createElement('canvas');
  canvas.id = 'treasure-box-canvas';
  var dpr = window.devicePixelRatio || 1;
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;' +
    'pointer-events:none;z-index:999998;';
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  document.body.appendChild(canvas);
  var ctx = canvas.getContext('2d');
  if (ctx) ctx.scale(dpr, dpr);

  // 4. Load Matter.js dynamically
  var matterScript = document.createElement('script');
  matterScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.20.0/matter.min.js';
  matterScript.onload = function() { initOverlayPhysics(); };
  document.head.appendChild(matterScript);

  var engine, world, runner;
  var itemBodies = [];
  var itemImages = {};
  var domBodies = [];

  function initOverlayPhysics() {
    var Matter = window.Matter;
    engine = Matter.Engine.create({ gravity: { x: 0, y: 1 } });
    world = engine.world;
    runner = Matter.Runner.create();
    Matter.Runner.run(runner, engine);

    // Viewport walls
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var wallOpts = { isStatic: true, friction: 0.9, restitution: 0.15 };
    Matter.Composite.add(world, [
      Matter.Bodies.rectangle(vw / 2, vh + 25, vw, 50, wallOpts), // floor
      Matter.Bodies.rectangle(vw / 2, -25, vw, 50, wallOpts),     // ceiling
      Matter.Bodies.rectangle(-25, vh / 2, 50, vh, wallOpts),      // left
      Matter.Bodies.rectangle(vw + 25, vh / 2, 50, vh, wallOpts),  // right
    ]);

    // Optionally scan DOM for collision elements
    if (domCollide) {
      scanDOMElements();
    }

    // Re-scan on scroll/resize (debounced)
    var scanTimer = null;
    function debouncedScan() {
      if (scanTimer) clearTimeout(scanTimer);
      scanTimer = setTimeout(function() {
        if (domCollide) {
          clearDOMBodies();
          scanDOMElements();
        }
        // Update canvas size with DPR
        var curDpr = window.devicePixelRatio || 1;
        canvas.width = window.innerWidth * curDpr;
        canvas.height = window.innerHeight * curDpr;
        var resizeCtx = canvas.getContext('2d');
        if (resizeCtx) resizeCtx.scale(curDpr, curDpr);
      }, 200);
    }
    window.addEventListener('scroll', debouncedScan, { passive: true });
    window.addEventListener('resize', debouncedScan, { passive: true });

    // Render loop
    requestAnimationFrame(renderLoop);

    // Listen for postMessage from iframe
    window.addEventListener('message', handleMessage);
  }

  function scanDOMElements() {
    var Matter = window.Matter;
    var selectors = 'h1,h2,h3,h4,p,img,button,nav,header,footer,section,article';
    var elements = document.querySelectorAll(selectors);
    var vw = window.innerWidth;
    var vh = window.innerHeight;

    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      // Skip our own elements
      if (el.closest('#treasure-box-overlay') || el.closest('#treasure-box-canvas')) continue;

      var rect = el.getBoundingClientRect();
      // Only include visible elements of significant size
      if (rect.width < 50 || rect.height < 20) continue;
      if (rect.bottom < 0 || rect.top > vh || rect.right < 0 || rect.left > vw) continue;

      var body = Matter.Bodies.rectangle(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
        rect.width,
        rect.height,
        { isStatic: true, friction: 0.5, restitution: 0.2, label: 'dom-' + i }
      );
      Matter.Composite.add(world, body);
      domBodies.push(body);
    }
  }

  function clearDOMBodies() {
    var Matter = window.Matter;
    for (var i = 0; i < domBodies.length; i++) {
      Matter.Composite.remove(world, domBodies[i]);
    }
    domBodies = [];
  }

  function handleMessage(event) {
    if (!event.data || event.data.type !== 'treasure-box') return;
    var Matter = window.Matter;

    if (event.data.action === 'items-escaped') {
      // Items have left the box — create physics bodies for each
      var items = event.data.items || [];
      // Get box iframe position to spawn items from
      var boxRect = boxContainer.getBoundingClientRect();
      var spawnX = boxRect.left + boxRect.width / 2;
      var spawnY = boxRect.top + boxRect.height * 0.3;

      // Acknowledge receipt so iframe stops rendering items locally
      boxIframe.contentWindow.postMessage({
        type: 'treasure-box',
        action: 'items-acknowledged'
      }, '*');

      items.forEach(function(item, idx) {
        // Preload image
        var img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = item.imageUrl;
        itemImages[item.id] = img;

        var body = Matter.Bodies.circle(
          spawnX + (Math.random() - 0.5) * 100,
          spawnY,
          25,
          {
            restitution: 0.25,
            friction: 0.7,
            density: 0.003,
            label: 'item-' + item.id,
          }
        );
        // Apply random impulse to scatter items
        Matter.Body.applyForce(body, body.position, {
          x: (Math.random() - 0.5) * 0.05,
          y: -(Math.random() * 0.03 + 0.01),
        });
        Matter.Composite.add(world, body);
        itemBodies.push({ body: body, item: item });
      });
    }

    if (event.data.action === 'items-returned') {
      // Clean up all item bodies
      var Matter2 = window.Matter;
      itemBodies.forEach(function(ib) {
        Matter2.Composite.remove(world, ib.body);
      });
      itemBodies = [];
      itemImages = {};
    }
  }

  function renderLoop() {
    if (!ctx) { requestAnimationFrame(renderLoop); return; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (var i = 0; i < itemBodies.length; i++) {
      var ib = itemBodies[i];
      var pos = ib.body.position;
      var angle = ib.body.angle;
      var img = itemImages[ib.item.id];
      var size = 52;

      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.rotate(angle);

      if (img && img.complete && img.naturalWidth > 0) {
        // Draw image with rounded corners
        ctx.beginPath();
        var r = 6;
        var hs = size / 2;
        ctx.moveTo(-hs + r, -hs);
        ctx.arcTo(hs, -hs, hs, hs, r);
        ctx.arcTo(hs, hs, -hs, hs, r);
        ctx.arcTo(-hs, hs, -hs, -hs, r);
        ctx.arcTo(-hs, -hs, hs, -hs, r);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, -hs, -hs, size, size);
      } else {
        // Fallback: colored circle
        ctx.fillStyle = 'rgba(180,160,100,0.6)';
        ctx.beginPath();
        ctx.arc(0, 0, 25, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      // Draw label below
      if (ib.item.label) {
        ctx.save();
        ctx.font = '9px monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.textAlign = 'center';
        ctx.fillText(ib.item.label, pos.x, pos.y + 34);
        ctx.restore();
      }
    }

    requestAnimationFrame(renderLoop);
  }
})();
