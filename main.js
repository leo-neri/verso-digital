gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

const isTouch = matchMedia('(pointer: coarse)').matches;
const START_INDEX = 1;   // Cantão

// ---------- carousel ----------
const carousel = createCarousel({
  container: $('#stage'),
  projects: PROJECTS,
  onSelect: (index) => CaseView.openFromCarousel(index),
});
// What the page looked like when it was last left (a reload): kept, so that coming back shows the same thing
const resume = (() => {
  if (!document.documentElement.classList.contains('skip-intro')) return null;
  try { return JSON.parse(sessionStorage.getItem('verso-state') || 'null'); } catch (e) { return null; }
})();
carousel.jumpTo(resume && Number.isInteger(resume.slide) ? resume.slide : START_INDEX);

// hide the hint once the user has interacted
let hinted = false;
const hideHint = () => {
  if (hinted) return;
  hinted = true;
  gsap.to('#hint', { opacity: 0, y: 8, duration: 0.5 });
};
['pointerdown', 'keydown'].forEach((ev) => addEventListener(ev, hideHint, { passive: true, once: true }));

// ---------- custom cursor ----------
if (!isTouch) {
  const cursor = $('#cursor');
  const label = $('#cursorLabel');
  const moveX = gsap.quickTo(cursor, 'x', { duration: 0.45, ease: 'power3.out' });
  const moveY = gsap.quickTo(cursor, 'y', { duration: 0.45, ease: 'power3.out' });
  let mode = '';
  let px = -1, py = -1;
  addEventListener('pointermove', (e) => { px = e.clientX; py = e.clientY; moveX(px); moveY(py); });
  gsap.ticker.add(() => {
    const over = px < 0 ? null : document.elementFromPoint(px, py);
    const custom = over && over.closest('[data-cursor]');
    const overStage = over && over.closest('#stage');
    let next = '';
    if (custom) next = custom.dataset.cursor;
    else if (overStage) next = carousel.hovered !== null ? 'Ver' : 'Arraste';
    cursor.classList.toggle('is-dark', !!custom);
    if (next === mode) return;
    mode = next;
    if (next) label.textContent = next;
    gsap.to(cursor, { scale: next ? 1 : 0, opacity: next ? 1 : 0, duration: 0.45, ease: 'power3.out', overwrite: 'auto' });
  });
}

// ---------- smooth anchor scrolling ----------
$$('[data-scroll]').forEach((a) => a.addEventListener('click', (e) => {
  const target = a.getAttribute('href');
  if (!target.startsWith('#')) return;
  e.preventDefault();
  gsap.to(window, { scrollTo: target === '#top' ? 0 : { y: target, offsetY: 0 }, duration: 1.4, ease: 'power3.inOut' });
}));

// header hides on scroll down, returns on scroll up (desktop; phones use the island menu)
let lastY = 0;
ScrollTrigger.create({
  start: 0, end: 'max',
  onUpdate(self) {
    const y = self.scroll();
    const hide = y > innerHeight * 0.6 && y > lastY;
    gsap.to('#header', { yPercent: hide ? -120 : 0, duration: 0.5, ease: 'power3.out', overwrite: true });
    lastY = y;
  },
});

// ---------- remembering the state, for the next load ----------
function saveState() {
  try {
    sessionStorage.setItem('verso-state', JSON.stringify({ y: Math.round(scrollY), slide: carousel.currentIndex(), caseY: CaseView.scrollTop() }));
  } catch (e) { /* storage blocked: a reload just starts from the top */ }
}
addEventListener('pagehide', saveState);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveState(); });

// ---------- scroll hint ----------
const homeNudge = Nudge.watch({
  scroller: window,
  getY: () => scrollY,
  canRun: () => !isLoading() && !CaseView.isOpen && !(window.Menu && Menu.isOpen),
});

// ---------- intro ----------
// What "ready" means: web fonts, the page assets and the backdrop photo are all in.
// All the heavy work (GPU uploads, scroll triggers, text splitting) happens here, behind the
// loader, so that nothing expensive is left for the moment the page opens.
function whenReady(wireSections = true) {
  // "loaded" is judged by the load event; Image.decode() can stall in a tab that isn't being shown
  const photo = new Image();
  const photoIn = new Promise((res) => { photo.onload = photo.onerror = res; });
  photo.src = 'bg.webp';
  if (photo.complete) photo.onload = null;
  const everything = Promise.all([
    document.fonts.ready,
    photo.complete ? null : photoIn,
    carousel.ready.catch(() => {}),
    document.readyState === 'complete' ? null : new Promise((res) => addEventListener('load', res, { once: true })),
  ]);
  // never leave the visitor on the loader because of one slow or failed asset
  const giveUp = new Promise((res) => setTimeout(res, 12000));
  return Promise.race([everything, giveUp]).then(() => {
    if (wireSections) initSections();
  });
}

// Called while the ellipse is opening: the sharp photo fades into its blurred twin and the
// site comes in. Only opacity changes here, so it stays on the compositor.
// `fast` is the reload case: no photo-to-blur fade, and the rest of the entrance plays about twice as fast.
function reveal(fast = false) {
  try { sessionStorage.setItem('verso-intro', '1'); } catch (e) { /* storage blocked: the intro just plays every time */ }
  performance.mark('verso:reveal');   // when the site was let in (handy for measuring the intro)
  document.documentElement.classList.remove('is-loading');
  if (fast) {
    gsap.set('#backdropSharp', { opacity: 0, display: 'none' });
    gsap.set('#backdropScrim', { opacity: 1 });
  } else {
    gsap.to('#backdropSharp', { opacity: 0, duration: 2.4, ease: 'power2.inOut', onComplete: () => { $('#backdropSharp').style.display = 'none'; } });
    gsap.to('#backdropScrim', { opacity: 1, duration: 2.4, ease: 'power2.inOut' });
  }

  const entrance = gsap.timeline({ onComplete: () => ScrollTrigger.refresh() })
    .add(carousel.enter(), 0.5)
    .call(() => CaseView.restoreFromHash(resume ? resume.caseY || 0 : 0), null, 0.6)
    .to('.header > *', { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out', stagger: 0.06 }, 0.05)
    .to('.hint', { opacity: 1, y: 0, duration: 1, ease: 'power3.out' }, 1.5)
    // a few seconds of stillness and the page tugs itself twice, to show that it scrolls
    .call(() => homeNudge.arm(), null, 1.5);
  if (fast) entrance.timeScale(2.4);
}

// No scrolling until the page opens (see the note on .is-loading in styles.css)
const isLoading = () => document.documentElement.classList.contains('is-loading');
['wheel', 'touchmove'].forEach((ev) => addEventListener(ev, (e) => { if (isLoading()) e.preventDefault(); }, { passive: false }));
addEventListener('keydown', (e) => {
  if (isLoading() && [' ', 'PageDown', 'PageUp', 'End', 'Home', 'ArrowDown', 'ArrowUp'].includes(e.key)) e.preventDefault();
});

// A reload of the home page: the page is already on screen as it was (see the head of index.html), so
// all that is left is to put the scroll position back, wire the scroll animations to match, and let
// the carousel fade in when its pictures are in.
function restoreHome() {
  performance.mark('verso:restore');
  const root = document.documentElement;
  root.classList.add('is-restoring');           // the scroll "gravity" leaves the restored position alone
  initSections();
  ScrollTrigger.refresh();
  const y = (resume && resume.y) || 0;
  lastY = y;                                    // so the header doesn't take the jump for a scroll down
  scrollTo(0, y);
  ScrollTrigger.update();
  // whatever was already scrolled past stays in its final state instead of animating in again
  ScrollTrigger.getAll().forEach((st) => { const a = st.animation; if (a && !st.vars.scrub && st.scroll() >= st.start) a.progress(1); });
  document.fonts.ready.then(() => ScrollTrigger.refresh());
  setTimeout(() => root.classList.remove('is-restoring'), 800);
  whenReady(false).then(() => { carousel.quickEnter(); homeNudge.arm(); });
}

const reloaded = document.documentElement.classList.contains('skip-intro');
if (reloaded && !/^#\/cases\//.test(location.hash)) {
  restoreHome();
} else {
  gsap.set(['.header > *', '.hint'], { opacity: 0, y: 16 });
  if (reloaded) whenReady().then(() => reveal(true));   // reloaded with a case open: the case is put back when the site comes in
  else runLogoLoader(whenReady()).then(() => reveal());
}
