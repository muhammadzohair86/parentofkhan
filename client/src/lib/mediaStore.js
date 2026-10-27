// One shared MediaQueryList + one native listener per query, however many components use it.
// Subscribers are only notified when the query's result actually flips, so continuous resizing causes no renders.
const stores = new Map();

export function mediaStore(query) {
  let s = stores.get(query);
  if (s) return s;
  const mq = window.matchMedia(query);
  const subs = new Set();
  const onChange = () => subs.forEach((cb) => cb());
  s = {
    subscribe(cb) {
      if (!subs.size) mq.addEventListener("change", onChange);
      subs.add(cb);
      return () => {
        subs.delete(cb);
        if (!subs.size) mq.removeEventListener("change", onChange); // no listener left behind
      };
    },
    getSnapshot: () => mq.matches,
  };
  stores.set(query, s);
  return s;
}

export const __testing = { stores };
