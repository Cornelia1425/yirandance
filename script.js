import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js";

const canvas = document.getElementById("archiveCanvas");
const viewport = document.getElementById("archiveViewport");
const titlesEl = document.getElementById("archiveTitles");
const sectionTitlesEl = document.getElementById("archiveSectionTitles");
const footerEl = document.querySelector(".archive-footer");

if (canvas && viewport) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = null;

  /** Orthographic + symmetric diagonal view ≈ classic isometric / 轴测图 (no perspective convergence). */
  const FRUSTUM_SIZE = 8.35;
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 220);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const ambient = new THREE.AmbientLight(0xffffff, 0.88);
  scene.add(ambient);
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.6);
  scene.add(keyLight);

  const group = new THREE.Group();
  scene.add(group);

  const raycaster = new THREE.Raycaster();
  /** Sentinel until pointer is inside viewport; avoids huge rotation targets from NDC overflow. */
  const pointer = new THREE.Vector2(-100, -100);
  const cards = [];
  let hoveredCard = null;
  const peerOffsetScratch = new THREE.Vector3();
  const peerOffsetScratchB = new THREE.Vector3();

  function pointerInsideViewport() {
    return pointer.x >= -1 && pointer.x <= 1 && pointer.y >= -1 && pointer.y <= 1;
  }

  /**
   * Reference stack: bottom-left = closest to camera; recedes toward top-right.
   * Heavy overlap: stepX << plane width (~2.3) so each card mostly hides the next.
   */
  /** 悬停：当前片只抬 Y；其余片沿堆叠方向挪开，留出空隙。 */
  const HOVER_LIFT_Y = 0.62;
  /** 非悬停卡片沿堆叠切线平移，使与悬停片间距略增（悬停片本身不侧移）。 */
  const HOVER_PEER_SHIFT = 0.11;
  /** 划过时用浮点「焦点」在相邻索引间插值，前后片分离会连续过渡。 */
  const FOCUS_INDEX_LERP = 0.26;
  const SPREAD_ALPHA_IN = 0.22;
  const SPREAD_ALPHA_OUT = 0.15;
  const GROUP_ROT_Y_MAX = 0.04;
  const GROUP_ROT_X_MAX = 0.022;
  /** Axonometric baseline: rotation comes from camera; mouse only nudges slightly. */
  const GROUP_BASE_Y = 0;
  const GROUP_BASE_X = 0;

  const STACK = {
    startX: -1.22,
    startY: -0.62,
    startZ: 0.92,
    stepX: 0.38,
    stepY: 0.28,
    stepZ: -0.36,
    rotZ0: -0.028,
    rotZStep: 0.004,
  };

  const stackTangent = new THREE.Vector3(STACK.stepX, STACK.stepY, STACK.stepZ).normalize();

  const cardSetKey = canvas.dataset.cardSet || "home";

  const CARD_DEFS_BY_SET = {
    home: [
      {
        title: "About",
        subtitle: "artist profile",
        archive: "Archive 01",
        colorA: "#d2c0a5",
        colorB: "#514637",
        url: "about.html",
      },
      {
        title: "Choreography",
        subtitle: "works + process",
        archive: "Archive 02",
        colorA: "#b6ced6",
        colorB: "#2b3f4b",
        url: "choreography.html",
      },
      {
        title: "Modeling",
        subtitle: "editorial + campaign",
        archive: "Archive 03",
        colorA: "#d0b49b",
        colorB: "#4c3428",
        url: "modeling.html",
      },
      {
        title: "Dance Film",
        subtitle: "A Quiet Longing",
        archive: "Archive 04",
        colorA: "#d8344f",
        colorB: "#3d121f",
        url: "dance-film.html",
      },
      {
        title: "Acting",
        subtitle: "film + theatre",
        archive: "Archive 05",
        colorA: "#9ca9c3",
        colorB: "#2d374a",
        url: "acting.html",
      },
      {
        title: "Contact",
        subtitle: "message & inquiries",
        archive: "Archive 06",
        colorA: "#c4bcd4",
        colorB: "#2a2638",
        url: "contact.html",
      },
    ],
    "dance-film": [
      {
        title: "A Quiet Longing",
        subtitle: "dance film · TMFF",
        archive: "Archive 01",
        colorA: "#d8344f",
        colorB: "#3d121f",
        url: "a-quiet-longing.html",
      },
      {
        title: "Careless",
        subtitle: "dance film",
        archive: "Archive 02",
        colorA: "#6b8cae",
        colorB: "#1e2c38",
        url: "careless.html",
      },
      {
        title: "The River",
        subtitle: "dance film",
        archive: "Archive 03",
        colorA: "#4a7d8c",
        colorB: "#1a3036",
        url: "the-river.html",
      },
    ],
  };

  const cardDefs = CARD_DEFS_BY_SET[cardSetKey] || CARD_DEFS_BY_SET.home;

  let focusIndex = 0.5 * (cardDefs.length - 1);
  let spreadAlpha = 0;
  /** When ≥0, title row hover drives the same highlight / 3D UX as hovering that card. */
  let titleHoverIndex = -1;

  const cardData = cardDefs.map((item, i) => ({
    ...item,
    x: STACK.startX + i * STACK.stepX,
    y: STACK.startY + i * STACK.stepY,
    z: STACK.startZ + i * STACK.stepZ,
    rotZ: STACK.rotZ0 + i * STACK.rotZStep,
  }));

  const nCards = cardDefs.length;
  const stackMid = 0.5 * (nCards - 1);
  const stackCenter = new THREE.Vector3(
    STACK.startX + stackMid * STACK.stepX,
    STACK.startY + stackMid * STACK.stepY,
    STACK.startZ + stackMid * STACK.stepZ
  );
  const isoDir = new THREE.Vector3(1, 1, 1).normalize();
  const isoDistance = 16;
  camera.position.copy(stackCenter).addScaledVector(isoDir, isoDistance);
  camera.lookAt(stackCenter);
  camera.updateProjectionMatrix();

  keyLight.position.copy(stackCenter).add(new THREE.Vector3(6.5, 8.0, 5.5));

  function makeTexture(item) {
    const cvs = document.createElement("canvas");
    cvs.width = 1024;
    cvs.height = 1280;
    const ctx = cvs.getContext("2d");
    if (!ctx) return new THREE.CanvasTexture(cvs);

    const grad = ctx.createLinearGradient(0, 0, cvs.width, cvs.height);
    grad.addColorStop(0, item.colorA);
    grad.addColorStop(1, item.colorB);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cvs.width, cvs.height);

    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 24; i += 1) {
      const w = Math.random() * 280 + 120;
      const h = Math.random() * 240 + 90;
      const x = Math.random() * (cvs.width - w);
      const y = Math.random() * (cvs.height - h);
      ctx.fillRect(x, y, w, h);
    }

    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = "rgba(255,255,255,0.24)";
    ctx.lineWidth = 2;
    for (let x = 0; x < cvs.width; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, cvs.height);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(20,20,25,0.65)";
    ctx.fillRect(0, cvs.height - 300, cvs.width, 300);

    ctx.fillStyle = "rgba(236,236,246,0.9)";
    ctx.font = "500 34px Arial";
    ctx.letterSpacing = "2px";
    ctx.fillText(item.archive.toUpperCase(), 64, cvs.height - 220);
    ctx.font = "700 78px Arial";
    ctx.fillText(item.title.toUpperCase(), 64, cvs.height - 126);
    ctx.font = "500 30px Arial";
    ctx.fillText(item.subtitle.toUpperCase(), 64, cvs.height - 72);

    const texture = new THREE.CanvasTexture(cvs);
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return texture;
  }

  cardData.forEach((item, i) => {
    const geometry = new THREE.PlaneGeometry(2.3, 3.05);
    const texture = makeTexture(item);
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      transparent: true,
      opacity: 0.9,
      metalness: 0.08,
      roughness: 0.65,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = cardData.length - i;
    mesh.position.set(item.x, item.y, item.z);
    mesh.rotation.z = item.rotZ;
    mesh.userData = {
      ...item,
      baseX: item.x,
      baseY: item.y,
      baseZ: item.z,
      baseRenderOrder: cardData.length - i,
      stackIndex: i,
    };
    group.add(mesh);
    cards.push(mesh);
  });

  if (sectionTitlesEl && cardSetKey === "dance-film") {
    sectionTitlesEl.replaceChildren();
    CARD_DEFS_BY_SET.home.forEach((def, i) => {
      const onThisHub = def.url === "dance-film.html";
      const part = onThisHub ? document.createElement("span") : document.createElement("a");
      if (!onThisHub) part.href = def.url;
      part.className = "archive-titles__part";
      if (onThisHub) part.classList.add("archive-titles__part--current");
      part.textContent = def.title;
      if (onThisHub) part.setAttribute("aria-current", "page");
      sectionTitlesEl.appendChild(part);
      if (i < CARD_DEFS_BY_SET.home.length - 1) {
        const sep = document.createElement("span");
        sep.className = "archive-titles__sep";
        sep.textContent = " · ";
        sep.setAttribute("aria-hidden", "true");
        sectionTitlesEl.appendChild(sep);
      }
    });
  }

  if (titlesEl) {
    titlesEl.replaceChildren();
    cardDefs.forEach((def, i) => {
      const link = document.createElement("a");
      link.href = def.url;
      link.className = "archive-titles__part";
      link.dataset.stackIndex = String(i);
      link.textContent = def.title;
      link.addEventListener("mouseenter", () => {
        titleHoverIndex = i;
      });
      link.addEventListener("mouseleave", (e) => {
        const rt = e.relatedTarget;
        if (!rt || !titlesEl.contains(rt)) {
          titleHoverIndex = -1;
        }
      });
      titlesEl.appendChild(link);
      if (i < cardDefs.length - 1) {
        const sep = document.createElement("span");
        sep.className = "archive-titles__sep";
        sep.textContent = " · ";
        sep.setAttribute("aria-hidden", "true");
        titlesEl.appendChild(sep);
      }
    });
  }

  group.rotation.y = GROUP_BASE_Y;
  group.rotation.x = GROUP_BASE_X;

  function resize() {
    const rect = viewport.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    renderer.setSize(width, height, false);
    const aspect = width / height;
    const halfH = FRUSTUM_SIZE / 2;
    const halfW = halfH * aspect;
    camera.left = -halfW;
    camera.right = halfW;
    camera.top = halfH;
    camera.bottom = -halfH;
    camera.updateProjectionMatrix();
  }

  function syncPointerFromEvent(event) {
    const rect = viewport.getBoundingClientRect();
    const { clientX: x, clientY: y } = event;
    if (
      rect.width > 0 &&
      rect.height > 0 &&
      x >= rect.left &&
      x <= rect.right &&
      y >= rect.top &&
      y <= rect.bottom
    ) {
      pointer.x = ((x - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((y - rect.top) / rect.height) * 2 + 1;
    } else {
      pointer.set(-100, -100);
    }
  }

  document.addEventListener("mousemove", syncPointerFromEvent);
  viewport.addEventListener("mouseleave", () => {
    pointer.set(-100, -100);
    hoveredCard = null;
    canvas.style.cursor = "grab";
  });

  viewport.addEventListener("click", (event) => {
    const rect = viewport.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const cx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const cy = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    const clickPtr = new THREE.Vector2(cx, cy);
    raycaster.setFromCamera(clickPtr, camera);
    const hits = raycaster.intersectObjects(cards);
    const hit = hits[0]?.object;
    if (hit?.userData?.url) {
      window.location.href = hit.userData.url;
    }
  });

  resize();
  window.addEventListener("resize", resize);

  function animate() {
    const ptrOk = pointerInsideViewport();
    if (ptrOk) {
      raycaster.setFromCamera(pointer, camera);
      const intersects = raycaster.intersectObjects(cards);
      hoveredCard = intersects.length > 0 ? intersects[0].object : null;
    } else {
      hoveredCard = null;
    }

    const visualHoverCard =
      titleHoverIndex >= 0 && titleHoverIndex < cards.length
        ? cards[titleHoverIndex]
        : hoveredCard;

    canvas.style.cursor = visualHoverCard ? "pointer" : "grab";

    const rawIdx = visualHoverCard?.userData?.stackIndex;
    const titleIdx =
      typeof rawIdx === "number" && !Number.isNaN(rawIdx) ? rawIdx : -1;
    if (titlesEl) {
      titlesEl.querySelectorAll(".archive-titles__part").forEach((el) => {
        const i = Number(el.dataset.stackIndex);
        const active = i === titleIdx && titleIdx >= 0;
        el.classList.toggle("archive-titles__part--active", active);
        el.style.opacity = active ? "1" : "0.5";
      });
    }

    const px = ptrOk ? pointer.x : 0;
    const py = ptrOk ? pointer.y : 0;
    const targetRotY = GROUP_BASE_Y + px * GROUP_ROT_Y_MAX;
    const targetRotX = GROUP_BASE_X - py * GROUP_ROT_X_MAX;
    group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, targetRotY, 0.045);
    group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, targetRotX, 0.045);

    // Keep title/header static; only 3D stack responds to pointer.
    if (footerEl) {
      const fx = px * -4;
      const fy = py * 3;
      footerEl.style.transform = `translate3d(${fx.toFixed(2)}px, ${fy.toFixed(2)}px, 0)`;
    }

    const posK = 0.2;
    const hRaw = visualHoverCard?.userData?.stackIndex;
    const h = typeof hRaw === "number" && !Number.isNaN(hRaw) ? hRaw : undefined;
    const n = cards.length;
    const maxI = Math.max(0, n - 1);

    if (visualHoverCard !== null && h !== undefined) {
      spreadAlpha = THREE.MathUtils.lerp(spreadAlpha, 1, SPREAD_ALPHA_IN);
      focusIndex = THREE.MathUtils.lerp(focusIndex, h, FOCUS_INDEX_LERP);
    } else {
      spreadAlpha = THREE.MathUtils.lerp(spreadAlpha, 0, SPREAD_ALPHA_OUT);
    }
    focusIndex = THREE.MathUtils.clamp(focusIndex, 0, maxI);

    const f = focusIndex;
    const h0 = Math.floor(f);
    const h1 = Math.min(Math.ceil(f), maxI);
    const blendT = h1 === h0 ? 0 : f - h0;

    cards.forEach((mesh) => {
      const { baseX, baseY, baseZ, baseRenderOrder, stackIndex: i } = mesh.userData;
      const isHover = visualHoverCard === mesh;

      peerOffsetScratch.set(0, 0, 0);
      peerOffsetScratchB.set(0, 0, 0);
      if (i < h0) {
        peerOffsetScratch.copy(stackTangent).multiplyScalar(-HOVER_PEER_SHIFT);
      } else if (i > h0) {
        peerOffsetScratch.copy(stackTangent).multiplyScalar(HOVER_PEER_SHIFT);
      }
      if (i < h1) {
        peerOffsetScratchB.copy(stackTangent).multiplyScalar(-HOVER_PEER_SHIFT);
      } else if (i > h1) {
        peerOffsetScratchB.copy(stackTangent).multiplyScalar(HOVER_PEER_SHIFT);
      }
      peerOffsetScratch.lerp(peerOffsetScratchB, blendT);
      peerOffsetScratch.multiplyScalar(spreadAlpha);

      if (isHover) {
        peerOffsetScratch.set(0, 0, 0);
      }

      const targetX = baseX + peerOffsetScratch.x;
      const targetY = baseY + (isHover ? HOVER_LIFT_Y : 0) + peerOffsetScratch.y;
      const targetZ = baseZ + peerOffsetScratch.z;
      mesh.position.x = THREE.MathUtils.lerp(mesh.position.x, targetX, posK);
      mesh.position.y = THREE.MathUtils.lerp(mesh.position.y, targetY, posK);
      mesh.position.z = THREE.MathUtils.lerp(mesh.position.z, targetZ, posK);
      mesh.renderOrder = isHover ? 200 : baseRenderOrder;
    });

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  animate();
}
