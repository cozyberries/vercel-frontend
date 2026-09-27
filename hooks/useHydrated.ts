import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False on the server and while React hydrates, true right after. Gate markup that depends on
 * browser-only state (the signed-in user) on it: the header hydrates late, when the auth provider
 * already has the user the server never knew about, and that difference is a hydration mismatch.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
