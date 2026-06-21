// Injected into every navigation via page.addInitScript(cursorKit).
// Exposes window.__demo with the synthetic cursor, camera-zoom, and DOM helpers.
export function cursorKit() {
  let cursor;
  const ensure = () => {
    if (cursor && document.documentElement.contains(cursor)) return;
    cursor = document.createElement('div');
    cursor.style.cssText =
      'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;' +
      'transform:translate(-80px,-80px);transition:transform .6s cubic-bezier(.22,.61,.36,1);' +
      'will-change:transform;filter:drop-shadow(0 2px 3px rgba(0,0,0,.5))';
    cursor.innerHTML =
      '<svg width="26" height="26" viewBox="0 0 24 24"><path ' +
      'd="M5 2.5l15 7.2-6.7 1.6L9.3 20z" fill="#fff" stroke="#1b1d24" ' +
      'stroke-width="1.3" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(cursor);
  };

  // Resolve "host >>> inner >>> deeper" piercing N shadow roots; or a plain selector.
  const resolveEl = (sel) => {
    const parts = sel.split('>>>').map((s) => s.trim());
    let el = document.querySelector(parts[0]);
    for (let i = 1; i < parts.length && el; i++) {
      el = (el.shadowRoot || el).querySelector(parts[i]);
    }
    return el || null;
  };
  const rectOf = (sel) => {
    const el = resolveEl(sel);
    if (!el) throw new Error('element not found: ' + sel);
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, rect: r };
  };

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---- Un-transformed overlay layer ----------------------------------------
  // The camera zoom is a CSS transform on <html>, which also transforms (and re-anchors as the
  // containing block for) any fixed descendant. Overlays that must stay in SCREEN space — spotlight
  // mask, keycaps, click ripples, cursor trail — live in this layer and we counter-transform it
  // each frame so its children render at true viewport pixels (the same space getBoundingClientRect
  // reports). A ref-counted rAF loop keeps the counter-transform current ONLY while something is on
  // the layer; idle cost is zero when nothing is showing.
  let layer, raf = 0;
  const active = new Set(); // live overlay updaters; loop runs while non-empty
  const overlay = () => {
    if (layer && document.documentElement.contains(layer)) return layer;
    layer = document.createElement('div');
    layer.style.cssText =
      'position:fixed;inset:0;z-index:2147483640;pointer-events:none;transform-origin:0 0;overflow:hidden';
    document.documentElement.appendChild(layer);
    return layer;
  };
  // The inverse of <html>'s rendered affine transform, as a CSS matrix() (origin 0,0). Rendering
  // maps x -> L*x + (t + (I-L)*O), where L,t come from the computed matrix and O is transform-origin;
  // we invert that whole affine so layer children land back in screen space.
  const overlayTransform = () => {
    const cs = getComputedStyle(document.documentElement);
    const tf = cs.transform;
    if (!tf || tf === 'none') return 'none';
    const m = tf.match(/matrix\(([^)]+)\)/);
    if (!m) return 'none'; // matrix3d (unused here) → leave as-is
    const [a, b, c, d, e, f] = m[1].split(',').map(parseFloat);
    const o = cs.transformOrigin.split(' ').map(parseFloat);
    const ox = o[0] || 0, oy = o[1] || 0;
    const tnx = e + (1 - a) * ox + (-c) * oy; // net translation including origin
    const tny = f + (-b) * ox + (1 - d) * oy;
    const det = a * d - b * c;
    if (!det) return 'none';
    const ia = d / det, ib = -b / det, ic = -c / det, id = a / det; // inverse linear part
    const tix = -(ia * tnx + ic * tny);                            // inverse translation
    const tiy = -(ib * tnx + id * tny);
    return `matrix(${ia}, ${ib}, ${ic}, ${id}, ${tix}, ${tiy})`;
  };
  const syncLayer = () => { if (layer) layer.style.transform = overlayTransform(); };
  const loop = () => {
    if (!active.size) { raf = 0; return; }
    syncLayer();
    active.forEach((u) => { if (u.tick) { try { u.tick(); } catch { /* updater is best-effort */ } } });
    raf = requestAnimationFrame(loop);
  };
  // Register an overlay consumer (optional per-frame tick). Returns an unregister fn. Keeps the
  // counter-transform loop alive for the consumer's lifetime.
  const register = (tick) => {
    const u = { tick };
    active.add(u);
    overlay();
    syncLayer();
    if (!raf) raf = requestAnimationFrame(loop);
    return () => active.delete(u);
  };
  // Append a transient node to the overlay, run a WAAPI animation, and auto-remove (+ unregister)
  // when it finishes. Fixes the old pulse() node leak: every transient overlay node is cleaned up.
  const flash = (el, keyframes, options) => {
    overlay().appendChild(el);
    const unreg = register(null);
    const anim = el.animate(keyframes, options);
    const done = () => { unreg(); try { el.remove(); } catch { /* already gone */ } };
    anim.onfinish = done; anim.oncancel = done;
    return anim.finished.then(() => {}, () => {});
  };

  // Key labels → glyphs for keycaps.
  const KEY_GLYPH = {
    cmd: '⌘', command: '⌘', meta: '⌘', win: '⊞', ctrl: 'Ctrl', control: 'Ctrl', alt: 'Alt',
    option: '⌥', opt: '⌥', shift: '⇧', enter: '⏎', return: '⏎', tab: '⇥', esc: 'Esc', escape: 'Esc',
    space: 'Space', up: '↑', down: '↓', left: '←', right: '→', del: '⌫', backspace: '⌫',
  };

  window.__demo = {
    resolveEl, rectOf,
    // Move the synthetic cursor. opts.overshoot adds a slight bounce on arrival; opts.trail drops
    // a few fading ghosts along the path (give scripted moves a little personality).
    move(x, y, ms = 600, opts = {}) {
      ensure();
      const ease = opts.overshoot ? 'cubic-bezier(.34,1.45,.64,1)' : 'cubic-bezier(.22,.61,.36,1)';
      if (opts.trail) this._trail(this._cx ?? x, this._cy ?? y, x, y, ms);
      cursor.style.transition = `transform ${ms}ms ${ease}`;
      cursor.style.transform = `translate(${x - 4}px, ${y - 3}px)`;
      this._cx = x; this._cy = y;
      return wait(ms + 40);
    },
    _trail(x0, y0, x1, y1, ms) {
      const n = 5;
      for (let i = 1; i <= n; i++) {
        const f = i / (n + 1);
        const gx = x0 + (x1 - x0) * f, gy = y0 + (y1 - y0) * f;
        const g = document.createElement('div');
        g.style.cssText =
          `position:absolute;left:${gx}px;top:${gy}px;width:8px;height:8px;margin:-4px 0 0 -4px;` +
          'border-radius:50%;background:rgba(108,92,231,.32)';
        flash(g, [{ opacity: 0.5, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.4)' }],
          { duration: 360, delay: f * ms * 0.5, easing: 'ease-out' });
      }
    },
    // Click feedback. Lives on the overlay (screen space, so it stays put under zoom) and cleans up
    // after itself. opts.ring → an expanding ripple ring instead of the filled pulse.
    pulse(x, y, opts = {}) {
      const color = opts.color || 'rgba(108,92,231,.55)';
      const rp = document.createElement('div');
      if (opts.ring) {
        rp.style.cssText =
          `position:absolute;left:${x}px;top:${y}px;width:16px;height:16px;margin:-8px 0 0 -8px;` +
          `border-radius:50%;border:2.5px solid ${color};box-sizing:border-box`;
        flash(rp, [{ transform: 'scale(.4)', opacity: 1 }, { transform: 'scale(3.4)', opacity: 0 }],
          { duration: 480, easing: 'ease-out' });
      } else {
        rp.style.cssText =
          `position:absolute;left:${x}px;top:${y}px;width:14px;height:14px;margin:-7px 0 0 -7px;` +
          `border-radius:50%;background:${color}`;
        flash(rp, [{ transform: 'scale(.4)', opacity: 1 }, { transform: 'scale(3.2)', opacity: 0 }],
          { duration: 420, easing: 'ease-out' });
      }
      return wait(280);
    },
    // A brief attention "pop" on the element itself (micro-feedback the eye appreciates). Transient
    // WAAPI scale that auto-reverts — does not touch the element's own styles.
    pop(el) {
      try {
        el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.05)', offset: 0.4 }, { transform: 'scale(1)' }],
          { duration: 320, easing: 'cubic-bezier(.2,.7,.2,1)' });
      } catch { /* element may refuse animation; the pop is optional */ }
    },
    async moveToSel(sel, ms = 600, opts = {}) { const { x, y } = rectOf(sel); await this.move(x, y, ms, opts); return { x, y }; },
    // Click an element with cursor move + feedback. opts.variant: 'single'|'double'|'right'
    // (right → contextmenu). opts.ripple → ring pulse. opts.pop → element pop (default off).
    async clickSel(sel, ms = 550, opts = {}) {
      const { variant = 'single', ripple = false, pop = false } = opts;
      const { x, y } = await this.moveToSel(sel, ms);
      await this.pulse(x, y, { ring: ripple });
      const el = resolveEl(sel);
      if (!el) throw new Error('element not found: ' + sel);
      if (pop) this.pop(el);
      if (variant === 'right') {
        el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
      } else if (variant === 'double') {
        el.click(); el.click();
        el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
      } else {
        el.click();
      }
    },
    async typeInto(sel, text, cps = 38) {
      const { rect } = rectOf(sel);
      await this.move(rect.left + rect.width * 0.25, rect.top + rect.height / 2, 600);
      const el = resolveEl(sel);
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const set = Object.getOwnPropertyDescriptor(proto, 'value').set;
      const delay = Math.round(1000 / cps);
      for (let i = 1; i <= text.length; i++) {
        set.call(el, text.slice(0, i));
        el.dispatchEvent(new Event('input', { bubbles: true }));
        await wait(delay);
      }
    },
    // Show pressed keys as bottom-center capsules (e.g. "cmd+k" → ⌘ + K). Useful for shortcut-driven
    // apps. NOTE: typeInto dispatches input events, not real keystrokes, so this is a declared
    // overlay, not a capture of actual key presses.
    keycap(label, opts = {}) {
      const ms = opts.ms ?? 1100;
      const wrap = document.createElement('div');
      wrap.style.cssText =
        'position:absolute;left:0;right:0;bottom:7%;display:flex;gap:8px;justify-content:center;' +
        'align-items:center;pointer-events:none;font-family:Inter,system-ui,sans-serif';
      const cap = (txt) => {
        const k = document.createElement('div');
        k.textContent = txt;
        k.style.cssText =
          'padding:10px 14px;min-width:18px;text-align:center;border-radius:10px;font-size:22px;' +
          'font-weight:600;color:#fff;background:rgba(20,22,28,.92);' +
          'box-shadow:0 2px 0 rgba(0,0,0,.5),0 6px 18px rgba(0,0,0,.35);' +
          'border:1px solid rgba(255,255,255,.14)';
        return k;
      };
      const parts = String(label).split('+').map((s) => s.trim()).filter(Boolean);
      parts.forEach((part, i) => {
        const glyph = KEY_GLYPH[part.toLowerCase()] || (part.length === 1 ? part.toUpperCase() : part);
        wrap.appendChild(cap(glyph));
        if (i < parts.length - 1) {
          const plus = document.createElement('div');
          plus.textContent = '+';
          plus.style.cssText = 'color:#fff;font-size:20px;opacity:.7';
          wrap.appendChild(plus);
        }
      });
      return flash(wrap,
        [{ opacity: 0, transform: 'translateY(10px)' },
          { opacity: 1, transform: 'translateY(0)', offset: 0.12 },
          { opacity: 1, transform: 'translateY(0)', offset: 0.85 },
          { opacity: 0, transform: 'translateY(6px)' }],
        { duration: ms, easing: 'cubic-bezier(.2,.7,.2,1)' });
    },
    // Spotlight: dim everything except `sel`'s rect (Screen-Studio attention mask). The mask lives
    // on the overlay and re-reads the element's screen rect every frame, so it tracks correctly even
    // while a zoom animates. spotlightOff() (and reset()) fade it out.
    spotlight(sel, opts = {}) {
      const dim = opts.dim ?? 0.6, pad = opts.pad ?? 8, radius = opts.radius ?? 12, ms = opts.ms ?? 280;
      const el = resolveEl(sel);
      if (!el) throw new Error('element not found: ' + sel);
      this.spotlightOff(0);
      const mask = document.createElement('div');
      mask.style.cssText =
        `position:absolute;pointer-events:none;border-radius:${radius}px;` +
        `box-shadow:0 0 0 9999px rgba(0,0,0,0);transition:box-shadow ${ms}ms ease;` +
        'will-change:box-shadow,left,top,width,height';
      overlay().appendChild(mask);
      const place = () => {
        const r = el.getBoundingClientRect();
        mask.style.left = (r.left - pad) + 'px';
        mask.style.top = (r.top - pad) + 'px';
        mask.style.width = (r.width + 2 * pad) + 'px';
        mask.style.height = (r.height + 2 * pad) + 'px';
      };
      place();
      const unreg = register(place);
      requestAnimationFrame(() => { mask.style.boxShadow = `0 0 0 9999px rgba(0,0,0,${dim})`; });
      this._spot = { mask, unreg };
      return wait(ms);
    },
    spotlightOff(ms = 240) {
      const s = this._spot;
      if (!s) return wait(0);
      this._spot = null;
      s.mask.style.boxShadow = '0 0 0 9999px rgba(0,0,0,0)';
      return wait(ms).then(() => { try { s.unreg(); s.mask.remove(); } catch { /* already gone */ } });
    },
    // Smoothly scroll the page so `sel` is centered (a real scroll easing — the hard cut/jump is the
    // usual tell that a demo is scripted). rAF-tweened so the duration is controllable.
    async scrollToSel(sel, opts = {}) {
      const ms = opts.ms ?? 700;
      const el = resolveEl(sel);
      if (!el) throw new Error('element not found: ' + sel);
      const r = el.getBoundingClientRect();
      const from = window.scrollY;
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const to = clamp(from + r.top - (window.innerHeight - r.height) / 2, 0, max);
      if (Math.abs(to - from) < 1) return wait(0);
      const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2); // easeInOutQuad
      const t0 = performance.now();
      await new Promise((res) => {
        const step = (now) => {
          const k = clamp((now - t0) / ms, 0, 1);
          window.scrollTo(0, from + (to - from) * ease(k));
          if (k < 1) requestAnimationFrame(step); else res();
        };
        requestAnimationFrame(step);
      });
      return wait(40);
    },
    zoom(scale, ox, oy, ms = 800) {
      const el = document.documentElement;
      el.style.transformOrigin = `${ox}px ${oy}px`;
      el.style.transition = `transform ${ms}ms cubic-bezier(.4,0,.2,1)`;
      el.style.transform = `scale(${scale})`;
      return wait(ms + 40);
    },
    async zoomToSel(sel, scale = 1.3, ms = 850) { const { x, y } = rectOf(sel); await this.zoom(scale, x, y, ms); },
    // Auto-zoom (Screen Studio style): compute a scale + translation that frames an
    // element's bounding box, then animate the camera there. Scale is derived from the
    // element size (small elements get more zoom, capped at `max`); translation centers
    // the element but is clamped so the page never reveals empty edges. Pass an explicit
    // `scale` to override the auto value. Call from an un-zoomed state (like zoomToSel).
    frameTo(sel, { fill = 0.78, max = 2.2, pad = 24, ms = 850, scale } = {}) {
      const { rect } = rectOf(sel);
      const W = window.innerWidth, H = window.innerHeight;
      let s = scale || Math.min((W * fill) / (rect.width + 2 * pad), (H * fill) / (rect.height + 2 * pad));
      s = clamp(s, 1, max);
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      const tx = clamp(W / 2 - s * cx, (1 - s) * W, 0);
      const ty = clamp(H / 2 - s * cy, (1 - s) * H, 0);
      const el = document.documentElement;
      el.style.transformOrigin = '0 0';
      el.style.transition = `transform ${ms}ms cubic-bezier(.4,0,.2,1)`;
      el.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
      return wait(ms + 40);
    },
    async zoomToFit(sel, opts) { return this.frameTo(sel, opts); },
    reset(ms = 700) {
      const el = document.documentElement;
      this.spotlightOff(Math.min(ms, 240));
      el.style.transformOrigin = '0 0';
      el.style.transition = `transform ${ms}ms cubic-bezier(.4,0,.2,1)`;
      el.style.transform = 'translate(0px, 0px) scale(1)';
      return wait(ms + 40);
    },
  };
}
