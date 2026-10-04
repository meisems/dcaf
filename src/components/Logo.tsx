import { useId } from "react";
import { BRAND } from "../config";

/**
 * The dcainnear mark: a green coin, lit with SVG lighting filters, with an engraved rim.
 * A staircase is carved across its face: every step is one buy, and it only goes up.
 */
export const STEPS = "M20.5 41H26V35H32V29H38V23H43.5";
const COIN = { cx: 32, cy: 31, r: 23 };
const RIM = 19;

export function Mark({ size = 36, shadow = false, live = false, title }: { size?: number; shadow?: boolean; live?: boolean; title?: string }) {
  const u = useId().replace(/:/g, "");
  const id = (k: string) => `${k}${u}`;
  return (
    <span className={`mark${live ? " mark-live" : ""}`} style={{ width: size, height: size }} role={title ? "img" : undefined} aria-hidden={!title} aria-label={title}>
    <svg className="mark-art" width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <radialGradient id={id("skin")} cx="40%" cy="30%" r="78%">
          <stop offset="0" stopColor="#FFF1B8" />
          <stop offset=".35" stopColor="#FFC83D" />
          <stop offset=".75" stopColor="#E39B12" />
          <stop offset="1" stopColor="#6E4100" />
        </radialGradient>
        <linearGradient id={id("deep")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3A2400" />
          <stop offset="1" stopColor="#170E00" />
        </linearGradient>
        <mask id={id("cut")} maskUnits="userSpaceOnUse">
          <rect width="64" height="64" fill="#fff" />
          <path d={STEPS} fill="none" stroke="#000" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={COIN.cx} cy={COIN.cy} r={RIM} fill="none" stroke="#000" strokeWidth="1.3" />
        </mask>
        <filter id={id("lit")} x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceAlpha" stdDeviation="5" result="dome" />
          <feGaussianBlur in="SourceAlpha" stdDeviation="1.1" result="edge" />
          <feComposite in="dome" in2="edge" operator="arithmetic" k2=".75" k3=".45" result="h" />
          <feSpecularLighting in="h" surfaceScale="5" specularConstant=".85" specularExponent="18" lightingColor="#FFF8E6" result="s">
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
        <clipPath id={id("clip")}><circle {...COIN} /></clipPath>
      </defs>
      {shadow && <ellipse cx="32" cy="57.5" rx="16" ry="3.2" fill="#000" opacity=".6" filter={`url(#${id("sh")})`} />}
      <circle {...COIN} fill={`url(#${id("deep")})`} />
      <g filter={`url(#${id("lit")})`}>
        <g mask={`url(#${id("cut")})`}><circle {...COIN} fill={`url(#${id("skin")})`} /></g>
      </g>
      <g clipPath={`url(#${id("clip")})`}>
        <circle {...COIN} fill="none" stroke="#2A1A00" strokeOpacity=".55" strokeWidth="3" filter={`url(#${id("ao")})`} />
      </g>
    </svg>
    {live && (
      <svg className="mark-fx" width={size} height={size} viewBox="0 0 64 64" aria-hidden>
        <path className="mark-charge" d={STEPS} fill="none" stroke="#FFF1B8" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" pathLength={1} />
      </svg>
    )}
    </span>
  );
}

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <span className="logo">
      <Mark size={size} live />
      <span className="logo-word">{BRAND.name}</span>
    </span>
  );
}
