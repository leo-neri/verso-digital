// Wordmark loader.
//
// A white sheet with the "verso" logo typed onto it, one letter at a time. The centre of the "o" is
// a hole in the sheet showing the sharp photo. Then:
//   1. the logo flies up to where it lives on the site (the island at the top on phones, the header
//      on wide screens), while the photo ellipse breaks away from the "o" and glides to the centre
//      of the screen, flattening as it goes;
//   2. once both are in place and the site is ready, the ellipse opens until it has uncovered the
//      whole page, and the logo hands over to the real one underneath.
//
// `runLogoLoader(ready)` resolves partway through the opening so the page can start revealing
// underneath it. The logo itself is vector (logo.js), so it stays crisp at any size.
window.runLogoLoader = function runLogoLoader(ready) {
  const NS = 'http://www.w3.org/2000/svg';
  const logo = window.VERSO_LOGO;
  const root = document.documentElement;
  const loader = document.getElementById('loader');
  const logoLayer = document.getElementById('logoLayer');
  const holeLayer = document.getElementById('holeLayer');
  const ellipse = document.getElementById('ellipseHole');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const el = (name, attrs) => {
    const node = document.createElementNS(NS, name);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    return node;
  };

  // ---------- build the artwork ----------
  const letters = Object.entries(logo.letters).map(([name, d]) => {
    const path = el('path', { d, fill: logo.color, 'fill-rule': 'evenodd', opacity: 0 });
    path.dataset.letter = name;
    logoLayer.appendChild(path);
    return path;
  });
  // the "o"'s hole is a hair larger than its inner edge so the ring always overlaps it
  const hole = el('path', { d: logo.hole.d, fill: '#000', stroke: '#000', 'stroke-width': 2, 'fill-rule': 'evenodd', opacity: 0 });
  holeLayer.appendChild(hole);
  const caret = el('rect', { width: 3.4, fill: '#0a0a0a', opacity: 0 });
  logoLayer.appendChild(caret);

  const boxes = letters.map((p) => p.getBBox());
  const xHeight = boxes[0];   // the "v" sets the caret's height
  caret.setAttribute('y', xHeight.y);
  caret.setAttribute('height', xHeight.height);
  const moveCaret = (x) => caret.setAttribute('x', x);

  // ---------- layout ----------
  // the sheet covers the viewport minus the scrollbar, so centre on that, not on innerWidth
  let W = root.clientWidth;
  let H = root.clientHeight;
  const mark = { k: 1, tx: 0, ty: 0 };            // where the logo is: scale, and where its top-left sits
  const eye = { x: 0, y: 0, rx: 0, ry: 0 };       // the ellipse
  let phase = 'typing';                            // typing -> flying -> parked -> opening

  const holeCentre = () => ({ x: mark.tx + (logo.hole.cx - logo.view.x) * mark.k, y: mark.ty + (logo.hole.cy - logo.view.y) * mark.k });

  function place() {
    const t = `translate(${mark.tx} ${mark.ty}) scale(${mark.k}) translate(${-logo.view.x} ${-logo.view.y})`;
    logoLayer.setAttribute('transform', t);
    holeLayer.setAttribute('transform', t);
  }
  function drawEye() {
    ellipse.setAttribute('cx', eye.x);
    ellipse.setAttribute('cy', eye.y);
    ellipse.setAttribute('rx', Math.max(eye.rx, 0.01));
    ellipse.setAttribute('ry', Math.max(eye.ry, 0.01));
  }

  // typing size: big and centred
  function fitCentred() {
    const width = gsap.utils.clamp(240, 560, W * 0.44);
    mark.k = width / logo.view.w;
    mark.tx = W / 2 - (logo.view.w * mark.k) / 2;
    mark.ty = H / 2 - (logo.view.h * mark.k) / 2;
    place();
  }

  // the resting ellipse: wide and flat, centred on the screen
  const restEye = () => {
    const rx = gsap.utils.clamp(40, 90, Math.min(W, H) * 0.09);
    return { x: W / 2, y: H / 2, rx, ry: rx * 0.3 };
  };

  // where the logo ends up: exactly on top of the real one (the island on phones, the header otherwise)
  const isPhone = () => matchMedia('(max-width: 768px)').matches;
  function destination() {
    const svg = isPhone() ? document.querySelector('.island__logo svg') : document.querySelector('#header .logo svg');
    if (!svg) return { k: 0.12, tx: W / 2 - 30, ty: 8 };
    const r = svg.getBoundingClientRect();
    // the header's children wait 16px lower until they fade in (see main.js); take that out
    const lift = isPhone() ? 0 : Number(gsap.getProperty(document.querySelector('#header .logo'), 'y')) || 0;
    return { k: r.width / logo.view.w, tx: r.left, ty: r.top - lift };
  }
  const finalColor = () => (isPhone() ? '#f6f1ea' : '#ffffff');

  addEventListener('resize', () => {
    W = root.clientWidth; H = root.clientHeight;
    if (phase === 'typing') { fitCentred(); return; }
    if (phase === 'parked') {
      const d = destination();
      Object.assign(mark, { k: d.k, tx: d.tx, ty: d.ty }); place();
      Object.assign(eye, restEye()); drawEye();
    }
  });

  // ---------- helpers ----------
  const play = (tl) => new Promise((res) => tl.eventCallback('onComplete', res));
  const wait = (s) => new Promise((res) => gsap.delayedCall(s, res));
  let blink = null;
  const caretSolid = () => { blink?.kill(); gsap.set(caret, { opacity: 1 }); };
  const caretBlink = () => {
    blink?.kill();
    gsap.set(caret, { opacity: 1 });
    blink = gsap.to(caret, { opacity: 0, duration: 0.5, repeat: -1, yoyo: true, ease: 'steps(1)' });
  };

  const finish = () => { blink?.kill(); loader.style.display = 'none'; };

  return new Promise(async (resolve) => {
    let isReady = false;
    ready.then(() => { isReady = true; });
    fitCentred();

    if (reduceMotion) {
      letters.forEach((p) => p.setAttribute('opacity', 1));
      hole.setAttribute('opacity', 1);
      await ready;
      await play(gsap.timeline().to(loader, { opacity: 0, duration: 0.5 }));
      finish();
      resolve();
      return;
    }

    // blank white page, caret waiting where the first letter will land
    moveCaret(boxes[0].x - 7);
    caretBlink();
    await wait(0.7);

    // type the word, one letter at a time, with a human-ish rhythm
    const pauses = [0.17, 0.13, 0.2, 0.15, 0.2];
    for (let i = 0; i < letters.length; i++) {
      caretSolid();
      gsap.fromTo(letters[i], { opacity: 0, y: 5 }, { opacity: 1, y: 0, duration: 0.14, ease: 'power2.out' });
      moveCaret(boxes[i].x + boxes[i].width + 6);
      if (letters[i].dataset.letter === 'o') {
        // the "o" is the only letter with something inside it
        gsap.to(hole, { opacity: 1, duration: 0.6, ease: 'power1.out', delay: 0.1 });
      }
      await wait(pauses[i] + Math.random() * 0.05);
    }
    caretBlink();
    await wait(0.6);

    // 1. the logo goes to its place; the ellipse breaks away from the "o" and heads for the centre
    phase = 'flying';
    blink?.kill();
    gsap.to(caret, { opacity: 0, duration: 0.1 });
    const c = holeCentre();
    Object.assign(eye, { x: c.x, y: c.y, rx: (logo.hole.w * mark.k) / 2, ry: (logo.hole.h * mark.k) / 2 });
    drawEye();
    ellipse.setAttribute('opacity', 1);   // same place and size as the "o"'s hole, so nothing seems to change...
    gsap.killTweensOf(hole);
    gsap.set(hole, { opacity: 0 });       // ...until the ellipse leaves the ring behind: the ring is then white inside
    const dest = destination();
    const rest = restEye();
    await play(gsap.timeline()
      .to(mark, { k: dest.k, tx: dest.tx, ty: dest.ty, duration: 1.25, ease: 'expo.inOut', onUpdate: place }, 0)
      .to(eye, { x: rest.x, y: rest.y, rx: rest.rx, ry: rest.ry, duration: 1.25, ease: 'expo.inOut', onUpdate: drawEye }, 0));
    phase = 'parked';

    // both are in position: wait for the site, with a beat so the composition reads
    await wait(0.4);
    while (!isReady) await wait(0.1);

    // 2. the ellipse opens until it has uncovered everything
    phase = 'opening';
    let fired = false;
    await play(gsap.timeline().to(eye, {
      rx: W * 0.82, ry: H * 0.82, duration: 1.7, ease: 'expo.inOut',
      onUpdate() {
        drawEye();
        if (!fired && this.progress() > 0.55) {
          fired = true;
          resolve();   // the page starts coming in (main.js)
          // hand the logo over to the real one underneath: same place, so it just changes colour and fades
          gsap.to(letters, { fill: finalColor(), duration: 0.5, ease: 'power1.out' });
          gsap.to(logoLayer, { opacity: 0, duration: 0.5, delay: 0.4, ease: 'power1.in' });
        }
      },
    }));
    await wait(0.4);
    finish();
  });
};
