export interface Emitter<M extends object> {
  on<K extends keyof M>(type: K, fn: (payload: M[K]) => void): () => void;
  emit<K extends keyof M>(type: K, payload: M[K]): void;
}

/** Tiny typed emitter. `on` returns an unsubscribe function. */
export function createEmitter<M extends object>(): Emitter<M> {
  const handlers = new Map<keyof M, Set<(payload: never) => void>>();
  return {
    on(type, fn) {
      let set = handlers.get(type);
      if (!set) handlers.set(type, (set = new Set()));
      set.add(fn);
      return () => {
        set.delete(fn);
      };
    },
    emit(type, payload) {
      const set = handlers.get(type);
      if (!set) return;
      // Iterate a copy so handlers may unsubscribe (or subscribe) while we emit.
      for (const fn of [...set]) {
        if (set.has(fn)) (fn as (p: typeof payload) => void)(payload);
      }
    },
  };
}
