import { useSyncExternalStore } from "react";

const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());
window.addEventListener("popstate", notify);

export function navigate(path: string) {
  if (path !== window.location.pathname) window.history.pushState({}, "", path);
  notify();
  window.scrollTo(0, 0);
}
export function usePath(): string {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => window.location.pathname);
}
