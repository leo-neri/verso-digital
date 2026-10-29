// Extra motion for phones (and everything else): small interactions that make the page feel alive.
// Everything is built on what the site already has (GSAP + ScrollTrigger) and stays on transform/opacity.
window.Motion = (function () {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const touch = matchMedia('(pointer: coarse)').matches;
  let started = false;

  // ---------- headings that rise out of a mask, word by word ----------
  function maskWords(el) {
    const inners = [];
    [...el.childNodes].forEach((node) => {
      if (node.nodeType !== Node.TEXT_NODE) return;
      const frag = document.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
        const outer = document.createElement('span');
        outer.className = 'mw';
        const inner = document.createElement('span');
        inner.className = 'mw__in';
        inner.textContent = part;
        outer.appendChild(inner);
        inners.push(inner);
        frag.appendChild(outer);
      });
      node.replaceWith(frag);
    });
    return inners;
  }
  function revealWords(el, scrollTrigger, delay = 0) {
    if (el.dataset.masked) return null;
    el.dataset.masked = '1';
    const words = maskWords(el);
    if (!words.length) return null;
    return gsap.from(words, { yPercent: 115, duration: 1.1, ease: 'expo.out', stagger: 0.07, delay, scrollTrigger });
  }

  // ---------- numbers that count up ----------
  function countUp(el, scrollTrigger) {
    const m = el.textContent.trim().match(/^([^\d]*)(\d[\d.]*)(.*)$/);
    if (!m) return null;
    const [, pre, num, post] = m;
    const end = parseFloat(num.replace('.', ''));
    const obj = { v: 0 };
    const paint = () => { el.textContent = pre + Math.round(obj.v) + post; };
    paint();
    return gsap.to(obj, { v: end, duration: 1.8, ease: 'power3.out', onUpdate: paint, scrollTrigger });
  }

  // ---------- the menu button breathes with the scroll: narrower the faster you scroll ----------
  function dock() {
    const btn = $('#dockBtn');
    if (!btn || reduce) return;
    const rest = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--island-w')) || 145;
    const sheet = $('#case');
    const root = document.documentElement;
    const pos = () => (root.classList.contains('has-case') ? sheet.scrollTop : scrollY);   // the case page scrolls on its own
    let last = pos();
    let k = 0;
    gsap.ticker.add(() => {
      if (root.classList.contains('menu-open')) { last = pos(); return; }
      const now = pos();
      const dy = Math.abs(now - last) > 900 ? 0 : now - last;   // a jump between the two scrollers isn't a scroll
      last = now;
      const target = gsap.utils.clamp(0, 1, Math.abs(dy) / 28);   // the faster the scroll, the narrower, in either direction
      k += (target - k) * (target > k ? 0.22 : 0.09);
      if (k < 0.002) { if (btn.dataset.dw) { btn.dataset.dw = ''; gsap.set(btn, { width: rest }); } return; }
      btn.dataset.dw = '1';
      gsap.set(btn, { width: rest * (1 - k * 0.42) });
    });
  }

  // ---------- the backdrop drifts as the page goes by ----------
  function backdrop() {
    if (reduce) return;
    gsap.to('.backdrop__img', {
      x: '-3.5%', y: '2.5%', scale: 1.1, ease: 'none',
      scrollTrigger: { trigger: document.documentElement, start: 0, end: 'max', scrub: 1.4 },
    });
  }

  // ---------- the brands strip runs faster while you scroll ----------
  function marquee() {
    const track = $('#marquee');
    const anim = track && track.getAnimations()[0];
    if (!anim || reduce) return;
    let last = scrollY;
    let rate = 1;
    let on = false;
    ScrollTrigger.create({ trigger: '.brands', start: 'top bottom', end: 'bottom top', onToggle: (s) => { on = s.isActive; if (!on) anim.playbackRate = 1; } });
    gsap.ticker.add(() => {
      if (!on) return;
      const dy = Math.abs(scrollY - last);
      last = scrollY;
      rate += ((1 + Math.min(dy * 0.35, 9)) - rate) * 0.08;
      anim.playbackRate = rate;
    });
  }

  // ---------- touch feedback: cards and buttons sink a little, with a light where the finger is ----------
  function press() {
    const SEL = '.case__media, .person, .btn, .cd-next__link, .cd-img';
    document.addEventListener('pointerdown', (e) => {
      const el = e.target.closest(SEL);
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--px', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
      el.style.setProperty('--py', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
    }, { passive: true });
  }

  // ---------- the founders' cards lean with the finger (and with the phone, where it lets us know) ----------
  function tilt() {
    if (reduce) return;
    const cards = $$('.person');
    const lean = (card, rx, ry, gx, gy) => {
      gsap.to(card, { rotationX: rx, rotationY: ry, transformPerspective: 800, duration: 0.5, ease: 'power3.out', overwrite: 'auto' });
      card.style.setProperty('--gx', gx + '%');
      card.style.setProperty('--gy', gy + '%');
      card.style.setProperty('--glare', rx || ry ? 1 : 0);
    };
    const rest = (card) => {
      gsap.to(card, { rotationX: 0, rotationY: 0, duration: 0.9, ease: 'elastic.out(1, 0.55)', overwrite: 'auto' });
      card.style.setProperty('--glare', 0);
    };
    cards.forEach((card) => {
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        const x = gsap.utils.clamp(0, 1, (e.clientX - r.left) / r.width);
        const y = gsap.utils.clamp(0, 1, (e.clientY - r.top) / r.height);
        lean(card, (0.5 - y) * 9, (x - 0.5) * 12, x * 100, y * 100);
      });
      card.addEventListener('pointerleave', () => rest(card));
      card.addEventListener('pointerup', () => rest(card));
      card.addEventListener('pointercancel', () => rest(card));
    });

    // phone tilt: only while the cards are on screen. iOS asks first, and only a tap can ask.
    if (!touch || !('DeviceOrientationEvent' in window)) return;
    let base = null;
    let listening = false;
    let visible = false;
    let got = false;
    const onTilt = (e) => {
      if (!visible || e.gamma == null) return;
      if (!base) base = { b: e.beta, g: e.gamma };
      got = true;
      const ry = gsap.utils.clamp(-12, 12, (e.gamma - base.g) * 0.7);
      const rx = gsap.utils.clamp(-10, 10, -(e.beta - base.b) * 0.6);
      cards.forEach((c) => lean(c, rx, ry, 50 + ry * 6, 40 - rx * 6));
    };
    // no sensor events (an http page: Chrome only gives them to https): the cards lean with their place on screen instead
    const byScroll = () => {
      if (got || !visible) return;
      cards.forEach((c, k) => {
        const r = c.getBoundingClientRect();
        const off = gsap.utils.clamp(-1, 1, (r.top + r.height / 2) / innerHeight * 2 - 1);
        lean(c, -off * 9, (k ? -1 : 1) * off * 5, 50 + off * 30, 50 + off * 30);
      });
    };
    addEventListener('scroll', byScroll, { passive: true });
    const listen = () => { if (listening) return; listening = true; addEventListener('deviceorientation', onTilt, { passive: true }); };
    ScrollTrigger.create({ trigger: '#criadoras', start: 'top 80%', end: 'bottom 20%', onToggle: (s) => { visible = s.isActive; base = null; if (!visible) cards.forEach(rest); else setTimeout(byScroll, 400); } });
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      $('#criadoras').addEventListener('click', () => {
        DeviceOrientationEvent.requestPermission().then((r) => { if (r === 'granted') listen(); }).catch(() => {});
      }, { once: true });
    } else listen();
  }

  function init() {
    if (started) return;
    started = true;
    $$('.section-title').forEach((h) => revealWords(h, { trigger: h, start: 'top 90%' }));
    $$('.case__stat b').forEach((b) => countUp(b, { trigger: b.closest('.case'), start: 'top 78%', once: true }));
    dock();
    backdrop();
    marquee();
    press();
    tilt();
  }

  return { init, revealWords, countUp };
})();
