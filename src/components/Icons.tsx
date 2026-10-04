import type { SVGProps } from "react";

// Hand-drawn 24px line icons. Stroke follows currentColor.
type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 20): SVGProps<SVGSVGElement> => ({
  width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true,
});

export const Flame = ({ size = 16, ...p }: P) => (
  <svg {...base(size)} {...p} fill="currentColor" stroke="none">
    <path d="M12.6 2.2c.3 2.7-.9 4.3-2.2 5.8-1.4 1.6-3 3.2-3 6.1A4.7 4.7 0 0 0 12 19a4.6 4.6 0 0 0 4.7-4.7c0-1.4-.5-2.6-1.2-3.6-.2 1.2-.8 2.1-1.9 2.6.5-2.6-.3-6.7-1-11.1Z" opacity=".95" />
    <path d="M12 21.8c-3.9 0-7-2.9-7-6.8 0-3 1.4-4.9 2.8-6.4-.2 1.6.2 2.8 1 3.6-.1 2.2.8 3.4 1.8 4.2 0-1.6.5-2.6 1.4-3.6.4 1.4 1.4 2.2 2.4 3 .9-.8 1.6-2 1.7-3.6 1.8 1.4 2.9 3.2 2.9 5.2 0 2.6-2.6 4.4-7 4.4Z" opacity=".55" />
  </svg>
);
export const Drop = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M12 3s-6 6.6-6 11a6 6 0 0 0 12 0c0-4.4-6-11-6-11Z" /><path d="M9 15a3 3 0 0 0 3 3" /></svg>
);
export const Check = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p} strokeWidth={2.4}><path d="m5 12.5 4.2 4.2L19 7" /></svg>
);
export const Cross = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p} strokeWidth={2.4}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const Dots = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p} fill="currentColor" stroke="none"><circle cx="6" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="18" cy="12" r="1.8" /></svg>
);
export const Clock = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9.5 2.5h5" /></svg>
);
export const Lock = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><rect x="5" y="10.5" width="14" height="10" rx="3" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2" /></svg>
);
export const Coins = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><ellipse cx="9" cy="7" rx="6" ry="3" /><path d="M3 7v4c0 1.7 2.7 3 6 3s6-1.3 6-3V7" /><path d="M9 14v3c0 1.7 2.7 3 6 3s6-1.3 6-3v-4c0-1.6-2.4-2.9-5.5-3" /></svg>
);
export const Wallet = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" /><rect x="4" y="8" width="16" height="11" rx="2.5" /><path d="M16 13.5h1" /></svg>
);
export const Sun = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" /></svg>
);
export const Moon = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" /></svg>
);
export const ArrowUpRight = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M7 17 17 7M8 7h9v9" /></svg>
);
export const ArrowRight = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
export const Copy = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8" /></svg>
);
export const Search = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
);
export const Chevron = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="m6 9 6 6 6-6" /></svg>
);
export const Trophy = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M8 4h8v5a4 4 0 0 1-8 0V4ZM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4" /></svg>
);
export const Pulse = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M3 12h4l2-5 4 10 2-5h6" /></svg>
);
export const Bolt = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z" /></svg>
);
export const Bell = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16ZM10 20.5a2 2 0 0 0 4 0" /></svg>
);
export const Home = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M4 11.5 12 5l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-5.5H9v5.5H5.5A1.5 1.5 0 0 1 4 19v-7.5Z" /></svg>
);
export const Book = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M5 4.5h9.5A3.5 3.5 0 0 1 18 8v11.5H8.5A3.5 3.5 0 0 1 5 16V4.5Z" /><path d="M5 16a3 3 0 0 1 3-3h10" /></svg>
);
export const Vault = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><rect x="3.5" y="5" width="17" height="14" rx="3" /><circle cx="12" cy="12" r="3.2" /><path d="M12 8.8V7.5M12 16.5v-1.3M15.2 12h1.3M7.5 12h1.3M6.5 19v1.5M17.5 19v1.5" /></svg>
);
export const Users = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><circle cx="9" cy="8.5" r="3.5" /><path d="M2.5 19.5a6.5 6.5 0 0 1 13 0M16 5.2a3.5 3.5 0 0 1 0 6.6M18.5 14a6.5 6.5 0 0 1 3 5.5" /></svg>
);
/** The mark as a line icon: a coin with a rising staircase. */
export const BuyCoin = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><circle cx="12" cy="12" r="9" /><path d="M7 16h3.5v-4h3.5V8H17" /></svg>
);
export const Close = Cross;
