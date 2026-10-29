// Curved WebGL carousel (Three.js + GSAP).
//
// Every slide is a plane. Its vertex shader wraps it on a cylinder and bends it with the
// scroll velocity; the JS side lays the planes out on a 3D arc. Hovering a slide opens the
// arc further ("curves forward") and pulls the slide towards the camera around the pointer.
window.createCarousel = function createCarousel({ container, projects, onActive, onSelect }) {
  const N = projects.length;
  const FOV = 45;
  const ARC_IDLE = 0.58;     // how curved the arc is at rest (0 = flat row, 1 = full arc)
  const ARC_HOVER = 1;       // ...and while a slide is hovered
  // Each slide keeps the same angular step (200° / 6) however many projects there are, so the
  // arc looks the same with 4 slides as it did with 6; HALF_ARC is the fade/scale reference.
  const STEP = THREE.MathUtils.degToRad(200 / 6);
  const TOTAL_ARC = STEP * N;
  const HALF_ARC = THREE.MathUtils.degToRad(100);
  const Z_RATIO = 0.9;       // depth of the arc relative to its horizontal radius
  const PULL = 120;          // px a hovered slide is pulled towards the camera
  const EASE = 0.085;        // scroll smoothing per frame at 60fps
  const BORDER = 0.42;       // rim light on the slides (0 = no border)

  const state = { pos: 0, target: 0, prev: 0, vel: 0, arc: 0, enter: 0 };
  // "cover": how far the opened slide has grown to fill the screen (0 = in the arc, 1 = full screen)
  const cover = { i: -1, p: 0, b: 0 };   // b: how much of the text-free picture is showing (0 = the card as it was)
  let frozen = false;
  // nothing is drawn while the carousel is scrolled out of view (the rest of the page is long)
  let onScreen = true;
  new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; }).observe(container);
  let radiusPx = 14;
  let coverScale = 1;
  const isTouch = matchMedia('(pointer: coarse)').matches;

  // ---------- renderer / scene ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 10000);
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  // ---------- shaders ----------
  const vertexShader = /* glsl */ `
    uniform float uRadius;      // cylinder radius the slide is wrapped on
    uniform float uWrap;        // 1 = wrapped on that cylinder, 0 = a flat plane (while a case is open)
    uniform float uOval;        // depth / width ratio of that cylinder
    uniform float uCurve;       // extra edge bending
    uniform float uVelocity;    // scroll velocity (skews + squeezes the slide)
    uniform float uPull;        // hover pull towards the camera
    uniform vec2  uPullOrigin;  // where on the slide (uv) the pull is centred
    varying vec2 vUv;
    void main() {
      vUv = uv;
      vec3 p = position;
      float a = p.x / uRadius;
      p.x = mix(p.x, sin(a) * uRadius, uWrap);
      p.z -= (1.0 - cos(a)) * uRadius * uOval * uWrap;
      p.z -= (p.x * p.x + p.y * p.y * 0.3) * uCurve * 6e-4;
      float c = 1.0 - pow((uv.y - 0.5) * 2.0, 2.0);
      p.x += uVelocity * 0.06 * c;
      p.y *= 1.0 - abs(uVelocity) * 0.008 * c;
      p.z += uPull * (1.0 - smoothstep(0.0, 0.9, distance(uv, uPullOrigin)));
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }`;

  const fragmentShader = /* glsl */ `
    precision highp float;
    uniform sampler2D uMap;
    uniform sampler2D uMapBare;   // the same picture without the headline and button
    uniform float uBare;          // 0 = with headline, 1 = bare (used while a case is open)
    uniform vec2  uSize;        // slide size in px (for the rounded corners)
    uniform vec2  uCoverScale;  // "object-fit: cover" crop
    uniform float uRadiusPx;
    uniform float uBorder;      // rim light strength (0 = off)
    uniform float uBorderPx;    // rim thickness in px
    uniform float uVelocity;
    uniform float uDim;
    uniform float uAlpha;
    varying vec2 vUv;
    float roundedBox(vec2 uv) {
      vec2 q = (uv - 0.5) * uSize;
      vec2 d = abs(q) - (uSize * 0.5 - uRadiusPx);
      return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - uRadiusPx;
    }
    vec3 tex(vec2 p) { return mix(texture2D(uMap, p).rgb, texture2D(uMapBare, p).rgb, uBare); }
    void main() {
      vec2 uv = (vUv - 0.5) * uCoverScale + 0.5;
      float s = clamp(uVelocity * 0.0016, -0.012, 0.012);
      vec3 col = tex(uv);
      // while it moves: a soft horizontal smear and a pale veil (no colour fringes)
      if (abs(s) > 1e-4) col = (col + tex(uv + vec2(s, 0.0)) + tex(uv - vec2(s, 0.0))) / 3.0;
      col = mix(col, vec3(1.0), clamp(abs(uVelocity) * 0.0035, 0.0, 0.2));
      col *= uDim;
      float d = roundedBox(vUv);
      float mask = 1.0 - smoothstep(-1.0, 1.0, d);
      // hairline rim light: a thin bright line just inside the edge, strongest at the top
      float rim = smoothstep(-uBorderPx - 1.0, -uBorderPx, d) * (1.0 - smoothstep(-0.5, 0.5, d));
      col = mix(col, vec3(1.0), rim * uBorder * (0.55 + 0.45 * vUv.y));
      gl_FragColor = vec4(col, uAlpha * mask);
    }`;

  // ---------- slide textures (image placeholders) ----------
  // Phones get portrait slides (3:2 tall) with a short text at the bottom; wider screens get the
  // landscape ones. The headline and the name pill are painted into the texture, so the pictures are
  // drawn for the layout in use and drawn again if the window crosses the breakpoint.
  const PHONE = 760;
  let mobile = (container.clientWidth || innerWidth) < PHONE;
  const photos = projects.map((p) => {
    if (!p.images || !p.images.hero) return null;
    const im = new Image();
    im.src = p.images.hero;
    return im;
  });
  const photosIn = Promise.all(photos.map((im) => (im && !im.complete ? new Promise((r) => { im.onload = im.onerror = r; }) : null)));
  let fontsIn = false;
  const textures = projects.map((p, i) => new THREE.CanvasTexture(drawPlaceholder(p, i, true, mobile)));
  const bareTextures = projects.map((p, i) => new THREE.CanvasTexture(drawPlaceholder(p, i, false, mobile)));
  [...textures, ...bareTextures].forEach((t) => { t.anisotropy = renderer.capabilities.getMaxAnisotropy(); });

  // repaint (once the web font is in, or when the layout flips) and upload to the GPU right away,
  // behind the loader, so the first visible frame doesn't stall
  function repaint() {
    textures.forEach((t, i) => {
      t.image = drawPlaceholder(projects[i], i, true, mobile);
      t.needsUpdate = true;
      renderer.initTexture(t);
      bareTextures[i].image = drawPlaceholder(projects[i], i, false, mobile);
      bareTextures[i].needsUpdate = true;
      renderer.initTexture(bareTextures[i]);
    });
  }
  const ready = Promise.all([
    ...['400 28px "Inter Tight"', '500 66px "Inter Tight"'].map((f) => document.fonts.load(f)),
    Promise.race([photosIn, new Promise((r) => setTimeout(r, 6000))]),   // don't hold the site up for a slow photo
  ]).then(() => {
    fontsIn = true;
    repaint();
  });
  photosIn.then(() => { if (fontsIn) repaint(); });   // a photo that arrived late still gets in

  const meshes = projects.map((_, i) => {
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uMap: { value: textures[i] },
        uMapBare: { value: bareTextures[i] },
        uBare: { value: 0 },
        uSize: { value: new THREE.Vector2(1, 1) },
        uCoverScale: { value: new THREE.Vector2(1, 1) },
        uRadiusPx: { value: 14 },
        uBorder: { value: BORDER },
        uBorderPx: { value: 1.5 },
        uRadius: { value: 1000 },
        uWrap: { value: 1 },
        uOval: { value: Z_RATIO },
        uCurve: { value: 0 },
        uVelocity: { value: 0 },
        uPull: { value: 0 },
        uPullOrigin: { value: new THREE.Vector2(0.5, 0.5) },
        uDim: { value: 1 },
        uAlpha: { value: 0 },
      },
    });
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
  });

  // per-slide smoothed values
  const scale = new Array(N).fill(1);
  const curve = new Array(N).fill(0);
  const pull = new Array(N).fill(0);
  const pullOrigin = projects.map(() => new THREE.Vector2(0.5, 0.5));
  let hovered = null;
  let hasPointer = false;

  // ---------- layout ----------
  let coverVec = new THREE.Vector2(1, 1);
  let W = 1, H = 1, camDist = 1, slideW = 1, slideH = 1, spacing = 1, loopW = 1, radiusX = 1, radiusZ = 1, ovalRatio = 1, halfArc = 1;
  const wrapIndex = (i) => ((i % N) + N) % N;

  function layout() {
    W = container.clientWidth || innerWidth;
    H = container.clientHeight || innerHeight;
    renderer.setSize(W, H);
    camDist = H / (2 * Math.tan(THREE.MathUtils.degToRad(FOV) / 2));   // 1 world unit == 1 css px at z = 0
    camera.aspect = W / H;
    camera.far = camDist * 6;
    camera.position.set(0, 0, camDist);
    camera.updateProjectionMatrix();

    const small = W < PHONE;
    if (small !== mobile) { mobile = small; if (fontsIn) repaint(); }
    if (small) {
      // tall cards, close to 2:3, with the neighbours peeking in from the sides
      slideW = Math.min(W * 0.7, 420);
      slideH = Math.min(slideW * 1.5, H * 0.72);
    } else {
      slideW = Math.min(980, W * 0.52);
      slideH = Math.min(slideW * 0.6, H * 0.62);
    }
    // when the window changes size the slides change size too: carry the position along so the same
    // slide stays centred (a phone turning round, a resized window)
    const prevSpacing = spacing;
    spacing = slideW + slideW * 0.09;
    if (prevSpacing > 1 && Math.abs(spacing - prevSpacing) > 0.5) {
      const f = spacing / prevSpacing;
      state.pos *= f; state.target *= f; state.prev *= f;
    }
    loopW = N * spacing;
    halfArc = HALF_ARC;
    radiusX = loopW / TOTAL_ARC;
    radiusZ = radiusX * Z_RATIO;
    ovalRatio = radiusZ / radiusX;

    const cover = new THREE.Vector2(1, 1);
    coverVec = cover;
    const texRatio = small ? 1.5 : 0.6;   // height / width of the drawn pictures
    const ratio = slideH / slideW;
    if (ratio > texRatio) cover.x = texRatio / ratio; else cover.y = ratio / texRatio;

    radiusPx = Math.max(8, slideW * 0.014);
    coverScale = Math.max(W / slideW, H / slideH) * 1.01;   // uniform, so the picture is cropped, never stretched
    const geo = new THREE.PlaneGeometry(slideW, slideH, 32, 16);
    meshes.forEach((m) => {
      m.geometry.dispose();
      m.geometry = geo;
      const u = m.material.uniforms;
      u.uRadius.value = radiusX;
      u.uOval.value = ovalRatio;
      u.uSize.value.set(slideW, slideH);
      u.uCoverScale.value.copy(cover);
      u.uRadiusPx.value = radiusPx;
    });
  }

  // Arc position/rotation/scale of slide r. `arcOpen` morphs a flat row into the arc.
  function transform(r, velocity) {
    let i = (r * spacing + state.pos) % loopW;
    i = ((i % loopW) + loopW) % loopW;
    if (i > loopW / 2) i -= loopW;

    const n = i / radiusX;
    const u = state.arc;
    const x = THREE.MathUtils.lerp(i, Math.sin(n) * radiusX, u);
    const z = THREE.MathUtils.lerp(0, (Math.cos(n) - 1) * radiusZ, u);
    const rotY = THREE.MathUtils.lerp(0, n * ovalRatio, u);
    const p = Math.min(1, Math.abs(n) / halfArc);

    const lift = 1 + 0.05 * Math.max(0, 1 - p * 2.4) * u;   // the slide in front is a touch bigger
    const targetScale = THREE.MathUtils.lerp(1, Math.max(0.65, 1 - p * 0.35), u) * lift;
    scale[r] += (targetScale - scale[r]) * 0.15;
    const stretch = Math.min(Math.abs(velocity) * 0.0016, 0.045);
    const enterScale = THREE.MathUtils.lerp(0.78, 1, state.enter);
    const sx = scale[r] * (1 + stretch) * enterScale;
    const sy = scale[r] * (1 - stretch * 0.6) * enterScale;

    curve[r] += (THREE.MathUtils.lerp(0, p * 0.4, u) - curve[r]) * 0.15;
    const fade = THREE.MathUtils.clamp(1 - Math.max(0, (p - 0.72) / 0.28), 0, 1);
    return { x, z, rotY, sx, sy, p, dim: 0.55 + 0.45 * scale[r], curve: curve[r], alpha: fade * state.enter, i };
  }

  // ---------- interaction ----------
  // target position that centres slide `index`, taking the shortest way round the loop
  const snapTo = (index) => {
    const delta = ((-index * spacing - state.target) % loopW + loopW) % loopW;
    return state.target + (delta > loopW / 2 ? delta - loopW : delta);
  };
  const nearestIndex = () => wrapIndex(Math.round(-state.target / spacing));

  let snapTimer;
  // On release the slides keep going with the speed of the flick (inertia) and settle on a slide with a
  // small overshoot, like a spring. `flick` is the release speed in px/ms.
  const settle = (flick = 0) => {
    clearTimeout(snapTimer);
    snapTimer = setTimeout(() => {
      if (drag.active) return;
      const here = Math.round(state.target / spacing);
      const throwBy = gsap.utils.clamp(-2, 2, Math.round((flick * 320) / spacing));
      const goal = (here + throwBy) * spacing;
      const far = Math.abs(goal - state.target) / spacing;
      gsap.to(state, { target: goal, duration: 0.8 + far * 0.25, ease: far > 0.3 ? 'back.out(1.15)' : 'power3.out', overwrite: 'auto' });
    }, flick ? 0 : 140);
  };
  const step = (dir) => {
    gsap.to(state, { target: Math.round(state.target / spacing) * spacing - dir * spacing, duration: 1.1, ease: 'power3.inOut', overwrite: 'auto' });
  };

  // The wheel is NOT captured: scrolling is always the page's normal vertical scroll.
  // The carousel moves by dragging, by clicking a side slide, or with the arrow keys.
  addEventListener('keydown', (e) => {
    if (scrollY > 4 || cover.i >= 0 || document.documentElement.classList.contains('is-loading')) return;
    if (e.key === 'ArrowRight') step(1);
    if (e.key === 'ArrowLeft') step(-1);
  });

  // A press only counts as a click if the finger/mouse lifts again almost where it landed, quickly.
  // Anything else is a drag, or the browser taking the gesture over to scroll the page.
  const TAP_SLOP = 10;    // px of total travel, in any direction
  const TAP_TIME = 700;   // ms
  const drag = { active: false, x: 0, y: 0, t: 0, moved: 0, hit: null, vx: 0, lastT: 0 };
  container.addEventListener('pointerdown', (e) => {
    if (cover.i >= 0) return;
    setNdc(e);
    const pressed = state.enter >= 0.9 ? pick() : null;
    drag.active = true; drag.x = e.clientX; drag.y = e.clientY; drag.t = performance.now(); drag.moved = 0; drag.vx = 0; drag.lastT = performance.now(); drag.hit = pressed ? pressed.index : null;
    gsap.killTweensOf(state, 'target');
    container.setPointerCapture(e.pointerId);
    container.classList.add('is-dragging');
  });
  container.addEventListener('pointermove', (e) => {
    setNdc(e);
    hasPointer = true;
    if (!drag.active) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    drag.moved += Math.hypot(dx, dy);   // vertical travel counts too: it is a page scroll, not a tap
    state.target += dx * 1.25;
    const now = performance.now();
    const dt = Math.max(1, now - drag.lastT);
    drag.vx += ((dx * 1.25) / dt - drag.vx) * 0.5;   // smoothed release speed
    drag.lastT = now;
  });
  const endDrag = (e) => {
    if (!drag.active) return;
    drag.active = false;
    container.classList.remove('is-dragging');
    const isTap = e.type === 'pointerup' && drag.moved < TAP_SLOP && performance.now() - drag.t < TAP_TIME;
    if (isTap && drag.hit !== null && onSelect) {
      onSelect(drag.hit);   // a click on any slide opens that case
      return;
    }
    // a finger that paused before lifting leaves no flick behind
    settle(performance.now() - drag.lastT > 90 ? 0 : drag.vx);
  };
  container.addEventListener('pointerup', endDrag);
  container.addEventListener('pointercancel', endDrag);   // a cancelled gesture is never a click
  container.addEventListener('pointerleave', () => { hasPointer = false; hovered = null; });

  // which slide is under the pointer (the one closest to the camera wins), and where on it
  function pick() {
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(meshes.filter((m) => m.visible && m.material.uniforms.uAlpha.value > 0.3), false);
    if (!hits.length) return null;
    const hit = hits.reduce((a, b) => (a.object.position.z > b.object.position.z ? a : b));
    return { index: meshes.indexOf(hit.object), uv: hit.uv };
  }
  const setNdc = (e) => {
    const rect = container.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -(((e.clientY - rect.top) / rect.height) * 2 - 1));
  };

  function updateHover() {
    if (isTouch || !hasPointer || drag.active || state.enter < 0.9 || cover.i >= 0) { hovered = null; return; }
    const hit = pick();
    if (hit) {
      hovered = hit.index;
      pullOrigin[hovered].x += (hit.uv.x - pullOrigin[hovered].x) * 0.2;
      pullOrigin[hovered].y += (hit.uv.y - pullOrigin[hovered].y) * 0.2;
    } else {
      hovered = null;
    }
  }

  // Open / close the arc when the hover state flips.
  let arcGoal = -1;
  function syncArc() {
    const goal = hovered !== null || drag.active ? ARC_HOVER : ARC_IDLE;
    if (goal === arcGoal || state.enter < 0.9) return;
    arcGoal = goal;
    gsap.to(state, { arc: goal, duration: goal === ARC_HOVER ? 1.1 : 1.4, ease: 'power3.out', overwrite: 'auto' });
  }

  // ---------- frame loop ----------
  let activeIndex = -1;
  function frame(_, deltaMs) {
    if (frozen || !onScreen) return;
    const k = 1 - Math.pow(1 - EASE, Math.min(deltaMs, 50) / 16.667);
    state.pos += (state.target - state.pos) * k;
    state.vel += ((state.pos - state.prev) - state.vel) * 0.12;
    state.prev = state.pos;
    const velocity = THREE.MathUtils.clamp(state.vel * 2.2, -70, 70);

    updateHover();
    syncArc();

    meshes.forEach((m, r) => {
      const t = transform(r, velocity);
      const u = m.material.uniforms;
      const isHover = hovered === r;
      pull[r] += ((isHover ? PULL : 0) - pull[r]) * 0.1;
      if (Math.abs(pull[r]) < 0.05) pull[r] = 0;

      m.position.set(t.x, 0, t.z);
      m.rotation.y = t.rotY;
      m.scale.set(t.sx, t.sy, 1);
      m.renderOrder = Math.round(t.sx * 100);   // nearest slide is drawn last
      u.uCurve.value = t.curve;
      u.uVelocity.value = velocity;
      u.uDim.value = t.dim;
      u.uAlpha.value = t.alpha;
      u.uPull.value = pull[r];
      u.uPullOrigin.value.copy(pullOrigin[r]);
      u.uWrap.value = 1;
      u.uBare.value = 0;
      u.uBorder.value = BORDER;
      u.uRadiusPx.value = radiusPx;

      const c = cover.p;
      if (c > 0 && cover.i >= 0) {
        const L = THREE.MathUtils.lerp;
        if (r === cover.i) {
          // fly to the centre, flatten, lose the corners and grow until it fills the window
          m.position.set(L(t.x, 0, c), 0, L(t.z, 0, c));
          m.rotation.y = L(t.rotY, 0, c);
          m.scale.set(L(t.sx, coverScale, c), L(t.sy, coverScale, c), 1);
          m.renderOrder = 9999;
          u.uWrap.value = 1 - c;
          u.uCurve.value = t.curve * (1 - c);
          u.uVelocity.value = velocity * (1 - c);
          u.uPull.value = pull[r] * (1 - c);
          u.uDim.value = L(t.dim, 1, c);
          u.uAlpha.value = L(t.alpha, 1, c);
          u.uBorder.value = BORDER * (1 - c);
          u.uBare.value = cover.b;
          u.uRadiusPx.value = radiusPx * (1 - c);
        } else {
          u.uAlpha.value = t.alpha * (1 - THREE.MathUtils.smoothstep(c, 0, 0.45));
        }
      }
      m.visible = u.uAlpha.value > 0.005;
    });

    const idx = nearestIndex();
    if (idx !== activeIndex) { activeIndex = idx; onActive?.(idx, state); }
    renderer.render(scene, camera);
  }

  layout();
  addEventListener('resize', layout);
  renderer.compile(scene, camera);   // build the shader program up front
  gsap.ticker.add(frame);

  return {
    ready,
    state,
    get hovered() { return hovered; },
    spacing: () => spacing,
    loopProgress: () => (((-state.pos / spacing) % N) + N) % N / N,
    jumpTo: (i) => { state.target = state.pos = state.prev = -i * spacing; },
    // open a case: slide `i` grows to fill the screen (resolves when it does)
    open(i, duration = 1.4) {
      hovered = null;
      cover.i = i;
      // the card's own text, pill and button fade away at once; the case page brings the headline back as HTML
      gsap.to(cover, { b: 1, duration: 0.14, ease: 'power1.out', overwrite: 'auto' });
      return new Promise((res) => gsap.to(cover, { p: 1, duration, ease: 'expo.inOut', overwrite: 'auto', onComplete: res }));
    },
    // ...and the way back: it shrinks into its place in the arc
    close(duration = 1.25) {
      frozen = false;
      // the text comes back into the picture as the slide settles into its place
      gsap.to(cover, { b: 0, duration: 0.3, delay: Math.max(0, duration - 0.3), ease: 'power1.in', overwrite: 'auto' });
      return new Promise((res) => gsap.to(cover, { p: 0, duration, ease: 'expo.inOut', overwrite: 'auto', onComplete: () => { cover.i = -1; res(); } }));
    },
    // jump straight to the opened state for slide `i` (used when a card, not the carousel, opens the case)
    setCover(i, p = 1) { cover.i = i; cover.p = p; cover.b = p > 0 ? 1 : 0; frozen = false; },
    isMobile: () => mobile,
    // the picture of slide i without text, exactly as it is drawn on the full-screen slide
    barePicture: (i) => bareTextures[i].image,
    currentIndex: () => nearestIndex(),
    // the reload case: the slides are simply there, and fade in as soon as their pictures are ready
    quickEnter() {
      state.arc = ARC_IDLE;
      return gsap.to(state, { enter: 1, duration: 0.35, ease: 'power2.out' });
    },
    // where the card's headline sits on the screen right now (or where it will sit once the slide is
    // back in its place in the arc): its top-left corner and how many screen px one texture px is
    textAnchor(i, atRest = false) {
      const T = textBlock(projects[i], mobile);
      const texW = mobile ? 768 : 1280, texH = mobile ? 1152 : 768;
      const obj = atRest ? new THREE.Object3D() : meshes[i];
      if (atRest) {
        const t = transform(i, 0);
        obj.position.set(t.x, 0, t.z); obj.rotation.y = t.rotY; obj.scale.set(t.sx, t.sy, 1);
      }
      obj.updateMatrixWorld(true);
      const box = container.getBoundingClientRect();
      const project = (tx, ty) => {
        const u = tx / texW, v = 1 - ty / texH;
        const vu = (u - 0.5) / coverVec.x + 0.5, vv = (v - 0.5) / coverVec.y + 0.5;
        const p = obj.localToWorld(new THREE.Vector3((vu - 0.5) * slideW, (vv - 0.5) * slideH, 0)).project(camera);
        return { x: box.left + (p.x * 0.5 + 0.5) * box.width, y: box.top + (-p.y * 0.5 + 0.5) * box.height };
      };
      const a = project(T.x, T.top);
      const b = project(T.x + 100, T.top);
      return { x: a.x, y: a.y, k: Math.hypot(b.x - a.x, b.y - a.y) / 100, fs: T.fs, lh: T.lh, lines: T.lines, sub: T.sub, mobile };
    },
    get covered() { return cover.i; },
    // a full-screen slide doesn't change, so stop redrawing it while the case page scrolls over it
    freeze() { frozen = true; },
    resume() { frozen = false; },
    relayout: () => layout(),
    // cinematic entrance: slides fade/scale in while the arc opens
    enter() {
      return gsap.timeline()
        .to(state, { enter: 1, duration: 1.8, ease: 'expo.out' }, 0)
        .to(state, { arc: ARC_IDLE, duration: 2.2, ease: 'expo.out' }, 0.1);
    },
  };

  // ---------- placeholder artwork ----------
  // a glass-looking pill (a canvas can't blur what's behind it, so it is a pale tint with a hairline)
  function drawNamePill(g, text, rightX, topY, fontPx) {
    g.font = `500 ${fontPx}px "Inter Tight", sans-serif`;
    g.textBaseline = 'middle';
    const padX = fontPx * 0.95, ph = fontPx * 2;
    const pw = g.measureText(text).width + padX * 2;
    const x = rightX - pw;
    g.beginPath();
    if (g.roundRect) g.roundRect(x, topY, pw, ph, ph / 2); else g.rect(x, topY, pw, ph);
    // a smoky tint, so the white name reads on a pale photo as well as on a dark one
    g.fillStyle = 'rgba(18,20,16,.38)'; g.fill();
    g.lineWidth = Math.max(2, fontPx * 0.08); g.strokeStyle = 'rgba(255,255,255,.55)'; g.stroke();
    g.fillStyle = '#fff';
    g.fillText(text, x + padX, topY + ph / 2 + 1);
    return ph;
  }

  // layout of the headline block inside a picture, shared by the drawing code and by textAnchor()
  function textBlock(p, portrait) {
    if (portrait) {
      const fs = 80;
      const lines = (p.short && p.short.headline) || p.headline.slice(0, 2);
      const by = 1152 - 56 - 72;   // top of the button
      const baseline = by - 44 - (lines.length - 1) * fs * 1.08;
      return { x: 48, top: baseline - fs * 0.925, fs, lh: 1.08, lines, sub: null };
    }
    return { x: 56, top: 190 - 66 * 0.925, fs: 66, lh: 1.12, lines: p.headline, sub: p.sub || null };
  }

  // fills the canvas with the photo, cropped like object-fit: cover around a vertical focus point
  function drawCover(g, img, w, h, focusY = 0.5) {
    const k = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * k, dh = img.naturalHeight * k;
    g.drawImage(img, (w - dw) / 2, (h - dh) * focusY, dw, dh);
  }

  function drawPlaceholder(p, index, withText = true, portrait = false) {
    const w = portrait ? 768 : 1280;
    const h = portrait ? 1152 : 768;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');

    const photo = photos[index] && photos[index].complete && photos[index].naturalWidth ? photos[index] : null;
    if (photo) {
      drawCover(g, photo, w, h, (p.images && p.images.focus) ?? 0.5);
    } else {
      const grad = g.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, p.colors[0]);
      grad.addColorStop(1, p.colors[1]);
      g.fillStyle = grad; g.fillRect(0, 0, w, h);

      const glow = g.createRadialGradient(w * 0.72, h * 0.28, 0, w * 0.72, h * 0.28, Math.max(w, h) * 0.6);
      glow.addColorStop(0, 'rgba(255,255,255,.22)');
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = glow; g.fillRect(0, 0, w, h);

      // wireframe "image" marker: diagonals + mountains + sun
      g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.16)';
      const my = portrait ? 0.62 : 0.82;   // where the mountains' feet are
      g.beginPath(); g.moveTo(w * 0.1, h * my); g.lineTo(w * 0.38, h * (my - 0.2)); g.lineTo(w * 0.56, h * (my - 0.1));
      g.lineTo(w * 0.72, h * (my - 0.17)); g.lineTo(w * 0.98, h * my); g.closePath(); g.fill();
      g.beginPath(); g.arc(w * (portrait ? 0.7 : 0.62), h * (portrait ? 0.22 : 0.3), portrait ? 28 : 34, 0, Math.PI * 2); g.fill();
    }

    // scrim for legibility: from the left on wide cards, from the bottom on tall ones
    const scrim = portrait ? g.createLinearGradient(0, h, 0, h * 0.3) : g.createLinearGradient(0, 0, w * 0.75, 0);
    scrim.addColorStop(0, portrait ? 'rgba(0,0,0,.62)' : 'rgba(0,0,0,.42)');
    scrim.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = scrim; g.fillRect(0, 0, w, h);

    if (!withText) return c;   // the case page puts its own title on top

    // the case's name, as a pill in the top-right corner
    const pillFont = portrait ? 33 : 26;
    const margin = portrait ? 40 : 48;
    const ph = drawNamePill(g, p.name, w - margin, margin, pillFont);

    // placeholder marker (not needed once a real photo is in)
    if (!photo) {
      g.fillStyle = 'rgba(255,255,255,.7)';
      g.font = `500 ${portrait ? 20 : 17}px "Inter Tight", sans-serif`;
      g.textBaseline = portrait ? 'middle' : 'alphabetic';
      const label = `IMAGE PLACEHOLDER · ${String(index + 1).padStart(2, '0')} · ${portrait ? '2:3' : '5:3'}`;
      if (portrait) g.fillText(label, margin, margin + ph / 2); else g.fillText(label, 56, h - 48);
    }

    g.textBaseline = 'alphabetic';
    g.fillStyle = '#fff';
    if (portrait) {
      // phones: a short headline and the button, anchored to the bottom of the card
      const fs = 80;
      const lines = (p.short && p.short.headline) || p.headline.slice(0, 2);
      g.font = '500 30px "Inter Tight", sans-serif';
      const bw = g.measureText(p.cta).width + 60, bh = 72, by = h - 56 - bh;
      let y = by - 44 - (lines.length - 1) * fs * 1.08;
      g.font = `500 ${fs}px "Inter Tight", sans-serif`;
      lines.forEach((line) => { g.fillText(line, 48, y); y += fs * 1.08; });
      g.beginPath(); g.roundRect ? g.roundRect(48, by, bw, bh, bh / 2) : g.rect(48, by, bw, bh); g.fill();
      g.fillStyle = '#0a0a0a'; g.font = '500 30px "Inter Tight", sans-serif';
      g.fillText(p.cta, 48 + 30, by + 46);
      return c;
    }

    // wide cards: headline, sub line and button, drawn in the texture so they bend with the slide
    const fs = 66;
    g.font = `500 ${fs}px "Inter Tight", sans-serif`;
    let y = 190;
    p.headline.forEach((line) => { g.fillText(line, 56, y); y += fs * 1.12; });
    if (p.sub) {
      g.font = '400 28px "Inter Tight", sans-serif';
      g.fillStyle = 'rgba(255,255,255,.85)';
      g.fillText(p.sub, 56, y + 10);
      y += 44;
    }
    g.font = '500 24px "Inter Tight", sans-serif';
    const bw = g.measureText(p.cta).width + 56, bh = 64, by = y + 22;
    g.fillStyle = '#fff';
    g.beginPath(); g.roundRect ? g.roundRect(56, by, bw, bh, 32) : g.rect(56, by, bw, bh); g.fill();
    g.fillStyle = '#0a0a0a';
    g.fillText(p.cta, 56 + 28, by + 40);
    return c;
  }
};
