import { lazy } from "react";

// Page chunks, loadable ahead of time: hovering a link (or the browser being idle)
// warms the chunk, so navigating never shows a loading state.
const loaders = {
  live: () => import("../pages/Live"),
  board: () => import("../pages/Board"),
  rounds: () => import("../pages/Rounds"),
  me: () => import("../pages/Me"),
  docs: () => import("../pages/Docs"),
};
type Page = keyof typeof loaders;

const warm = new Map<Page, Promise<unknown>>();
const load = <K extends Page>(k: K) => {
  if (!warm.has(k)) warm.set(k, loaders[k]());
  return warm.get(k) as ReturnType<(typeof loaders)[K]>;
};

export const Pages = {
  Live: lazy(() => load("live")),
  Board: lazy(() => load("board")),
  Rounds: lazy(() => load("rounds")),
  RoundPage: lazy(() => load("rounds").then((m) => ({ default: m.RoundPage }))),
  Me: lazy(() => load("me")),
  WalletPage: lazy(() => load("me").then((m) => ({ default: m.WalletPage }))),
  Docs: lazy(() => load("docs")),
};

/** Warm the chunk behind a path like "/board" or "/wallet/alice.near". */
export function prefetchPath(path: string) {
  const seg = path.split("/")[1];
  const k = ({ live: "live", board: "board", rounds: "rounds", me: "me", wallet: "me", docs: "docs" } as Record<string, Page>)[seg];
  if (k) void load(k);
}

/** After the first paint settles, quietly load every page. */
export function prefetchAllWhenIdle() {
  const go = () => (Object.keys(loaders) as Page[]).forEach((k) => void load(k));
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  setTimeout(() => (ric ? ric(go, { timeout: 4000 }) : go()), 2500);
}
