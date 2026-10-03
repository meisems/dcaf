import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, ScrollRestoration, useLocation, useNavigate } from "react-router";
import { BRAND, LINKS, SYMBOL, TOKEN } from "../config";
import { prefetchWallet, useLive, type WalletReport } from "../lib/api";
import { celebrate } from "../lib/celebrate";
import { notify, useReminders } from "../lib/remind";
import { prefetchPath } from "../lib/prefetch";
import { acct, isAccountId, mmss, near } from "../lib/format";
import { setMe, useMe } from "../lib/me";
import { toggleTheme, useCurrentPageName, useNow, useTheme } from "../lib/hooks";
import { useToast } from "../lib/toast";
import { Bean, Book, Coins, Copy, Cross, Home, Pulse, Search, Trophy } from "./Icons";
import { Clock, useWindowAnim } from "./Clock";
import { Logo } from "./Logo";
import { useReport } from "./WalletCard";
import { AppLink, Avatar, Streak, UiCtx, useUi } from "./ui";

const LINKS_NAV = [
  { to: "/live", label: "Live" },
  { to: "/board", label: "Board" },
  { to: "/rounds", label: "Rounds" },
  { to: "/docs", label: "Docs" },
];

export function Shell() {
  const [search, setSearch] = useState(false);
  const me = useMe();
  const { rep: mine } = useReport(me);
  const ui = useMemo(() => ({ openSearch: () => setSearch(true), mine }), [mine]);
  const loc = useLocation();

  // cards light up under the cursor; the hero glow trails it. At most once a frame.
  useEffect(() => {
    if (!window.matchMedia("(hover: hover)").matches) return;
    let last: PointerEvent | null = null;
    let raf = 0;
    const paint = () => {
      raf = 0;
      const e = last!;
      const el = (e.target as HTMLElement).closest?.(".card, .kpi, .step, .pod, .round-row, .wcard, .hero") as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${Math.round(e.clientX - r.left)}px`);
      el.style.setProperty("--my", `${Math.round(e.clientY - r.top)}px`);
    };
    const move = (e: PointerEvent) => ((last = e), raf || (raf = requestAnimationFrame(paint)));
    window.addEventListener("pointermove", move, { passive: true });
    return () => (window.removeEventListener("pointermove", move), cancelAnimationFrame(raf));
  }, []);

  // sections ease in as they scroll into view (DOM changes are batched into one scan a frame)
  useEffect(() => {
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && (e.target.classList.add("seen"), io.unobserve(e.target))),
      { rootMargin: "0px 0px -6% 0px" },
    );
    let raf = 0;
    const scan = () => ((raf = 0), document.querySelectorAll("[data-reveal]:not(.seen)").forEach((n) => io.observe(n)));
    scan();
    const mo = new MutationObserver(() => raf || (raf = requestAnimationFrame(scan)));
    mo.observe(document.getElementById("root")!, { childList: true, subtree: true });
    return () => (io.disconnect(), mo.disconnect(), cancelAnimationFrame(raf));
  }, []);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement).tagName);
      if (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") || (e.key === "/" && !typing)) {
        e.preventDefault();
        setSearch(true);
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  return (
    <UiCtx.Provider value={ui}>
      <Watchers mine={mine} />
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
  const { mine: rep } = useUi();
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
        <AppLink to="/" className="nav-brand" aria-label={`${BRAND.name} home`}><Logo size={28} /></AppLink>
        <Tabs />
        <NavTimer />
        <div className="nav-right">
          <SearchButton />
          <button className="icon-btn theme-btn" onClick={(e) => toggle(e)} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
            <ThemeIcon />
          </button>
          {me ? (
            <AppLink to="/me" className={`acct st-${rep?.status ?? "idle"}`} aria-label="My streak">
              <Avatar id={me} size={24} />
              <span className="acct-id">{acct(me, 14)}</span>
              {rep && rep.liveStreak > 0 && <Streak n={rep.liveStreak} size={12} />}
            </AppLink>
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

/** The live window, always in reach: a tiny ring + countdown that opens /live. Hidden while the big orbit is on screen. */
function NavTimer() {
  const { snap } = useLive();
  const now = useNow();
  const loc = useLocation();
  const [heroVisible, setHeroVisible] = useState(false);
  useEffect(() => {
    if (loc.pathname !== "/") return setHeroVisible(false);
    let io: IntersectionObserver | null = null;
    const t = setTimeout(() => {
      const el = document.querySelector(".orbit-card");
      if (!el) return;
      io = new IntersectionObserver(([e]) => setHeroVisible(e.isIntersecting), { threshold: 0.15 });
      io.observe(el);
    }, 50);
    return () => (clearTimeout(t), io?.disconnect());
  }, [loc.pathname, !!snap]);
  const i = snap?.info;
  const open = !!i?.started && !!i.nextRoundAt;
  const anim = useWindowAnim(i?.windowStart ?? 0, i?.nextRoundAt ?? 0, open);
  if (!i || !open) return null;
  const left = Math.max(0, i.nextRoundAt - now);
  return (
    <AppLink to="/live" className={`nav-timer${heroVisible ? " away" : ""}${left <= 60 ? " hot" : ""}`} aria-label={`Window ${i.windowNo}, ${mmss(left)} left`}>
      <svg viewBox="0 0 24 24" width="20" height="20" style={anim.style} aria-hidden>
        <circle cx="12" cy="12" r="9" className="nt-track" />
        <circle key={anim.key} cx="12" cy="12" r="9" pathLength={1} className="nt-arc run-arc" transform="rotate(-90 12 12)" />
      </svg>
      <span className="nt-no">#{i.windowNo}</span>
      <Clock left={left} size="sm" />
    </AppLink>
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
        <NavLink key={l.to} to={l.to} viewTransition className={({ isActive }) => (isActive ? "on" : "")}
          onMouseEnter={(e) => (prefetchPath(l.to), setHov({ x: e.currentTarget.offsetLeft, w: e.currentTarget.offsetWidth }))}>
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

type Cmd = { key: string; label: string; hint?: string; icon: React.ReactNode; run: () => void };

/** ⌘K or "/": jump to a page, run an action, or open any wallet. */
function SearchBox({ onClose }: { onClose: () => void }) {
  const me = useMe();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [bad, setBad] = useState(false);
  const [sel, setSel] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const nav = useNavigate();
  const { snap } = useLive();
  const v = q.trim().toLowerCase();
  const close = (then?: () => void) => {
    setLeaving(true);
    setTimeout(() => (onClose(), then?.()), 160);
  };
  const go = (to: string) => close(() => nav(to, { viewTransition: true }));

  const pages: Cmd[] = [
    { key: "p:/", label: "Home", icon: <Home size={17} />, run: () => go("/") },
    { key: "p:/live", label: "Live", icon: <Pulse size={17} />, run: () => go("/live") },
    { key: "p:/board", label: "Leaderboard", icon: <Trophy size={17} />, run: () => go("/board") },
    { key: "p:/rounds", label: "Rounds", icon: <Coins size={17} />, run: () => go("/rounds") },
    { key: "p:/me", label: "My streak", icon: <Bean size={17} />, run: () => go("/me") },
    { key: "p:/docs", label: "Docs", icon: <Book size={17} />, run: () => go("/docs") },
  ];
  const actions: Cmd[] = [
    { key: "a:theme", label: "Switch theme", icon: <ThemeIcon />, run: () => close(() => toggleTheme()) },
    { key: "a:buy", label: `Buy $${SYMBOL}`, hint: "↗", icon: <Bean size={17} />, run: () => close(() => void window.open(LINKS.buy, "_blank", "noopener")) },
    {
      key: "a:copy", label: "Copy token address", icon: <Copy size={17} />,
      run: () => close(() => void navigator.clipboard?.writeText(TOKEN).then(() => toast({ tone: "good", title: "Copied", body: TOKEN }))),
    },
    ...(me ? [{ key: "a:untrack", label: "Stop tracking my wallet", icon: <Cross size={17} />, run: () => close(() => (setMe(null), toast({ tone: "info", title: "Not tracking" }))) }] : []),
  ];
  // everyone the engine has seen: ranked wallets first, then anyone on the tape
  const known = useMemo(() => {
    const b = snap?.board;
    const ids = [...(b?.next ?? []), ...(b?.streaks ?? []), ...(b?.allTime ?? [])].map((r) => r.id);
    for (const t of [...(snap?.trades ?? [])].reverse()) ids.push(t.w);
    return [...new Set(ids)];
  }, [snap]);
  const wallets: Cmd[] = (v.length > 1 ? known.filter((id) => id.includes(v)).slice(0, 5) : []).map((id) => ({
    key: `w:${id}`, label: id, icon: <Avatar id={id} size={18} />, run: () => go(`/wallet/${id}`),
  }));
  const direct: Cmd[] =
    isAccountId(v) && (v.includes(".") || /^[0-9a-f]{64}$/.test(v)) && !wallets.some((w) => w.label === v)
      ? [
          { key: `w:${v}`, label: v, hint: "open", icon: <Search size={17} />, run: () => go(`/wallet/${v}`) },
          ...(!me ? [{ key: "a:track", label: `Track ${v} as me`, icon: <Bean size={17} />, run: () => (setMe(v), go("/me")) }] : []),
        ]
      : [];
  const match = (c: Cmd) => !v || c.label.toLowerCase().includes(v);
  const groups: [string, Cmd[]][] = [
    ["Wallets", [...direct, ...wallets]],
    ["Go to", pages.filter(match)],
    ["Actions", actions.filter(match)],
  ];
  const items = groups.flatMap(([, g]) => g);
  const selKey = items[sel]?.key;

  useEffect(() => setSel(0), [v]);
  useEffect(() => {
    if (selKey?.startsWith("w:")) prefetchWallet(selKey.slice(2));
    if (selKey?.startsWith("p:")) prefetchPath(selKey.slice(2));
  }, [selKey]);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return close();
    if (!items.length) return;
    if (e.key === "ArrowDown") (e.preventDefault(), setSel((x) => (x + 1) % items.length));
    if (e.key === "ArrowUp") (e.preventDefault(), setSel((x) => (x - 1 + items.length) % items.length));
  };
  const submit = () => {
    const c = items[sel];
    if (c) return c.run();
    if (v) setBad(true);
  };
  let idx = -1;
  return (
    <div className={`sheet-back top${leaving ? " leaving" : ""}`} onClick={() => close()}>
      <form className="palette" onClick={(e) => e.stopPropagation()} onSubmit={(e) => (e.preventDefault(), submit())} onKeyDown={onKey} role="dialog" aria-label="Command palette">
        <div className="palette-in">
          <Search size={18} />
          <input autoFocus value={q} onChange={(e) => (setQ(e.target.value), setBad(false))} placeholder="Wallets, pages, actions…" spellCheck={false} autoCapitalize="off" aria-label="Command" aria-invalid={bad} />
          <kbd>esc</kbd>
        </div>
        {bad && <p className="form-err">No match</p>}
        <div className="palette-list">
          {groups.map(([title, g]) =>
            g.length ? (
              <div key={title} className="palette-group">
                <small>{title}</small>
                {g.map((c) => {
                  idx += 1;
                  const k = idx;
                  return (
                    <button type="button" key={c.key} className={`palette-hit${k === sel ? " sel" : ""}`} onMouseEnter={() => setSel(k)} onClick={c.run}>
                      <span className="ph-ic">{c.icon}</span>
                      <span className={c.key.startsWith("w:") ? "mono" : ""}>{c.label}</span>
                      {k === sel ? <kbd>↵</kbd> : c.hint ? <kbd>{c.hint}</kbd> : null}
                    </button>
                  );
                })}
              </div>
            ) : null,
          )}
        </div>
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
  else if (!snap.info.started)
    msg = snap.info.holders < snap.info.rules.minHolders
      ? `Waiting for holders · ${snap.info.holders}/${snap.info.rules.minHolders} · the timer starts at ${snap.info.rules.minHolders}`
      : "Warming up · first window opens soon";
  else if (snap.info.dryRun) msg = "Dry run · payouts are recorded, not sent";
  if (!msg) return null;
  return <div className="wrap"><p className={`status status-${tone}`}><span className="dot" />{msg}</p></div>;
}

const lag = (s: number) => (s < 120 ? `${s}s` : s < 7200 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`);

function Dock() {
  const cls = ({ isActive }: { isActive: boolean }) => (isActive ? "on" : "");
  return (
    <nav className="dock" aria-label="Quick">
      <NavLink viewTransition onTouchStart={() => prefetchPath("/")} to="/" end className={cls}><Home size={20} /><span>Home</span></NavLink>
      <NavLink viewTransition onTouchStart={() => prefetchPath("/live")} to="/live" className={cls}><Pulse size={20} /><span>Live</span></NavLink>
      <a className="dock-buy" href={LINKS.buy} target="_blank" rel="noreferrer" aria-label={`Buy ${SYMBOL}`}><Bean size={24} /></a>
      <NavLink viewTransition onTouchStart={() => prefetchPath("/board")} to="/board" className={cls}><Trophy size={20} /><span>Board</span></NavLink>
      <NavLink viewTransition onTouchStart={() => prefetchPath("/me")} to="/me" className={cls}><Coins size={20} /><span>Me</span></NavLink>
    </nav>
  );
}

function Footer() {
  return (
    <footer className="foot">
      <div className="wrap foot-in">
        <Logo size={28} />
        <nav>
          <AppLink to="/docs">Docs</AppLink>
          <AppLink to="/docs/api">API</AppLink>
          <a href={LINKS.token} target="_blank" rel="noreferrer">Token ↗</a>
          {BRAND.twitter && <a href={BRAND.twitter} target="_blank" rel="noreferrer">X ↗</a>}
          {BRAND.telegram && <a href={BRAND.telegram} target="_blank" rel="noreferrer">Telegram ↗</a>}
        </nav>
        <small className="muted"><Book size={13} /> Not financial advice</small>
      </div>
    </footer>
  );
}

/** The per-second background jobs, kept in their own leaf so the shell itself never re-renders on the clock. */
function Watchers({ mine }: { mine: WalletReport | null }) {
  useTabTitle();
  useRoundToasts();
  useStreakReminder(mine);
  return null;
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
      if (mine) {
        toast({ tone: "good", title: `+${near(mine.amount)}`, body: `Round #${top.no} · sent to ${acct(mine.w, 16)}` });
        celebrate();
      }
      else toast({ tone: "info", title: `Round #${top.no}`, body: top.qualifiers ? `${top.payouts.length} paid · ${near(top.paid)}` : "Stacked to the next" });
    }
    last.current = top.no;
  }, [top, account, toast, snap?.info.syncing]);
}

/** If reminders are on: one nudge per window when the tracked streak is about to break. */
function useStreakReminder(mine: WalletReport | null) {
  const { snap } = useLive();
  const on = useReminders();
  const toast = useToast();
  const now = useNow();
  const done = useRef(0);
  const i = snap?.info;
  useEffect(() => {
    if (!on || !mine || !i?.started || !i.nextRoundAt) return;
    const left = i.nextRoundAt - now;
    const atRisk = mine.status === "waiting" || (mine.status === "idle" && mine.known);
    if (!atRisk || left > 120 || left <= 0 || done.current === i.windowNo) return;
    done.current = i.windowNo;
    const body = mine.streak > 0 ? `Buy within ${mmss(left)} to keep your ${mine.streak}-window streak` : `Buy within ${mmss(left)} to be in round #${i.windowNo}`;
    if (!notify("Streak at risk", body)) toast({ tone: "info", title: "Streak at risk", body });
  }, [on, mine, i, now, toast]);
}

function useTabTitle() {
  const { snap } = useLive();
  const now = useNow();
  const page = useCurrentPageName();
  useEffect(() => {
    const i = snap?.info;
    const named = page ? `${page} · ${BRAND.name}` : BRAND.name;
    if (!i?.started || !i.nextRoundAt) return void (document.title = page ? named : `${BRAND.name} · ${BRAND.tagline}`);
    const left = i.nextRoundAt - now;
    document.title = `${left > 0 ? mmss(left) : "closing"} · ${named}`;
  }, [snap, now, page]);
}
