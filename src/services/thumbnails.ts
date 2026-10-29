import { ThumbnailsMod } from './native';

const cache = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();
const MAX_PARALLEL = 2;
let active = 0;
const waiting: Array<() => void> = [];

function schedule<T>(job: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve) => {
    const run = () => {
      active += 1;
      job().then(resolve).finally(() => {
        active -= 1;
        const next = waiting.shift();
        if (next) next();
      });
    };
    if (active < MAX_PARALLEL) run();
    else waiting.push(run);
  });
}

export function getCachedThumbnail(id: string): string | null | undefined {
  return cache.get(id);
}

/** Generates (once per session) a frame image for a video. Resolves null when it can't be generated. */
export function requestThumbnail(id: string, uri: string, durationSec?: number): Promise<string | null> {
  if (cache.has(id)) return Promise.resolve(cache.get(id) ?? null);
  const inflight = pending.get(id);
  if (inflight) return inflight;
  const mod = ThumbnailsMod.mod;
  if (!mod) {
    cache.set(id, null);
    return Promise.resolve(null);
  }
  const p = schedule(async () => {
    try {
      const time = durationSec && durationSec > 0 ? Math.min(1000, durationSec * 500) : 1000;
      const res = await mod.getThumbnailAsync(uri, { time, quality: 0.5 });
      cache.set(id, res.uri);
      return res.uri as string;
    } catch {
      cache.set(id, null);
      return null;
    } finally {
      pending.delete(id);
    }
  });
  pending.set(id, p);
  return p;
}
