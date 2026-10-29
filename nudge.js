// Scroll hint.
//
// There is no "scroll" label anywhere on the site, so if someone sits still the page gives them a
// hint with its body instead: two quick, small tugs downwards (a few dozen pixels, and back), as if
// the page were trying to move. It tries a first time after a few seconds of stillness and, if the
// visitor still hasn't touched anything, once more a while later. Any real input (wheel, touch,
// key, click, the scrollbar) switches it off for good.
//
// Nudge.watch({ scroller, getY, canRun }) returns { arm, disarm }.
//   scroller  window, or an element that scrolls (the case page)
//   getY      current scroll position of that scroller
//   canRun    extra condition checked right before a nudge (not loading, no menu open, ...)
window.Nudge = (function () {
  const FIRST = 5500;     // ms of stillness before the first hint
  const AGAIN = 13000;    // ...and before the second
  const ROUNDS = 2;

  function watch({ scroller, getY, canRun = () => true, first = FIRST, again = AGAIN }) {
    const isWindow = scroller === window;
    const listenOn = isWindow ? window : scroller;
    let armed = false;
    let nudging = false;
    let timer = null;
    let rounds = 0;
    let tl = null;

    const clear = () => { clearTimeout(timer); timer = null; };
    const schedule = (ms) => { clear(); if (armed) timer = setTimeout(run, ms); };

    function run() {
      if (!armed) return;
      // not now (loading, a menu is open, the page isn't at the top): look again a bit later
      if (!canRun() || getY() > 2) { schedule(2500); return; }
      const d = gsap.utils.clamp(26, 46, innerHeight * 0.055);
      nudging = true;
      document.documentElement.classList.add('is-nudging');   // the scroll "gravity" stays out of it
      tl = gsap.timeline({
        onComplete: () => { nudging = false; document.documentElement.classList.remove('is-nudging'); rounds += 1; if (rounds < ROUNDS) schedule(again); },
      });
      for (let i = 0; i < 2; i++) {
        tl.to(scroller, { scrollTo: { y: d }, duration: 0.2, ease: 'power2.out' })
          .to(scroller, { scrollTo: { y: 0 }, duration: 0.4, ease: 'power3.out' })
          .to({}, { duration: 0.1 });
      }
    }

    // anything the visitor does means they've found their way: stop for good
    function touched() {
      if (!armed) return;
      armed = false;
      clear();
      if (tl) { tl.kill(); tl = null; }
      nudging = false;
      document.documentElement.classList.remove('is-nudging');
    }
    ['wheel', 'touchstart', 'pointerdown'].forEach((ev) => listenOn.addEventListener(ev, touched, { passive: true }));
    addEventListener('keydown', touched, { passive: true });
    // a scroll that isn't ours (the scrollbar, a keyboard jump)
    listenOn.addEventListener('scroll', () => { if (!nudging && getY() > 4) touched(); }, { passive: true });

    return {
      arm() { armed = true; rounds = 0; schedule(first); },
      disarm() { armed = false; clear(); if (tl) { tl.kill(); tl = null; } nudging = false; document.documentElement.classList.remove('is-nudging'); },
    };
  }

  return { watch };
})();
