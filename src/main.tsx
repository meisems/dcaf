import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Link } from "react-router";
import { RouterProvider } from "react-router/dom";
import { Shell } from "./components/Shell";
import { Empty } from "./components/ui";
import { live } from "./lib/api";
import { ToastProvider } from "./lib/toast";
import Home from "./pages/Home";
import "./styles.css";

const Live = lazy(() => import("./pages/Live"));
const Board = lazy(() => import("./pages/Board"));
const Rounds = lazy(() => import("./pages/Rounds"));
const RoundPage = lazy(() => import("./pages/Rounds").then((m) => ({ default: m.RoundPage })));
const Me = lazy(() => import("./pages/Me"));
const WalletPage = lazy(() => import("./pages/Me").then((m) => ({ default: m.WalletPage })));
const Docs = lazy(() => import("./pages/Docs"));

const page = (el: React.ReactNode) => <Suspense fallback={<div className="card skeleton" style={{ height: 360 }} />}>{el}</Suspense>;

const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/live", element: page(<Live />) },
      { path: "/board", element: page(<Board />) },
      { path: "/rounds", element: page(<Rounds />) },
      { path: "/rounds/:no", element: page(<RoundPage />) },
      { path: "/me", element: page(<Me />) },
      { path: "/wallet/:id", element: page(<WalletPage />) },
      { path: "/docs", element: page(<Docs />) },
      { path: "/docs/:slug", element: page(<Docs />) },
      { path: "*", element: <Empty title="Nothing brewing here"><Link to="/" className="btn btn-soft">Home</Link></Empty> },
    ],
  },
]);

live.start();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>
  </StrictMode>,
);

// fold the boot screen away in tiles once the intro has played and the first
// snapshot is in (instant from cache on a revisit, or after 6s at worst)
const boot = document.getElementById("boot");
if (boot) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const minAt = reduced ? 150 : 2700;
  const lift = () => {
    (window as unknown as { __bootWall?: () => void }).__bootWall?.();
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        boot.classList.add("out");
        document.body.classList.add("ready");
        setTimeout(() => boot.remove(), 1400);
      }),
    );
  };
  const tick = () => (live.get().loaded || performance.now() > 6000 ? lift() : setTimeout(tick, 120));
  setTimeout(tick, Math.max(0, minAt - performance.now()));
}

// cache the app shell, assets and fonts for instant, offline-capable loads
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => void navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
