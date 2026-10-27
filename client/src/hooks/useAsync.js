import { useEffect, useState } from "react";

// Minimal data hook: { data, loading, error } for a promise-returning fn.
export function useAsync(fn, deps) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn().then(
      (data) => live && setState({ data, loading: false, error: null }),
      (error) => live && setState({ data: null, loading: false, error })
    );
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export function useTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} — Parent Of Khan` : "Parent Of Khan";
  }, [title]);
}
