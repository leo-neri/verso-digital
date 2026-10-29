// Case page: the overlay that opens when you click a slide in the carousel or the image of a
// case card.
//
// From the carousel, the clicked slide itself flies to the centre, flattens and grows until it
// fills the window (carousel.open). From a card, the card's picture grows to the window and the
// same full-screen slide takes over under it. Either way, what is left is a full-screen picture
// with the case page scrolling over it like a curtain; closing plays it all backwards.
window.CaseView = (function () {
  const root = document.documentElement;
  const overlay = $('#case');
  const content = $('#cdContent');
  const stageEl = $('#stage');
  const SITE_TITLE = document.title;
  const N = PROJECTS.length;

  const caseNudge = Nudge.watch({
    scroller: overlay,
    getY: () => overlay.scrollTop,
    canRun: () => current >= 0 && !busy && !overlay.hidden && !(window.Menu && Menu.isOpen),
    first: 4500,
    again: 12000,
  });

  let current = -1;     // index of the open case, -1 when closed
  let flown = false;    // the hero text arrived by flying in from the carousel card, so it needn't animate in
  let source = null;    // 'carousel' | 'card'
  let busy = false;
  let triggers = [];
  const pad = (n) => String(n).padStart(2, '0');

  // ---------- page content ----------
  function build(i) {
    const p = PROJECTS[i];
    const d = p.detail;
    const next = PROJECTS[(i + 1) % N];
    // image placeholders: same two colours as the case, flipped and rotated so they don't repeat
    const tone = (k) => `--c1:${p.colors[k % 2]};--c2:${p.colors[(k + 1) % 2]};--a:${[135, 205, 160][k % 3]}deg`;

    const sections = d.sections.map((s, k) => `
      <section class="cd-sec ${k % 2 ? 'cd-sec--flip' : ''}">
        <div class="cd-sec__img">
          <div class="cd-img" data-bend style="${tone(k)}">
            <div class="cd-img__in ${s.image ? 'has-photo' : ''}" style="${s.image ? `background-image:url(${s.image})` : ''}"></div>
            ${s.image ? '' : `<span class="cd-img__ph">Imagem · ${p.name} · ${pad(k + 2)}</span>`}
          </div>
        </div>
        <div class="cd-sec__text">
          <p class="cd-kicker"><span>${pad(k + 1)}</span>${s.kicker}</p>
          <h2 class="cd-title">${s.title}</h2>
          <p class="cd-text">${s.text}</p>
        </div>
      </section>`).join('');

    // the text that was on the carousel card (a short version on phones) continues into the page
    const phone = carousel.isMobile();
    const lines = phone ? ((p.short && p.short.headline) || p.headline.slice(0, 2)) : p.headline;
    const sub = phone ? '' : (p.sub || '');
    content.innerHTML = `
      <section class="cd-hero">
        <div class="cd-hero__lead">
          <h2 class="cd-lead__h">${lines.map((l) => `<span>${l}</span>`).join('')}</h2>
          ${sub ? `<p class="cd-lead__sub">${sub}</p>` : ''}
        </div>
        <p class="cd-hero__tag">${p.tag}</p>
        <h1 class="cd-hero__title">${p.name}</h1>
      </section>

      <div class="cd-sheet">
        <section class="cd-intro">
          <p class="eyebrow">Case · ${p.tag}</p>
          <p class="cd-intro__lead">${d.lead}</p>
          <div class="cd-meta">
            <div><span class="cd-meta__k">Serviços</span><ul class="tags">${d.services.map((s) => `<li>${s}</li>`).join('')}</ul></div>
            <div><span class="cd-meta__k">Frente</span><p>${p.tag}</p></div>
          </div>
        </section>

        ${sections}

        <section class="cd-result" style="--c1:${p.colors[0]}">
          <span class="cd-result__big">${d.result.big}</span>
          <p class="cd-result__text">${d.result.text}</p>
        </section>

        <section class="cd-next">
          <a class="cd-next__link" href="#/cases/${next.slug}" data-next data-cursor="Ver" style="--c1:${next.colors[0]};--c2:${next.colors[1]}">
            <div class="cd-next__bg" style="${next.images ? `background-image:linear-gradient(rgba(0,0,0,.18),rgba(0,0,0,.5)),url(${next.images.hero})` : ''}"></div>
            <span class="cd-next__label">Próximo case</span>
            <span class="cd-next__name">${next.name}</span>
            <span class="cd-next__tag">${next.tag}</span>
          </a>
          <div class="cd-cta">
            <p>Quer um case assim para a sua marca?</p>
            <a class="btn" href="#contato" data-contact><span class="btn__label">Falar com a Verso</span><span class="btn__arrow" aria-hidden="true">→</span></a>
          </div>
        </section>
      </div>`;

    document.title = `${p.name} — Verso Digital`;
    $('[data-next]', content).addEventListener('click', (e) => { e.preventDefault(); switchTo((i + 1) % N); });
    $('[data-contact]', content).addEventListener('click', (e) => {
      e.preventDefault();
      closeNow().then(() => gsap.to(window, { scrollTo: '#contato', duration: 1.2, ease: 'power3.inOut' }));
    });
  }

  function animateIn() {
    triggers.forEach((t) => t.kill());
    triggers = [];
    const st = (vars) => ({ scroller: overlay, ...vars });
    const track = (tween) => { if (tween.scrollTrigger) triggers.push(tween.scrollTrigger); return tween; };

    gsap.from('.cd-ball', { scale: 0.5, opacity: 0, y: 24, duration: 0.7, ease: 'back.out(1.8)', delay: 0.5, clearProps: 'transform,opacity' });
    gsap.from(flown ? '.cd-hero__tag, .cd-hero__title' : '.cd-hero__lead, .cd-hero__tag, .cd-hero__title', { y: 44, opacity: 0, duration: 1.2, ease: 'expo.out', stagger: 0.1, delay: 0.1 });
    track(gsap.from('.cd-intro > *', { y: 36, opacity: 0, duration: 1.1, ease: 'power3.out', stagger: 0.12, scrollTrigger: st({ trigger: '.cd-intro', start: 'top 82%' }) }));
    $$('.cd-sec', content).forEach((sec) => {
      const img = $('.cd-img', sec);
      track(gsap.from(img, { clipPath: 'inset(0 0 100% 0)', duration: 1.4, ease: 'expo.out', scrollTrigger: st({ trigger: sec, start: 'top 72%' }) }));
      track(gsap.fromTo($('.cd-img__in', sec), { yPercent: -7, scale: 1.12 }, { yPercent: 7, scale: 1.12, ease: 'none', scrollTrigger: st({ trigger: sec, start: 'top bottom', end: 'bottom top', scrub: true }) }));
      track(gsap.from($('.cd-sec__text', sec).children, { y: 34, opacity: 0, duration: 1.1, ease: 'power3.out', stagger: 0.1, scrollTrigger: st({ trigger: sec, start: 'top 62%' }) }));
    });
    const big = $('.cd-result__big', content);
    const counted = big && Motion.countUp(big, st({ trigger: '.cd-result', start: 'top 80%', once: true }));
    if (counted) track(counted);
    // the lead reads itself as you scroll, like the manifesto on the home page
    const lead = $('.cd-intro__lead', content);
    if (lead) {
      const words = splitWords(lead);
      track(gsap.fromTo(words, { opacity: 0.18 }, { opacity: 1, ease: 'none', stagger: 0.1, duration: 0.3, scrollTrigger: st({ trigger: lead, start: 'top 88%', end: 'bottom 60%', scrub: 0.6 }) }));
    }
    $$('.cd-title', content).forEach((t) => { const tw = Motion.revealWords(t, st({ trigger: t, start: 'top 88%' })); if (tw) track(tw); });
    track(gsap.from('.cd-result > *', { y: 44, opacity: 0, duration: 1.2, ease: 'power3.out', stagger: 0.15, scrollTrigger: st({ trigger: '.cd-result', start: 'top 80%' }) }));
    track(gsap.from('.cd-next__link, .cd-cta', { y: 40, opacity: 0, duration: 1.1, ease: 'power3.out', stagger: 0.15, scrollTrigger: st({ trigger: '.cd-next', start: 'top 85%' }) }));
    // the island's glass turns smoky while the sheet slides behind it
    const island = $('#island');
    const closeBtn = $('#cdBack');
    island.classList.remove('is-paper');
    closeBtn.classList.remove('is-paper');
    $('#header').classList.remove('is-sheet');
    track({ scrollTrigger: ScrollTrigger.create({
      scroller: overlay, trigger: '.cd-sheet', start: 'top 46px', end: 'bottom 46px',
      onToggle: (self) => {
        island.classList.toggle('is-paper', self.isActive);
        closeBtn.classList.toggle('is-paper', self.isActive);
        $('#header').classList.toggle('is-sheet', self.isActive);   // desktop: the logo turns dark over the sheet
      },
    }) });
    ScrollTrigger.refresh();
  }

  // ---------- showing / hiding the overlay ----------
  function show(i, fade = 0.5, prepared = false) {
    current = i;
    if (!prepared) build(i);
    overlay.hidden = false;
    overlay.style.visibility = '';
    overlay.scrollTop = 0;
    gsap.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: fade, ease: 'power2.out' });
    animateIn();
    // let the carousel draw the full-screen slide once more, then stop redrawing it
    gsap.delayedCall(0.15, () => { if (current >= 0) carousel.freeze(); });
    caseNudge.arm();
  }

  const slugOf = (i) => PROJECTS[i].slug;
  const hero = ['.hero__ui'];

  // ---------- from the carousel ----------
  async function openFromCarousel(i) {
    if (busy || current >= 0) return;
    busy = true;
    source = 'carousel';
    if (scrollY > 2) await new Promise((res) => gsap.to(window, { scrollTo: 0, duration: 0.5, ease: 'power2.out', onComplete: res }));
    root.classList.add('has-case');
    stageEl.classList.add('is-fixed');
    carousel.relayout();
    gsap.to(hero, { opacity: 0, duration: 0.5, ease: 'power2.out' });
    history.pushState({ case: slugOf(i) }, '', `#/cases/${slugOf(i)}`);

    // Where the card's headline is on screen right now, and where the case page wants it. The page is
    // built (invisibly) first so the final spot can be measured; a copy of the text then travels there
    // while the slide grows, and the page takes over without a visible change.
    const from = carousel.textAnchor(i);
    build(i);
    overlay.hidden = false;
    overlay.style.visibility = 'hidden';
    const fly = flyingCopy(from);
    await carousel.open(i);
    flown = true;
    show(i, 0.5, true);
    flown = false;
    gsap.delayedCall(0.55, () => fly.remove());
    busy = false;
  }

  // A fixed copy of the hero text, drawn over the card's own text and moved to the hero's real spot.
  // `from` is the card's headline in screen pixels (carousel.textAnchor).
  function flyingCopy(from) {
    const lead = $('.cd-hero__lead', overlay);
    const to = lead.getBoundingClientRect();
    const finalFs = parseFloat(getComputedStyle(lead).fontSize);
    const fly = lead.cloneNode(true);
    fly.classList.add('cd-fly');
    document.body.appendChild(fly);
    gsap.set(fly, { left: to.left, top: to.top, x: from.x - to.left, y: from.y - to.top, scale: (from.fs * from.k) / finalFs });
    gsap.to(fly, { x: 0, y: 0, scale: 1, duration: 1.4, ease: 'expo.inOut' });
    return fly;
  }

  // ---------- from a card ----------
  function cloneOf(media) {
    const clone = media.cloneNode(true);
    Object.assign(clone.style, {
      position: 'fixed', margin: '0', zIndex: '70', transform: 'none', clipPath: 'none', maxHeight: 'none',
      pointerEvents: 'none', boxShadow: 'none', transition: 'none',
    });
    return clone;
  }
  // A layer with the text-free picture exactly as the full-screen slide draws it, laid over a clone, so the
  // picture can change into the slide's crop while it moves and the hand-over has nothing to jump.
  function bareLayer(clone, i) {
    const src = carousel.barePicture(i);
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    c.getContext('2d').drawImage(src, 0, 0);
    Object.assign(c.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: 'cover', opacity: '0', pointerEvents: 'none' });
    const stat = $('.case__stat', clone);
    if (stat) clone.insertBefore(c, stat); else clone.appendChild(c);
    return c;
  }
  const place = (el, r, radius) => gsap.set(el, { left: r.left, top: r.top, width: r.width, height: r.height, borderRadius: radius });
  const full = () => ({ left: 0, top: 0, width: root.clientWidth, height: innerHeight });

  async function openFromCard(i, media) {
    if (busy || current >= 0) return;
    busy = true;
    source = 'card';
    const r = media.getBoundingClientRect();
    const clone = cloneOf(media);
    clone.style.zIndex = '55';   // under the case page, so its title can rise over the picture while it is still arriving
    document.body.appendChild(clone);
    place(clone, r, 20);
    const layer = bareLayer(clone, i);
    media.style.visibility = 'hidden';
    stageEl.style.opacity = '0';
    root.classList.add('has-case');
    history.pushState({ case: slugOf(i) }, '', `#/cases/${slugOf(i)}`);

    // the card's picture grows to the window; on the way its crop turns into the slide's and the stat box goes
    const grow = gsap.timeline()
      .to(clone, { ...full(), borderRadius: 0, duration: 1.2, ease: 'expo.inOut' }, 0)
      .to(layer, { opacity: 1, duration: 0.7, ease: 'power1.inOut' }, 0.1)
      .to($('.case__stat', clone), { opacity: 0, duration: 0.3, ease: 'power1.out' }, 0);
    await new Promise((res) => grow.call(res, null, 0.9));

    // nearly there: the full-screen slide (the same picture, same crop) takes over underneath and the page's
    // title comes up over it. Nothing fades into anything else.
    stageEl.classList.add('is-fixed');
    carousel.relayout();
    carousel.setCover(i, 1);
    gsap.set(hero, { opacity: 0 });
    stageEl.style.opacity = '1';
    show(i, 0.35);
    await new Promise((res) => grow.eventCallback('onComplete', res));
    await new Promise((res) => gsap.ticker.add(function f() { gsap.ticker.remove(f); res(); }));   // one drawn frame of the slide before the clone goes
    clone.remove();
    busy = false;
  }

  // ---------- closing ----------
  async function closeNow() {
    if (current < 0 || busy) return;
    busy = true;
    const i = current;
    triggers.forEach((t) => t.kill());
    triggers = [];
    caseNudge.disarm();

    // from the carousel the hero text goes back to the card: take a copy of it now, while it is still on screen
    let fly = null;
    if (source === 'carousel') {
      const lead = $('.cd-hero__lead', overlay);
      if (lead) {
        const r = lead.getBoundingClientRect();
        fly = lead.cloneNode(true);
        fly.classList.add('cd-fly');
        document.body.appendChild(fly);
        gsap.set(fly, { left: r.left, top: r.top, x: 0, y: 0, scale: 1 });
      }
    }
    await new Promise((res) => gsap.to(overlay, { opacity: 0, duration: 0.45, ease: 'power2.out', onComplete: res }));
    overlay.hidden = true;
    gsap.set(overlay, { clearProps: 'opacity,transform,borderRadius' });
    content.innerHTML = '';
    carousel.resume();

    if (source === 'carousel') {
      if (fly) {
        const rest = carousel.textAnchor(i, true);
        const finalFs = parseFloat(getComputedStyle(fly).fontSize);
        const r = fly.getBoundingClientRect();
        gsap.to(fly, { x: rest.x - parseFloat(fly.style.left), y: rest.y - parseFloat(fly.style.top), scale: (rest.fs * rest.k) / finalFs, duration: 1.25, ease: 'expo.inOut' });
        gsap.to(fly, { opacity: 0, duration: 0.3, delay: 0.95, ease: 'power1.in', onComplete: () => fly.remove() });
      }
      const back = carousel.close();
      gsap.to(hero, { opacity: 1, duration: 0.8, delay: 0.5, clearProps: 'opacity' });
      await back;
      stageEl.classList.remove('is-fixed');
      carousel.relayout();
    } else {
      const media = $$('.case')[i].querySelector('.case__media');
      media.scrollIntoView({ block: 'center', behavior: 'instant' });
      const r = media.getBoundingClientRect();
      const clone = cloneOf(media);
      document.body.appendChild(clone);
      place(clone, { ...full() }, 0);
      const layer = bareLayer(clone, i);
      layer.style.opacity = '1';
      const stat = $('.case__stat', clone);
      if (stat) stat.style.opacity = '0';
      stageEl.style.opacity = '0';
      stageEl.classList.remove('is-fixed');
      carousel.setCover(-1, 0);
      gsap.set(hero, { clearProps: 'opacity' });
      // shrinking back: the slide's crop turns into the card's, and the stat box returns at the end
      gsap.to(layer, { opacity: 0, duration: 0.7, delay: 0.15, ease: 'power1.inOut' });
      if (stat) gsap.to(stat, { opacity: 1, duration: 0.4, delay: 0.7, ease: 'power1.out' });
      await new Promise((res) => gsap.to(clone, { left: r.left, top: r.top, width: r.width, height: r.height, borderRadius: 20, duration: 1.1, ease: 'expo.inOut', onComplete: res }));
      media.style.visibility = '';
      clone.remove();
      carousel.relayout();
      stageEl.style.opacity = '';
    }
    root.classList.remove('has-case');
    $('#header').classList.remove('is-sheet');
    const onPaper = !!(window.PaperTrigger && window.PaperTrigger.isActive);
    $('#island').classList.toggle('is-paper', onPaper);
    document.title = SITE_TITLE;
    current = -1;
    busy = false;
  }

  // the browser's back button is the one source of truth, so history and screen never disagree
  function requestClose() {
    if (current < 0 || busy) return;
    if (history.state && history.state.case) history.back();
    else closeNow();
  }

  // close from outside (the menu) and know when it is done
  function closeAndWait() {
    return new Promise((res) => {
      if (current < 0) return res();
      requestClose();
      const t = setInterval(() => { if (current < 0 && !busy) { clearInterval(t); res(); } }, 60);
    });
  }

  // jump to another case without leaving the page (the "next case" link)
  async function switchTo(i) {
    if (busy || current < 0) return;
    busy = true;
    triggers.forEach((t) => t.kill());
    triggers = [];
    gsap.to(content, { y: -90, duration: 0.5, ease: 'power2.in' });
    await new Promise((res) => gsap.to(overlay, { opacity: 0, duration: 0.45, ease: 'power2.out', onComplete: res }));
    carousel.resume();
    carousel.setCover(i, 1);
    history.replaceState({ case: slugOf(i) }, '', `#/cases/${slugOf(i)}`);
    await new Promise((res) => gsap.delayedCall(0.2, res));
    busy = false;
    show(i, 0.6);
    gsap.fromTo(content, { y: 110 }, { y: 0, duration: 1.1, ease: 'expo.out', clearProps: 'transform' });
  }

  // ---------- opening straight from the address (a shared link, a reload, "forward") ----------
  function indexFromHash() {
    const m = location.hash.match(/^#\/cases\/([\w-]+)/);
    return m ? PROJECTS.findIndex((p) => p.slug === m[1]) : -1;
  }
  function restoreFromHash(scrollTo = 0) {
    const i = indexFromHash();
    if (i < 0 || current >= 0) return false;
    source = 'carousel';
    root.classList.add('has-case');
    stageEl.classList.add('is-fixed');
    carousel.relayout();
    carousel.setCover(i, 1);
    gsap.set(hero, { opacity: 0 });
    // keep a base entry in history so "back" returns to the carousel instead of leaving the site
    if (!history.state || !history.state.case) {
      history.replaceState({}, '', location.pathname + location.search);
      history.pushState({ case: slugOf(i) }, '', `#/cases/${slugOf(i)}`);
    }
    show(i, 0.8);
    if (scrollTo > 0) {
      // put the page back where it was, with what is already behind it in its final state (no replays)
      overlay.scrollTop = scrollTo;
      ScrollTrigger.update();
      triggers.forEach((t) => { const a = t.animation; if (a && !t.vars.scrub && t.scroll() >= t.start) a.progress(1); });
    }
    return true;
  }

  addEventListener('popstate', () => {
    if (indexFromHash() < 0) closeNow();
    else if (current < 0) restoreFromHash();
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') requestClose(); });
  $('#cdBack').addEventListener('click', requestClose);
  // desktop: the logo, which stays on screen over a case page, takes you back out of it
  $('#header .logo').addEventListener('click', (e) => {
    if (current < 0) return;
    e.preventDefault(); e.stopImmediatePropagation();
    requestClose();
  }, true);

  // clicking a card's picture (or anywhere on the card) opens its case
  $('#casesGrid').addEventListener('click', (e) => {
    const link = e.target.closest('.case__link');
    if (!link) return;
    e.preventDefault();
    const i = +link.closest('.case').dataset.index;
    openFromCard(i, $('.case__media', link));
  });

  // ---------- pull down at the top to close (touch) ----------
  const PULL_AT = 120;
  let pull = null;
  overlay.addEventListener('touchstart', (e) => {
    if (current < 0 || busy || e.touches.length !== 1) { pull = null; return; }
    pull = { y: e.touches[0].clientY, x: e.touches[0].clientX, on: false, d: 0 };
  }, { passive: true });
  overlay.addEventListener('touchmove', (e) => {
    if (!pull) return;
    const dy = e.touches[0].clientY - pull.y;
    if (!pull.on) {
      // only a downward drag that starts with the page at the very top, and is mostly vertical
      if (overlay.scrollTop > 0) { pull = null; return; }
      if (dy < 8 || Math.abs(e.touches[0].clientX - pull.x) > dy) return;
      pull.on = true;
    }
    e.preventDefault();
    pull.d = Math.max(0, dy);
    const d = pull.d * 0.55;
    gsap.set(overlay, { y: d, scale: 1 - Math.min(d, 260) / 1500, borderRadius: Math.min(d / 4, 36), transformOrigin: '50% 0' });
  }, { passive: false });
  const letGo = () => {
    if (!pull || !pull.on) { pull = null; return; }
    const far = pull.d >= PULL_AT;
    pull = null;
    if (far) requestClose();
    else gsap.to(overlay, { y: 0, scale: 1, borderRadius: 0, duration: 0.6, ease: 'back.out(1.7)', clearProps: 'transform,borderRadius' });
  };
  overlay.addEventListener('touchend', letGo, { passive: true });
  overlay.addEventListener('touchcancel', letGo, { passive: true });

  // ---------- scrolling: the vertical "roll" ----------
  // Pictures lean and stretch a little with scroll speed, the way the carousel's slides do.
  let lastTop = 0;
  let vel = 0;
  gsap.ticker.add(() => {
    if (current < 0 || overlay.hidden) return;
    const top = overlay.scrollTop;
    vel += ((top - lastTop) - vel) * 0.14;
    lastTop = top;
    const v = gsap.utils.clamp(-60, 60, vel);
    const vh = innerHeight;
    $$('[data-bend]', content).forEach((el) => {
      const b = el.getBoundingClientRect();
      if (b.bottom < -50 || b.top > vh + 50) return;
      if (Math.abs(v) < 0.08) { el.style.transform = ''; return; }
      const off = (b.top + b.height / 2) / vh - 0.5;           // -0.5 at the top edge, 0.5 at the bottom
      el.style.transform = `perspective(1200px) rotateX(${(-off * v * 0.16).toFixed(3)}deg) scaleY(${(1 - Math.abs(v) * 0.0012).toFixed(4)})`;
    });
  });

  return {
    openFromCarousel, openFromCard, restoreFromHash, close: closeAndWait,
    scrollTop: () => (current >= 0 ? overlay.scrollTop : 0),
    get isOpen() { return current >= 0; },
  };
})();
