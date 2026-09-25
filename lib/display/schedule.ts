/** How long each slide stays on screen. */
export const SLIDE_MS = 7000;
/** Crossfade between slides; the outgoing slide is unmounted after this. */
export const FADE_MS = 1000;
/** While any slide's photo is missing (a download failed), try the photo sync again this often. */
export const PHOTO_RETRY_MS = 5 * 60 * 1000;
/** Local hour at which an online display reloads itself (new deploys, fresh memory). */
export const NIGHTLY_RELOAD_HOUR = 4;

/** Milliseconds from `now` until the next local `hour`:00. Exactly on the hour counts as the next day. */
export function msUntilNextReload(now: Date, hour: number = NIGHTLY_RELOAD_HOUR): number {
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}
