/**
 * A burst of little blocks (NEAR green, cyan, lavender) for moments worth it:
 * a payout landing in a tracked wallet. Hand-rolled with the Web Animations API.
 */
const COLORS = ["#00EC97", "#5CFFC2", "#17D9D4", "#9797FF"];

export function celebrate(x = window.innerWidth / 2, y = window.innerHeight * 0.35) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const layer = document.createElement("div");
  layer.className = "burst";
  layer.setAttribute("aria-hidden", "true");
  document.body.appendChild(layer);
  for (let i = 0; i < 34; i++) {
    const b = document.createElement("i");
    const size = 5 + Math.random() * 7;
    b.style.cssText = `left:${x}px;top:${y}px;width:${size}px;height:${size}px;background:${COLORS[i % COLORS.length]}`;
    layer.appendChild(b);
    const a = (Math.PI * 2 * i) / 34 + Math.random() * 0.4;
    const d = 90 + Math.random() * 170;
    b.animate(
      [
        { transform: "translate(-50%, -50%) scale(.4) rotate(0deg)", opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(1) rotate(${Math.random() * 540}deg)`, opacity: 1, offset: 0.6 },
        { transform: `translate(calc(-50% + ${Math.cos(a) * d * 1.1}px), calc(-50% + ${Math.sin(a) * d + 120}px)) scale(.6) rotate(${Math.random() * 720}deg)`, opacity: 0 },
      ],
      { duration: 1300 + Math.random() * 500, easing: "cubic-bezier(.15, .7, .3, 1)", fill: "forwards" },
    );
  }
  setTimeout(() => layer.remove(), 2000);
}
