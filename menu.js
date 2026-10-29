// Menu: a "dynamic island" pair (phones only; wide screens use the regular header).
//
// At the top, a trapezoid holding the logo. At the bottom, a button of the same size, both
// windows onto the sharp photo. The button carries two lines. Pressing it blurs and lightens the
// page, the button shrinks into a ball, its two lines turn into an "X" and the navigation rises
// above it. Pressing again (or Esc, or the veil) puts everything back.
window.Menu = (function () {
  const root = document.documentElement;
  const btn = $('#dockBtn');
  const veil = $('#menuVeil');
  const menu = $('#menu');
  const island = $('#island');
  const links = $$('a', menu);
  const [lineA, lineB] = $$('.dock__icon i', btn);

  const cssPx = (name, fallback) => parseFloat(getComputedStyle(root).getPropertyValue(name)) || fallback;
  const WIDE = cssPx('--island-w', 145);   // resting width, same as the island
  const ROUND = cssPx('--island-h', 41);   // ...and the ball is as round as the button is tall
  const GAP = 3.6;                          // how far each line sits from the centre when they're parallel
  let isOpen = false;
  let tl = null;

  // resting states, set once so every open/close just tweens between them
  gsap.set(links, { y: 14, opacity: 0, filter: 'blur(6px)' });
  gsap.set(lineA, { y: -GAP, rotate: 0 });
  gsap.set(lineB, { y: GAP, rotate: 0 });

  function open() {
    if (isOpen) return;
    isOpen = true;
    root.classList.add('menu-open');
    btn.setAttribute('aria-expanded', 'true');
    btn.setAttribute('aria-label', 'Fechar menu');
    menu.setAttribute('aria-hidden', 'false');
    tl?.kill();
    tl = gsap.timeline();
    tl.set([veil, menu], { visibility: 'visible' })
      // the page goes soft and bright
      .to(veil, { opacity: 1, '--veil-blur': '24px', duration: 0.38, ease: 'power2.out' }, 0)
      // the button pulls in to a ball while its two lines cross into an X
      .to(btn, { width: ROUND, duration: 0.42, ease: 'expo.out' }, 0)
      .to(lineA, { y: 0, rotate: 45, duration: 0.4, ease: 'power3.out' }, 0)
      .to(lineB, { y: 0, rotate: -45, duration: 0.4, ease: 'power3.out' }, 0)
      // ...and the list rises out of it
      .to(links, { y: 0, opacity: 1, filter: 'blur(0px)', duration: 0.42, ease: 'expo.out', stagger: { each: 0.04, from: 'end' } }, 0.05);
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', 'Abrir menu');
    menu.setAttribute('aria-hidden', 'true');
    tl?.kill();
    tl = gsap.timeline({
      onComplete: () => {
        gsap.set([veil, menu], { visibility: 'hidden' });
        root.classList.remove('menu-open');
      },
    });
    tl.to(links, { y: 10, opacity: 0, filter: 'blur(4px)', duration: 0.18, ease: 'power2.in', stagger: { each: 0.02, from: 'start' } }, 0)
      .to(btn, { width: WIDE, duration: 0.4, ease: 'expo.out' }, 0.04)
      .to(lineA, { y: -GAP, rotate: 0, duration: 0.34, ease: 'power3.out' }, 0.04)
      .to(lineB, { y: GAP, rotate: 0, duration: 0.34, ease: 'power3.out' }, 0.04)
      .to(veil, { opacity: 0, '--veil-blur': '0px', duration: 0.3, ease: 'power2.inOut' }, 0.06);
  }

  // the menu only exists on phones; if the window grows past that, put it away
  matchMedia('(min-width: 769px)').addEventListener('change', (e) => { if (e.matches && isOpen) close(); });

  btn.addEventListener('click', () => (isOpen ? close() : open()));
  veil.addEventListener('click', close);

  // the page underneath doesn't scroll while the menu is up (touch is handled by touch-action in the CSS:
  // cancelling touchmove from JS could turn a slightly shaky tap into a swipe and lose the click)
  [veil, menu].forEach((el) => {
    el.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
  });

  // Esc closes the menu first, and only the menu (capture phase, before the case page hears it)
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) { e.stopImmediatePropagation(); close(); }
  }, true);

  // going somewhere: close the menu, close an open case if there is one, then glide there
  async function go(target) {
    close();
    if (CaseView.isOpen) await CaseView.close();
    gsap.to(window, { scrollTo: target === '#top' ? 0 : target, duration: 1.4, ease: 'power3.inOut' });
  }
  links.forEach((a) => a.addEventListener('click', (e) => {
    if (a.hasAttribute('data-external')) {
      // WhatsApp. Opened by hand so nothing can swallow it: phones hand wa.me to the WhatsApp app in
      // the same tab, wide screens open a new one
      e.preventDefault();
      close();
      if (matchMedia('(max-width: 768px)').matches) location.href = a.href;
      else if (!window.open(a.href, '_blank', 'noopener')) location.href = a.href;
      return;
    }
    e.preventDefault();
    go(a.getAttribute('href'));
  }));
  island.addEventListener('click', (e) => { e.preventDefault(); go('#top'); });

  return { open, close, get isOpen() { return isOpen; } };
})();
