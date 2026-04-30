const enableCustomCursor = window.matchMedia("(pointer: fine)").matches;

function initCustomCursor() {
  if (!enableCustomCursor || !document.body) return;
  document.body.classList.add("custom-circle-cursor");

  const circleCursor = document.createElement("div");
  circleCursor.className = "cursor-circle";
  const auraCursor = document.createElement("div");
  auraCursor.className = "cursor-aura";
  const trailCount = 5;
  const trailEls = Array.from({ length: trailCount }, (_, i) => {
    const el = document.createElement("div");
    el.className = "cursor-trail";
    el.style.setProperty("--trail-index", String(i + 1));
    document.body.appendChild(el);
    return el;
  });
  document.body.appendChild(circleCursor);
  document.body.appendChild(auraCursor);

  let mouseX = -9999;
  let mouseY = -9999;
  let auraX = -9999;
  let auraY = -9999;
  const trailPoints = Array.from({ length: trailCount }, () => ({ x: -9999, y: -9999 }));

  const moveCircle = (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
  };

  document.addEventListener("mousemove", moveCircle);
  document.addEventListener("mouseleave", () => {
    auraCursor.style.transform = "translate3d(-9999px, -9999px, 0)";
    trailEls.forEach((el) => {
      el.style.transform = "translate3d(-9999px, -9999px, 0)";
    });
  });
  document.addEventListener("mouseover", (event) => {
    const isClickable = Boolean(event.target?.closest("a, button, #archiveCanvas"));
    auraCursor.classList.toggle("cursor-aura--active", isClickable);
    trailEls.forEach((el) => {
      el.classList.toggle("cursor-trail--active", isClickable);
    });
  });

  const animateAura = () => {
    auraX += (mouseX - auraX) * 0.18;
    auraY += (mouseY - auraY) * 0.18;
    auraCursor.style.transform = `translate3d(${auraX - 24}px, ${auraY - 24}px, 0)`;
    trailPoints[0].x += (mouseX - trailPoints[0].x) * 0.23;
    trailPoints[0].y += (mouseY - trailPoints[0].y) * 0.23;
    for (let i = 1; i < trailPoints.length; i += 1) {
      trailPoints[i].x += (trailPoints[i - 1].x - trailPoints[i].x) * 0.2;
      trailPoints[i].y += (trailPoints[i - 1].y - trailPoints[i].y) * 0.2;
    }
    trailPoints.forEach((pt, i) => {
      trailEls[i].style.transform = `translate3d(${pt.x - 7}px, ${pt.y - 7}px, 0)`;
    });
    requestAnimationFrame(animateAura);
  };
  animateAura();
}

if (document.body) {
  initCustomCursor();
} else {
  document.addEventListener("DOMContentLoaded", initCustomCursor, { once: true });
}
