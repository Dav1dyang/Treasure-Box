(function() {
  'use strict';

  // ═══════════════════════════════════════════════════════════════
  // DEFAULTS — all tunable constants in one place
  // ═══════════════════════════════════════════════════════════════
  var DEFAULTS = {
    WIDTH: 350,
    HEIGHT: 420,
    SCALE: 1,
    ANCHOR: 'bottom-right',
    OFFSET_X: 32,
    OFFSET_Y: 32,
    Z_INDEX_BOX: 999998,
    Z_INDEX_CANVAS: 999999,
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
  // Overlay mode: iframe sized to tightly fit the drawer + open-state headroom,
  // avoiding a large invisible area that blocks pointer events on the host page.
  var overlayW = Math.max(width, 420);
  var overlayH = Math.max(height, 350);
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

  hitZone.addEventListener('mouseenter', function() {
    boxIframe.style.pointerEvents = 'auto';
    hitZone.style.display = 'none';
  });
  hitZone.addEventListener('touchstart', function() {
    boxIframe.style.pointerEvents = 'auto';
    hitZone.style.display = 'none';
  }, { passive: true });

  // Safety net: if mouse leaves iframe without triggering drawer interaction,
  // re-disable pointer events so host page stays interactive
  boxIframe.addEventListener('mouseleave', function() {
    if (isDraggingItem) return;
    setTimeout(function() {
      if (isDraggingItem) return;
      if (boxIframe.style.pointerEvents === 'auto' && hitZone.style.display === 'none') {
        boxIframe.style.pointerEvents = 'none';
        hitZone.style.display = 'block';
      }
    }, 100);
  });

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

  // Drawer interaction state: track drawer rect + state from iframe for forwarding
  var currentDrawerState = 'IDLE';
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

  // Helper: pass event through to host page element under canvas
  function passThroughEvent(e, eventType) {
    canvas.style.pointerEvents = 'none';
    var target = document.elementFromPoint(e.clientX, e.clientY);
    canvas.style.pointerEvents = frameBodies.length > 0 ? 'auto' : 'none';
    if (target) {
      target.dispatchEvent(new MouseEvent(eventType || e.type, {
        bubbles: true, cancelable: true,
        clientX: e.clientX, clientY: e.clientY,
        button: e.button, buttons: e.buttons,
      }));
    }
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
    document.removeEventListener('mousemove', onHostMouseMove, true);
    document.removeEventListener('mouseup', onHostMouseUp, true);
    document.removeEventListener('touchmove', onHostTouchMove, true);
    document.removeEventListener('touchend', onHostTouchEnd, true);
  }

  // ═══════════════════════════════════════════════════════════════
  // Story overlay (full-screen DOM overlay on host page)
  // ═══════════════════════════════════════════════════════════════
  var storyOverlay = null;

  function showStoryOverlay(body) {
    if (storyOverlay) dismissStoryOverlay();
    storyOverlay = document.createElement('div');
    storyOverlay.style.cssText = 'position:fixed;inset:0;z-index:10000000;display:flex;' +
      'align-items:center;justify-content:center;background:rgba(0,0,0,0.88);cursor:pointer;font-family:monospace;';

    var card = document.createElement('div');
    card.style.cssText = 'background:#0e0e0e;border:1px solid #3a3a32;padding:28px 32px;' +
      'border-radius:2px;max-width:400px;width:calc(100% - 32px);';
    card.addEventListener('click', function(e) { e.stopPropagation(); });

    if (body.imageUrl) {
      var imgWrap = document.createElement('div');
      imgWrap.style.cssText = 'text-align:center;margin-bottom:16px';
      var img = document.createElement('img');
      img.src = body.imageUrl;
      img.style.cssText = 'max-width:120px;max-height:120px;object-fit:contain;filter:drop-shadow(2px 4px 8px rgba(0,0,0,0.3))';
      imgWrap.appendChild(img);
      card.appendChild(imgWrap);
    }
    if (body.label) {
      var labelEl = document.createElement('div');
      labelEl.style.cssText = 'text-align:center;font-size:14px;font-weight:500;margin-bottom:8px;color:#b0a080';
      labelEl.textContent = body.label;
      card.appendChild(labelEl);
    }
    if (body.story) {
      var storyEl = document.createElement('div');
      storyEl.style.cssText = 'text-align:center;font-size:12px;line-height:1.7;margin-bottom:16px;color:#8a8a7a';
      storyEl.textContent = '\u201c' + body.story + '\u201d';
      card.appendChild(storyEl);
    }
    if (body.link) {
      var linkWrap = document.createElement('div');
      linkWrap.style.cssText = 'text-align:center;padding-top:12px;border-top:1px solid #3a3a32';
      var linkEl = document.createElement('a');
      linkEl.href = body.link;
      linkEl.target = '_blank';
      linkEl.rel = 'noopener noreferrer';
      linkEl.style.cssText = 'color:#8a6a4a;font-size:11px;text-decoration:none';
      linkEl.textContent = '\u2192 visit link';
      linkWrap.appendChild(linkEl);
      card.appendChild(linkWrap);
    }
    var hint = document.createElement('div');
    hint.style.cssText = 'text-align:center;margin-top:16px;font-size:9px;opacity:0.3;color:#8a8a7a';
    hint.textContent = 'click anywhere to close';
    card.appendChild(hint);

    storyOverlay.appendChild(card);
    storyOverlay.addEventListener('click', dismissStoryOverlay);
    document.body.appendChild(storyOverlay);
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
  // Canvas mouse/touch interaction handlers
  // ═══════════════════════════════════════════════════════════════

  // Mousedown on canvas: start interaction with hit item, or pass through
  canvas.addEventListener('mousedown', function(e) {
    var hit = hitTestBodies(e.clientX, e.clientY);
    if (hit) {
      e.preventDefault();
      e.stopPropagation();
      canvasDragBody = hit;
      canvasDragStartPos = { x: e.clientX, y: e.clientY };
      canvasDidDrag = false;
      canvasLongPressFired = false;

      // Start long-press timer (800ms)
      canvasLongPressTimer = setTimeout(function() {
        canvasLongPressFired = true;
        // Release physics body
        sendMouseUpToIframe(e.clientX, e.clientY);
        // Show story overlay
        if (canvasDragBody) {
          showStoryOverlay(canvasDragBody);
        }
      }, 800);

      // Tell iframe physics to grab the body
      startHostCanvasDrag(e.clientX, e.clientY);
    } else {
      // Drawer-aware pass-through
      if (isInsideDrawerRect(e.clientX, e.clientY)) {
        // Forward click to iframe drawer
        boxIframe.style.pointerEvents = 'auto';
        hitZone.style.display = 'none';
        boxIframe.contentWindow.postMessage({
          type: 'treasure-box-host', action: 'drawer-click',
        }, '*');
      } else if (currentDrawerState === 'OPEN' || currentDrawerState === 'HOVER_CLOSE') {
        // Click empty area while drawer open → close drawer
        boxIframe.contentWindow.postMessage({
          type: 'treasure-box-host', action: 'drawer-click',
        }, '*');
      } else {
        passThroughEvent(e);
      }
    }
  });

  // Click pass-through for host page links/buttons in empty canvas areas
  canvas.addEventListener('click', function(e) {
    if (!hitTestBodies(e.clientX, e.clientY)) {
      // Don't pass through clicks that were handled as drawer interactions
      if (isInsideDrawerRect(e.clientX, e.clientY)) return;
      if (currentDrawerState === 'OPEN' || currentDrawerState === 'HOVER_CLOSE') return;
      passThroughEvent(e);
    }
  });

  // Cursor feedback + drawer hover detection
  canvas.addEventListener('mousemove', function(e) {
    if (isDraggingItem) { canvas.style.cursor = 'grabbing'; return; }
    var onItem = hitTestBodies(e.clientX, e.clientY);
    var onDrawer = isInsideDrawerRect(e.clientX, e.clientY);

    // Cursor feedback
    canvas.style.cursor = onItem ? 'grab' : (onDrawer ? 'pointer' : 'default');

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
  });

  // Touch support: same state machine as mouse
  canvas.addEventListener('touchstart', function(e) {
    if (!e.touches[0]) return;
    var touch = e.touches[0];
    var hit = hitTestBodies(touch.clientX, touch.clientY);
    if (hit) {
      e.preventDefault();
      canvasDragBody = hit;
      canvasDragStartPos = { x: touch.clientX, y: touch.clientY };
      canvasDidDrag = false;
      canvasLongPressFired = false;
      canvasLongPressTimer = setTimeout(function() {
        canvasLongPressFired = true;
        sendMouseUpToIframe(touch.clientX, touch.clientY);
        if (canvasDragBody) showStoryOverlay(canvasDragBody);
      }, 800);
      startHostCanvasDrag(touch.clientX, touch.clientY);
    } else {
      // Drawer-aware touch pass-through
      if (isInsideDrawerRect(touch.clientX, touch.clientY)) {
        boxIframe.style.pointerEvents = 'auto';
        hitZone.style.display = 'none';
        boxIframe.contentWindow.postMessage({
          type: 'treasure-box-host', action: 'drawer-click',
        }, '*');
      } else if (currentDrawerState === 'OPEN' || currentDrawerState === 'HOVER_CLOSE') {
        boxIframe.contentWindow.postMessage({
          type: 'treasure-box-host', action: 'drawer-click',
        }, '*');
      } else {
        canvas.style.pointerEvents = 'none';
        var target = document.elementFromPoint(touch.clientX, touch.clientY);
        canvas.style.pointerEvents = frameBodies.length > 0 ? 'auto' : 'none';
        if (target) {
          target.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true, cancelable: true,
            clientX: touch.clientX, clientY: touch.clientY,
          }));
        }
      }
    }
  }, { passive: false });

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
      // Toggle canvas pointer-events based on whether items exist
      canvas.style.pointerEvents = frameBodies.length > 0 ? 'auto' : 'none';

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
      canvas.style.pointerEvents = 'none';
    }

    // Single item returned to drawer via drag
    if (event.data.action === 'item-returned-single' && event.data.itemId) {
      frameBodies = frameBodies.filter(function(b) { return b.id !== event.data.itemId; });
      if (frameBodies.length === 0) {
        canvas.style.pointerEvents = 'none';
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
      // Ensure container is tall enough for the drawer
      var neededH = Math.ceil(rect.y + rect.height + 20);
      var currentH = parseInt(boxContainer.style.height, 10) || 0;
      if (neededH > currentH) {
        boxContainer.style.height = neededH + 'px';
        boxIframe.height = neededH;
        boxIframe.style.height = neededH + 'px';
        sendViewportInfo();
      }
    }

    // Item drag: forward host-page mouse events into iframe during drag
    if (event.data.action === 'item-drag-start') {
      isDraggingItem = true;
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

    // Drawer state: track all states for interaction forwarding
    if (event.data.action === 'drawer-state') {
      currentDrawerState = event.data.state;
      if (event.data.state === 'IDLE') {
        boxIframe.style.pointerEvents = 'none';
        hitZone.style.display = 'block';
        isHoveringDrawer = false;
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

    requestAnimationFrame(renderLoop);
  }

  // Start render loop immediately
  requestAnimationFrame(renderLoop);
})();
