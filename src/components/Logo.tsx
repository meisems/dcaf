import { useId } from "react";

/**
 * The dcaf mark: a green (unroasted) coffee bean, lit with SVG lighting filters.
 * Its crease is a carved staircase: every step is one buy, and it only goes up.
 */
export const STEPS = "M23.4 41.6v-3.4h5.7v-6.7h5.7v-6.7h5.7v-3.4";
const BEAN = { cx: 32, cy: 31, rx: 17.2, ry: 23.6, transform: "rotate(32 32 31)" };

export function Mark({ size = 36, shadow = false, live = false, title }: { size?: number; shadow?: boolean; live?: boolean; title?: string }) {
  const u = useId().replace(/:/g, "");
  const id = (k: string) => `${k}${u}`;
  return (
    <svg className={`mark${live ? " mark-live" : ""}`} width={size} height={size} viewBox="0 0 64 64" role={title ? "img" : undefined} aria-hidden={!title} aria-label={title}>
      <defs>
        <radialGradient id={id("skin")} cx="40%" cy="30%" r="78%">
          <stop offset="0" stopColor="#9DFFD8" />
          <stop offset=".35" stopColor="#00EC97" />
          <stop offset=".75" stopColor="#00B877" />
          <stop offset="1" stopColor="#025438" />
        </radialGradient>
        <linearGradient id={id("deep")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#013322" />
          <stop offset="1" stopColor="#00140D" />
        </linearGradient>
        <mask id={id("cut")} maskUnits="userSpaceOnUse">
          <rect width="64" height="64" fill="#fff" />
          <path d={STEPS} fill="none" stroke="#000" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
        </mask>
        <filter id={id("lit")} x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceAlpha" stdDeviation="5" result="dome" />
          <feGaussianBlur in="SourceAlpha" stdDeviation="1.1" result="edge" />
          <feComposite in="dome" in2="edge" operator="arithmetic" k2=".75" k3=".45" result="h" />
          <feSpecularLighting in="h" surfaceScale="5" specularConstant=".85" specularExponent="18" lightingColor="#E9FFF6" result="s">
            <fePointLight x="-20" y="-40" z="60" />
          </feSpecularLighting>
          <feComposite in="s" in2="SourceAlpha" operator="in" result="s2" />
          <feDiffuseLighting in="h" surfaceScale="5" diffuseConstant="1" lightingColor="#ffffff" result="d">
            <feDistantLight azimuth="230" elevation="52" />
          </feDiffuseLighting>
          <feComposite in="SourceGraphic" in2="d" operator="arithmetic" k1=".75" k2=".42" result="shaded" />
          <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="2" seed="7" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .16 0" result="n2" />
          <feComposite in="n2" in2="SourceAlpha" operator="in" result="grain" />
          <feBlend in="shaded" in2="grain" mode="multiply" result="g" />
          <feComposite in="g" in2="s2" operator="arithmetic" k2="1" k3=".8" />
        </filter>
        <filter id={id("sh")} x="-50%" y="-80%" width="200%" height="260%"><feGaussianBlur stdDeviation="2.4" /></filter>
        <filter id={id("ao")} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.1" /></filter>
        <clipPath id={id("clip")}><ellipse {...BEAN} /></clipPath>
      </defs>
      {shadow && <ellipse cx="34.5" cy="57.5" rx="16" ry="3.2" fill="#000" opacity=".6" filter={`url(#${id("sh")})`} />}
      <ellipse {...BEAN} fill={`url(#${id("deep")})`} />
      <g filter={`url(#${id("lit")})`}>
        <g mask={`url(#${id("cut")})`}><ellipse {...BEAN} fill={`url(#${id("skin")})`} /></g>
      </g>
      <g clipPath={`url(#${id("clip")})`}>
        <ellipse {...BEAN} fill="none" stroke="#001A10" strokeOpacity=".55" strokeWidth="3" filter={`url(#${id("ao")})`} />
        {live && <path className="mark-charge" d={STEPS} fill="none" stroke="#9DFFD8" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" pathLength={1} />}
      </g>
    </svg>
  );
}

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <span className="logo">
      <Mark size={size} live />
      <span className="logo-word">dcaf</span>
    </span>
  );
}
