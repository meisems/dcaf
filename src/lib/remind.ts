import { useSyncExternalStore } from "react";

/** Streak reminders: opt-in, remembered on this device. */
const KEY = "dcaf-remind";
const subs = new Set<() => void>();
let on = (() => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
})();

function set(v: boolean) {
  on = v;
  try {
    if (v) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  subs.forEach((f) => f());
}

/** Turn reminders on, asking for notification permission (in-app alerts work either way). */
export async function enableReminders() {
  if ("Notification" in window && Notification.permission === "default") await Notification.requestPermission().catch(() => {});
  set(true);
}
export const disableReminders = () => set(false);

export const useReminders = () => useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), () => on);

/** A system notification when the tab is in the background; returns false if it couldn't show one. */
export function notify(title: string, body: string) {
  if (!document.hidden || !("Notification" in window) || Notification.permission !== "granted") return false;
  try {
    new Notification(title, { body, icon: "/favicon.svg", tag: "dcaf-streak" });
    return true;
  } catch {
    return false;
  }
}
