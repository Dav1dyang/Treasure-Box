(function() {
  'use strict';

  var script = document.currentScript;
  if (!script) return;

  var boxId = script.getAttribute('data-box-id');
  var bg = script.getAttribute('data-bg') || 'transparent';
  var width = parseInt(script.getAttribute('data-width') || '500', 10);
  var height = parseInt(script.getAttribute('data-height') || '500', 10);
  var mode = script.getAttribute('data-mode') || 'contained';
  var scale = parseFloat(script.getAttribute('data-scale') || '1');
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
    var iframe = createIframe(width, height);
    iframe.style.maxWidth = '100%';
    container.appendChild(iframe);
    return;
  }

  // ===== MODE: FLOATING =====
  if (mode === 'floating') {
    var anchor = script.getAttribute('data-anchor') || 'bottom-right';
    var offsetX = parseFloat(script.getAttribute('data-offset-x') || '5');
    var offsetY = parseFloat(script.getAttribute('data-offset-y') || '5');

    // Wrapper: fixed position
    var wrapper = document.createElement('div');
    wrapper.id = 'treasure-box-floating';
    wrapper.style.position = 'fixed';
    wrapper.style.zIndex = '999999';
    wrapper.style.transition = 'all 0.3s ease';

    // Position based on anchor corner
    if (anchor.indexOf('bottom') !== -1) wrapper.style.bottom = offsetY + '%';
    else wrapper.style.top = offsetY + '%';
    if (anchor.indexOf('right') !== -1) wrapper.style.right = offsetX + '%';
    else wrapper.style.left = offsetX + '%';

    var iframe = createIframe(width, height);
    iframe.style.borderRadius = '8px';
    iframe.style.boxShadow = '0 8px 32px rgba(0,0,0,0.3)';

    // Collapse/expand toggle
    var toggle = document.createElement('button');
    toggle.textContent = '\u2212'; // minus sign
    toggle.style.cssText = 'position:absolute;top:-12px;right:-12px;width:24px;height:24px;' +
      'border-radius:50%;border:1px solid rgba(255,255,255,0.2);background:rgba(0,0,0,0.7);' +
      'color:#fff;font-size:14px;cursor:pointer;z-index:1;display:flex;align-items:center;' +
      'justify-content:center;line-height:1;padding:0;';

    var collapsed = false;
    toggle.addEventListener('click', function() {
      collapsed = !collapsed;
      iframe.style.display = collapsed ? 'none' : 'block';
      toggle.textContent = collapsed ? '\u25A1' : '\u2212'; // square or minus
      wrapper.style.width = collapsed ? '24px' : '';
      wrapper.style.height = collapsed ? '24px' : '';
    });

    wrapper.style.position = 'fixed';
    wrapper.appendChild(iframe);
    wrapper.appendChild(toggle);
    document.body.appendChild(wrapper);
    return;
  }

  // ===== MODE: FULLPAGE =====
  if (mode === 'fullpage') {
    var pinAnchor = script.getAttribute('data-pin-anchor') || 'bottom-right';
    var pinX = parseFloat(script.getAttribute('data-pin-x') || '5');
    var pinY = parseFloat(script.getAttribute('data-pin-y') || '5');

    // 1. Create pinned box container
    var boxContainer = document.createElement('div');
    boxContainer.id = 'treasure-box-pinned';
    boxContainer.style.position = 'fixed';
    boxContainer.style.zIndex = '999999';
    boxContainer.style.width = width + 'px';
    boxContainer.style.height = height + 'px';

    if (pinAnchor.indexOf('bottom') !== -1) boxContainer.style.bottom = pinY + '%';
    else boxContainer.style.top = pinY + '%';
    if (pinAnchor.indexOf('right') !== -1) boxContainer.style.right = pinX + '%';
    else boxContainer.style.left = pinX + '%';

    var boxIframe = createIframe(width, height, 'mode=fullpage');
    boxContainer.appendChild(boxIframe);
    document.body.appendChild(boxContainer);

    // 2. Create full-page canvas overlay
    var canvas = document.createElement('canvas');
    canvas.id = 'treasure-box-overlay';
    var dpr = window.devicePixelRatio || 1;
    canvas.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;' +
      'pointer-events:none;z-index:999998;';
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    document.body.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(dpr, dpr);

    // 3. Load Matter.js dynamically
    var matterScript = document.createElement('script');
    matterScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.20.0/matter.min.js';
    matterScript.onload = function() { initFullpagePhysics(); };
    document.head.appendChild(matterScript);

    var engine, world, runner;
    var itemBodies = [];
    var itemImages = {};
    var domBodies = [];

    function initFullpagePhysics() {
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

      // Scan DOM for collision elements
      scanDOMElements();

      // Re-scan on scroll/resize (debounced)
      var scanTimer = null;
      function debouncedScan() {
        if (scanTimer) clearTimeout(scanTimer);
        scanTimer = setTimeout(function() {
          clearDOMBodies();
          scanDOMElements();
          // Also update canvas size with DPR
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
        if (el.closest('#treasure-box-pinned') || el.closest('#treasure-box-overlay')) continue;

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
        itemBodies.forEach(function(ib) {
          Matter.Composite.remove(world, ib.body);
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
        var size = 52 * scale;

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

    return;
  }

  // Fallback: unknown mode, use contained
  console.warn('[treasure-box] Unknown mode "' + mode + '", falling back to contained');
  var container = document.getElementById('treasure-box-embed') || script.parentElement;
  if (!container) return;
  var iframe = createIframe(width, height);
  iframe.style.maxWidth = '100%';
  container.appendChild(iframe);
})();
