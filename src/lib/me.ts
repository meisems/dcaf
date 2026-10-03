import { useSyncExternalStore } from "react";

/**
 * "Me" is just an account id remembered on this device. No wallet, no signing:
 * the engine tracks every buyer on-chain and pays them automatically.
 */
const KEY = "dcaf-me";
const subs = new Set<() => void>();

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

let current = typeof window === "undefined" ? null : read();

export function setMe(id: string | null) {
  current = id;
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode: remembered for this visit only */
  }
  subs.forEach((f) => f());
}

export function useMe(): string | null {
  return useSyncExternalStore(
    (fn) => {
      subs.add(fn);
      const onStorage = (e: StorageEvent) => e.key === KEY && ((current = read()), fn());
      window.addEventListener("storage", onStorage);
      return () => {
        subs.delete(fn);
        window.removeEventListener("storage", onStorage);
      };
    },
    () => current,
  );
}
