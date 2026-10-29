const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// Everything below the fold: markup built from data, then the scroll animations.
// buildSections() runs as soon as the DOM exists; initSections() is called from the loader, once
// fonts are in, so layout is measured against the final text.

const BRANDS = [
  'Riachuelo', 'All Pendre', 'LoveWorkz', 'A Oficina Cerâmica', 'Cinco', 'Kalimo', 'The Vault',
  'Laneige', 'Beit Engenharia', 'Cantão', 'Velle', 'Heavy House', 'Rare Beauty', 'Botânico Bar',
  'Brisa', 'Épice', 'Valentina Gorentzvaig', 'So.Connected',
];

// Vector wordmark (logo.js) as an inline SVG that takes its colour from CSS `color`.
function logoSvg() {
  const { view, letters } = window.VERSO_LOGO;
  const paths = Object.values(letters).map((d) => `<path d="${d}" fill-rule="evenodd"/>`).join('');
  return `<svg viewBox="${view.x} ${view.y} ${view.w} ${view.h}" fill="currentColor" role="img" aria-label="verso">${paths}</svg>`;
}

function buildSections() {
  $('#header .logo').innerHTML = logoSvg();
  $('.island__logo').innerHTML = logoSvg();
  $('#footerMark').innerHTML = logoSvg();

  // cases, grouped so that each group fits one screen: a big one, then pairs at different
  // heights, and a lone last one set in from the sides (see the c-* classes)
  const caseHtml = (p, cls, index) => `
    <article class="case ${cls}" data-cursor="Ver" data-index="${index}">
      <a class="case__link" href="#/cases/${p.slug}" aria-label="Ver o case ${p.name}">
        <div class="case__media" style="--c1:${p.colors[0]};--c2:${p.colors[1]}">
          <div class="case__img ph-${p.images ? 'photo' : 'none'}" style="${p.images ? `background-image:url(${p.images.hero});--focus:${Math.round(p.images.focus * 100)}%` : ''}"></div>
          ${p.images ? '' : '<span class="case__ph">Imagem do case</span>'}
          <div class="case__stat"><b>${p.stat.value}</b><span>${p.stat.label}</span></div>
        </div>
        <div class="case__meta">
          <h3 class="case__name">${p.name}</h3>
          <span class="case__tag">${p.tag}</span>
        </div>
        <p class="case__text">${p.text}</p>
      </a>
    </article>`;
  const rows = [`<div class="case-row case-row--first">${caseHtml(PROJECTS[0], 'c-wide', 0)}</div>`];
  for (let i = 1; i < PROJECTS.length; i += 2) {
    const pair = PROJECTS.slice(i, i + 2);
    rows.push(`<div class="case-row">${pair.length === 2
      ? caseHtml(pair[0], 'c-left', i) + caseHtml(pair[1], 'c-right', i + 1)
      : caseHtml(pair[0], 'c-center', i)}</div>`);
  }
  $('#casesGrid').innerHTML = rows.join('');

  // the photo-in-an-ellipse that the brand already uses, borrowed for inline decoration
  $$('.pill-img').forEach((el) => { el.style.setProperty('--pos', el.dataset.pos); });

  const run = BRANDS.map((b) => `<span>${b}</span><i class="dot" aria-hidden="true"></i>`).join('');
  $('#marquee').innerHTML = run + run;

  // accordion: one open at a time, animated purely by CSS (grid-template-rows)
  $$('.acc__item').forEach((item) => {
    $('.acc__head', item).addEventListener('click', () => {
      const open = !item.classList.contains('is-open');
      $$('.acc__item').forEach((other) => {
        other.classList.remove('is-open');
        $('.acc__head', other).setAttribute('aria-expanded', 'false');
      });
      if (open) {
        item.classList.add('is-open');
        $('.acc__head', item).setAttribute('aria-expanded', 'true');
      }
      setTimeout(() => ScrollTrigger.refresh(), 650);
    });
  });

  // contact form: front-end only for now, nothing is sent anywhere
  const form = $('#contactForm');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    let ok = true;
    $$('input, textarea', form).forEach((field) => {
      const valid = field.value.trim() && (field.type !== 'email' || /^\S+@\S+\.\S+$/.test(field.value));
      field.closest('.field').classList.toggle('is-error', !valid);
      if (!valid) ok = false;
    });
    if (!ok) return;
    form.reset();
    const msg = $('#formOk');
    msg.hidden = false;
    gsap.fromTo(msg, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' });
  });
}
buildSections();

// Split text into words, keeping inline elements (the photo ellipses) where they are.
function splitWords(el) {
  const words = [];
  [...el.childNodes].forEach((node) => {
    if (node.nodeType !== Node.TEXT_NODE) return;
    const frag = document.createDocumentFragment();
    node.textContent.split(/(\s+)/).forEach((part) => {
      if (!part) return;
      if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
      const span = document.createElement('span');
      span.className = 'w';
      span.textContent = part;
      words.push(span);
      frag.appendChild(span);
    });
    node.replaceWith(frag);
  });
  return words;
}

function initSections() {
  const header = $('#header');

  initGravity();

  // the header turns dark while it floats over the paper, and light again over the green footer
  window.PaperTrigger = ScrollTrigger.create({
    trigger: '.paper', start: 'top 70px', end: 'bottom 70px',
    onToggle: (self) => {
      header.classList.toggle('is-paper', self.isActive);
      $('#island').classList.toggle('is-paper', self.isActive);   // the phone menu's glass does the same
    },
  });

  // --- manifesto: the sentence "reads itself" as you scroll, and the ellipses open between words
  const words = splitWords($('#manifesto'));
  const pills = $$('#manifesto .pill-img');
  const read = gsap.timeline({
    scrollTrigger: { trigger: '#manifesto', start: 'top 80%', end: 'bottom 55%', scrub: 0.6 },
  });
  read.fromTo(words, { opacity: 0.16 }, { opacity: 1, ease: 'none', stagger: 0.12, duration: 0.3 }, 0);
  pills.forEach((pill) => {
    const at = words.findIndex((w) => w.compareDocumentPosition(pill) & Node.DOCUMENT_POSITION_PRECEDING) ;
    const index = at === -1 ? words.length : at;
    read.fromTo(pill, { width: 0, opacity: 0 }, { width: '1.9em', opacity: 1, ease: 'power2.out', duration: 0.6 }, Math.max(0, (index - 1) * 0.12));
  });
  gsap.from('.intro .eyebrow', { y: 20, opacity: 0, duration: 1, ease: 'power3.out', scrollTrigger: { trigger: '.intro', start: 'top 85%' } });
  gsap.from('.quiet > *', {
    y: 30, opacity: 0, duration: 1.1, ease: 'power3.out', stagger: 0.12,
    scrollTrigger: { trigger: '.quiet', start: 'top 88%' },
  });

  // --- section headings
  $$('.section-head').forEach((head) => {
    gsap.from($$(':scope > :not(.section-title)', head), {
      y: 40, opacity: 0, duration: 1.1, ease: 'power3.out', stagger: 0.12, delay: 0.25,
      scrollTrigger: { trigger: head, start: 'top 88%' },
    });
  });

  // --- cases: the image opens like a curtain, its content drifts a little slower than the page
  $$('.case').forEach((item) => {
    const media = $('.case__media', item);
    gsap.from(media, {
      clipPath: 'inset(0 0 100% 0)', duration: 1.4, ease: 'expo.out',
      scrollTrigger: { trigger: item, start: 'top 82%' },
    });
    gsap.fromTo($('.case__img', item), { yPercent: -7, scale: 1.12 }, {
      yPercent: 7, scale: 1.12, ease: 'none',
      scrollTrigger: { trigger: item, start: 'top bottom', end: 'bottom top', scrub: true },
    });
    gsap.from([$('.case__meta', item), $('.case__text', item)], {
      y: 28, opacity: 0, duration: 1, ease: 'power3.out', stagger: 0.1,
      scrollTrigger: { trigger: item, start: 'top 70%' },
    });
  });

  // --- team
  gsap.from('.person', {
    y: 70, opacity: 0, duration: 1.2, ease: 'power3.out', stagger: 0.18,
    scrollTrigger: { trigger: '.team__cards', start: 'top 82%' },
  });
  $$('.person__photo img').forEach((img) => {
    gsap.fromTo(img, { scale: 1.16 }, {
      scale: 1, ease: 'none',
      scrollTrigger: { trigger: img.closest('.person'), start: 'top bottom', end: 'center center', scrub: true },
    });
  });

  // --- services, brands
  gsap.from('.acc__item', {
    y: 36, opacity: 0, duration: 1, ease: 'power3.out', stagger: 0.12,
    scrollTrigger: { trigger: '.acc', start: 'top 85%' },
  });
  gsap.from('.brands > *', {
    opacity: 0, y: 24, duration: 1, ease: 'power3.out', stagger: 0.12,
    scrollTrigger: { trigger: '.brands', start: 'top 92%' },
  });

  // --- footer
  gsap.from('.footer__top > *', {
    y: 50, opacity: 0, duration: 1.2, ease: 'power3.out', stagger: 0.12,
    scrollTrigger: { trigger: '.footer', start: 'top 72%' },
  });
  gsap.from('.footer__cols > *', {
    y: 40, opacity: 0, duration: 1.1, ease: 'power3.out', stagger: 0.15,
    scrollTrigger: { trigger: '.footer__cols', start: 'top 88%' },
  });
  Motion.init();

  gsap.from('#footerMark', {
    clipPath: 'inset(100% 0 0 0)', yPercent: 20, duration: 1.6, ease: 'expo.out',
    scrollTrigger: { trigger: '#footerMark', start: 'top 98%' },
  });
}

// ---------- gravity ----------
// A light pull that tidies up where you stop. When scrolling ends, find the block (a screen's
// worth of content) whose ideal position is closest to where you are. If lining it up needs a
// move of 20% of the window height or less, glide there; if it needs more, do nothing at all.
// Blocks that fit the window are centred; taller ones snap to their top or bottom edge.
const GRAVITY_REACH = 0.2;   // the largest correction, as a share of the window height
const GRAVITY_IDLE = 170;    // ms without scrolling before it kicks in

function gravityBlocks() {
  const rect = (el) => { const b = el.getBoundingClientRect(); return { top: b.top + scrollY, bottom: b.bottom + scrollY }; };
  const union = (...els) => {
    const rs = els.map(rect);
    return { top: Math.min(...rs.map((r) => r.top)), bottom: Math.max(...rs.map((r) => r.bottom)) };
  };
  const rows = $$('.case-row');
  return [
    rect($('#hero')),
    rect($('#sobre')),
    union($('.cases .section-head'), rows[0]),
    ...rows.slice(1).map(rect),
    rect($('#criadoras')),
    rect($('#servicos')),
    rect($('.brands')),
    rect($('#contato')),
  ];
}

function gravityTarget(y, dir) {
  const vh = innerHeight;
  const maxY = document.documentElement.scrollHeight - vh;
  const reach = vh * GRAVITY_REACH;
  const stops = [];
  gravityBlocks().forEach(({ top, bottom }) => {
    const h = bottom - top;
    const targets = h <= vh ? [top - (vh - h) / 2] : [top, bottom - vh];
    targets.forEach((t) => stops.push(gsap.utils.clamp(0, maxY, t)));
  });
  // already lined up with one of the stops (a tall block has two): leave it alone
  if (stops.some((t) => Math.abs(t - y) <= 1.5)) return null;
  const near = stops.map((t) => ({ t, d: t - y })).filter(({ d }) => Math.abs(d) <= reach);
  if (!near.length) return null;
  // prefer a stop in the direction you were already heading, so it never fights you
  const ahead = near.filter(({ d }) => dir === 0 || Math.sign(d) === dir);
  const pool = ahead.length ? ahead : near;
  return pool.reduce((a, b) => (Math.abs(a.d) <= Math.abs(b.d) ? a : b)).t;
}

function initGravity() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let timer;
  let glide = null;
  let lastY = scrollY;
  let dir = 0;

  const stop = () => { if (glide) { glide.kill(); glide = null; } };
  const settle = () => {
    if (document.documentElement.classList.contains('is-loading') || document.documentElement.classList.contains('has-case') || document.documentElement.classList.contains('menu-open') || document.documentElement.classList.contains('is-nudging') || document.documentElement.classList.contains('is-restoring') || gsap.isTweening(window)) return;
    const target = gravityTarget(scrollY, dir);
    if (target === null) return;
    const distance = Math.abs(target - scrollY) / innerHeight;
    glide = gsap.to(window, {
      scrollTo: { y: target, autoKill: true },
      duration: 0.55 + distance * 1.6, ease: 'power2.out',
      onComplete: () => { glide = null; lastY = scrollY; },
      onInterrupt: () => { glide = null; lastY = scrollY; },   // e.g. you grabbed the scrollbar
    });
  };

  addEventListener('scroll', () => {
    if (glide) return;                      // our own movement
    if (scrollY !== lastY) { dir = Math.sign(scrollY - lastY) || dir; lastY = scrollY; }
    clearTimeout(timer);
    timer = setTimeout(settle, GRAVITY_IDLE);
  }, { passive: true });
  // the moment you take over again, let go
  ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach((ev) => addEventListener(ev, () => { stop(); clearTimeout(timer); }, { passive: true }));
}
