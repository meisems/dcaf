import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet, ScrollRestoration, useLocation, useNavigate } from "react-router";
import { BRAND, LINKS, SYMBOL } from "../config";
import { useLive } from "../lib/api";
import { acct, isAccountId, mmss, near } from "../lib/format";
import { setMe, useMe } from "../lib/me";
import { useNow, useTheme } from "../lib/hooks";
import { useToast } from "../lib/toast";
import { Bean, Book, Coins, Home, Pulse, Search, Trophy } from "./Icons";
import { Logo } from "./Logo";
import { useReport } from "./WalletCard";
import { Avatar, Streak, UiCtx, useUi } from "./ui";

const LINKS_NAV = [
  { to: "/live", label: "Live" },
  { to: "/board", label: "Board" },
  { to: "/rounds", label: "Rounds" },
  { to: "/docs", label: "Docs" },
];

export function Shell() {
  const [search, setSearch] = useState(false);
  const ui = useMemo(() => ({ openSearch: () => setSearch(true) }), []);
  const loc = useLocation();
  useTabTitle();
  useRoundToasts();

  // cards light up under the cursor
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const el = (e.target as HTMLElement).closest?.(".card, .kpi, .step, .pod, .round-row, .wcard") as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, []);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch(true);
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  return (
    <UiCtx.Provider value={ui}>
      <Nav />
      <Status />
      <main className="wrap page" key={loc.pathname.split("/")[1] || "home"}>
        <Outlet />
      </main>
      <Footer />
      <Dock />
      {search && <SearchBox onClose={() => setSearch(false)} />}
      <ScrollRestoration />
    </UiCtx.Provider>
  );
}

function Nav() {
  const [theme, toggle] = useTheme();
  const me = useMe();
  const { rep } = useReport(me);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <header className={`isle-wrap${scrolled ? " scrolled" : ""}`}>
      <div className="isle">
        <Link to="/" className="nav-brand" aria-label={`${BRAND.name} home`}><Logo size={28} /></Link>
        <Tabs />
        <div className="nav-right">
          <SearchButton />
          <button className="icon-btn theme-btn" onClick={(e) => toggle(e)} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
            <ThemeIcon />
          </button>
          {me ? (
            <Link to="/me" className={`acct st-${rep?.status ?? "idle"}`} aria-label="My streak">
              <Avatar id={me} size={24} />
              <span className="acct-id">{acct(me, 14)}</span>
              {rep && rep.liveStreak > 0 && <Streak n={rep.liveStreak} size={12} />}
            </Link>
          ) : (
            <a className="btn btn-grad btn-sm" href={LINKS.buy} target="_blank" rel="noreferrer">
              <Bean size={16} /><span>Buy ${SYMBOL}</span>
            </a>
          )}
        </div>
      </div>
    </header>
  );
}

/** Sun ↔ moon: the core grows, a bite slides in, the rays fold away. */
function ThemeIcon() {
  return (
    <svg className="theme-ic" width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <mask id="theme-bite">
        <rect width="24" height="24" fill="#fff" />
        <circle className="bite" cx="17" cy="7" r="6" fill="#000" />
      </mask>
      <circle className="core" cx="12" cy="12" r="6" fill="currentColor" mask="url(#theme-bite)" />
      <g className="rays" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M12 1.5v2M12 20.5v2M1.5 12h2M20.5 12h2M4.6 4.6 6 6M18 18l1.4 1.4M4.6 19.4 6 18M18 6l1.4-1.4" />
      </g>
    </svg>
  );
}

/** Links with a pill that follows the pointer and a glowing dot on the active page. */
function Tabs() {
  const loc = useLocation();
  const box = useRef<HTMLElement>(null);
  const [on, setOn] = useState<{ x: number; w: number } | null>(null);
  const [hov, setHov] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const a = box.current?.querySelector<HTMLElement>("a.on");
    setOn(a ? { x: a.offsetLeft, w: a.offsetWidth } : null);
  }, [loc.pathname]);
  const pos = (p: { x: number; w: number } | null) => (p ? { transform: `translateX(${p.x}px)`, width: p.w, opacity: 1 } : { opacity: 0 });
  return (
    <nav className="tabs" aria-label="Main" ref={box} onMouseLeave={() => setHov(null)}>
      <span className="tab-hov" style={pos(hov)} />
      <span className="tab-on" style={pos(on)} />
      {LINKS_NAV.map((l) => (
        <NavLink key={l.to} to={l.to} className={({ isActive }) => (isActive ? "on" : "")}
          onMouseEnter={(e) => setHov({ x: e.currentTarget.offsetLeft, w: e.currentTarget.offsetWidth })}>
          {l.label}
        </NavLink>
      ))}
    </nav>
  );
}

function SearchButton() {
  const { openSearch } = useUi();
  return (
    <button className="search-btn" onClick={openSearch} aria-label="Find a wallet">
      <Search size={16} /><span className="hide-sm">Find wallet</span><kbd className="hide-sm">⌘K</kbd>
    </button>
  );
}

function SearchBox({ onClose }: { onClose: () => void }) {
  const me = useMe();
  const [q, setQ] = useState("");
  const [bad, setBad] = useState(false);
  const nav = useNavigate();
  const { snap } = useLive();
  const hits = q.length > 1 ? (snap?.board.streaks ?? []).map((r) => r.id).filter((id) => id.includes(q.toLowerCase())).slice(0, 5) : [];
  const go = (id: string) => {
    const s = id.trim().toLowerCase();
    if (!isAccountId(s)) return setBad(true);
    onClose();
    nav(`/wallet/${s}`);
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="sheet-back top" onClick={onClose}>
      <form className="palette" onClick={(e) => e.stopPropagation()} onSubmit={(e) => (e.preventDefault(), go(q))}>
        <div className="palette-in">
          <Search size={18} />
          <input autoFocus value={q} onChange={(e) => (setQ(e.target.value), setBad(false))} placeholder="alice.near" spellCheck={false} autoCapitalize="off" aria-label="NEAR account" aria-invalid={bad} />
          <kbd>↵</kbd>
        </div>
        {bad && <p className="form-err">Not a NEAR account id</p>}
        {hits.map((h) => (
          <button type="button" key={h} className="palette-hit" onClick={() => go(h)}><Avatar id={h} size={20} /> <span className="mono">{h}</span></button>
        ))}
        {!me && isAccountId(q.trim().toLowerCase()) && (
          <button type="button" className="palette-hit me" onClick={() => (setMe(q.trim().toLowerCase()), onClose(), nav("/me"))}>
            <Bean size={18} /> <span>Track <b className="mono">{q.trim().toLowerCase()}</b> as me</span>
          </button>
        )}
      </form>
    </div>
  );
}

/** Only speaks up when something's off. */
function Status() {
  const { snap, online, loaded } = useLive();
  if (!loaded) return null;
  let msg: string | null = null;
  let tone = "info";
  if (!online || !snap) (msg = "Engine offline · retrying"), (tone = "bad");
  else if (snap.info.syncing) msg = snap.info.lagSec ? `Catching up · ${lag(snap.info.lagSec)} behind` : "Catching up with the chain";
  else if (!snap.info.started) msg = "Warming up · first window opens soon";
  else if (snap.info.dryRun) msg = "Dry run · payouts are recorded, not sent";
  if (!msg) return null;
  return <div className="wrap"><p className={`status status-${tone}`}><span className="dot" />{msg}</p></div>;
}

const lag = (s: number) => (s < 120 ? `${s}s` : s < 7200 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`);

function Dock() {
  const cls = ({ isActive }: { isActive: boolean }) => (isActive ? "on" : "");
  return (
    <nav className="dock" aria-label="Quick">
      <NavLink to="/" end className={cls}><Home size={20} /><span>Home</span></NavLink>
      <NavLink to="/live" className={cls}><Pulse size={20} /><span>Live</span></NavLink>
      <a className="dock-buy" href={LINKS.buy} target="_blank" rel="noreferrer" aria-label={`Buy ${SYMBOL}`}><Bean size={24} /></a>
      <NavLink to="/board" className={cls}><Trophy size={20} /><span>Board</span></NavLink>
      <NavLink to="/me" className={cls}><Coins size={20} /><span>Me</span></NavLink>
    </nav>
  );
}

function Footer() {
  return (
    <footer className="foot">
      <div className="wrap foot-in">
        <Logo size={28} />
        <nav>
          <Link to="/docs">Docs</Link>
          <Link to="/docs/api">API</Link>
          <a href={LINKS.token} target="_blank" rel="noreferrer">Token ↗</a>
          {BRAND.twitter && <a href={BRAND.twitter} target="_blank" rel="noreferrer">X ↗</a>}
          {BRAND.telegram && <a href={BRAND.telegram} target="_blank" rel="noreferrer">Telegram ↗</a>}
        </nav>
        <small className="muted"><Book size={13} /> Not financial advice</small>
      </div>
    </footer>
  );
}

/** A small toast each time a round closes, a louder one when you were paid. */
function useRoundToasts() {
  const { snap } = useLive();
  const account = useMe();
  const toast = useToast();
  const last = useRef<number | null>(null);
  const top = snap?.rounds[0];
  useEffect(() => {
    if (!top || snap?.info.syncing) return;
    if (last.current !== null && top.no > last.current) {
      const mine = account ? top.payouts.find((p) => p.w === account) : undefined;
      if (mine) toast({ tone: "good", title: `+${near(mine.amount)}`, body: `Round #${top.no}` });
      else toast({ tone: "info", title: `Round #${top.no}`, body: top.qualifiers ? `${top.payouts.length} paid · ${near(top.paid)}` : "Stacked to the next" });
    }
    last.current = top.no;
  }, [top, account, toast, snap?.info.syncing]);
}

function useTabTitle() {
  const { snap } = useLive();
  const now = useNow();
  useEffect(() => {
    const i = snap?.info;
    if (!i?.started || !i.nextRoundAt) return void (document.title = `${BRAND.name} · ${BRAND.tagline}`);
    const left = i.nextRoundAt - now;
    document.title = left > 0 ? `${mmss(left)} · ${BRAND.name}` : `closing · ${BRAND.name}`;
  }, [snap, now]);
}
