/* eslint-disable @typescript-eslint/no-use-before-define */

import React, {
  FunctionComponent,
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { observe } from "./observability";
import {
  excludeFromSnapshots,
  ObservabilityContext,
  proxy,
  withObservabilityContext,
} from "./proxy";
import { createSnapshot, Snapshot } from "./snapshot";

function isDevToolsRender() {
  const currentOwnerRef = (React as any)
    .__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED?.ReactCurrentOwner;
  return currentOwnerRef && !currentOwnerRef.current;
}

export const globalSnapshotRef: { current: Snapshot | undefined } = proxy(
  excludeFromSnapshots({
    current: undefined,
  })
);

export interface ObserveOptions {
  debugId?: string;
  followGlobalSnapshot?: boolean;
}

export type Observed = <T>(fn: () => T) => T;

export function useObserved(options: ObserveOptions = {}): Observed {
  const onStoreChangeRef = useRef<() => void>();

  const { followGlobalSnapshot = true } = options;

  // Uses a cached snapshot ref to keep a weak ref and to
  // be able to return a new ref and rerender even when snapshots didn't change
  const [getCachedSnapshotRef, clearSnapshotRefCache] = useMemo(() => {
    let cache: WeakRef<Snapshot> | undefined;
    return [
      () => {
        const snapshot =
          (followGlobalSnapshot && globalSnapshotRef.current) ||
          createSnapshot();
        if (cache?.deref() === snapshot) {
          return cache;
        }
        cache = new WeakRef(snapshot);
        return cache;
      },
      () => {
        cache = undefined;
      },
    ];
  }, []);

  const snapshotRef = useSyncExternalStore(
    useCallback((notify) => {
      onStoreChangeRef.current = notify;
      return () => (onStoreChangeRef.current = undefined);
    }, []),
    () => getCachedSnapshotRef()
  );

  const storeChangeCallback = useCallback(() => {
    if (!onStoreChangeRef.current) {
      throw new Error("Store changed when component was not subscribed");
    }
    // Clear cache to force rerender, because values not tracked by snapshots
    // might have changed
    clearSnapshotRefCache();
    onStoreChangeRef.current();
  }, []);

  useLayoutEffect(() => {
    if (!followGlobalSnapshot) return;
    return observe(
      globalSnapshotRef,
      ["current"],
      storeChangeCallback,
      options.debugId
    );
  }, [followGlobalSnapshot, storeChangeCallback, options.debugId]);

  const readDuringRenderRef = useRef<Map<any, Set<PropertyKey>>>();
  if (!readDuringRenderRef.current) {
    readDuringRenderRef.current = new Map();
  } else {
    readDuringRenderRef.current.clear();
  }

  useLayoutEffect(() => {
    const disposers: (() => void)[] = [];
    for (const [target, properties] of Array.from(
      readDuringRenderRef.current!.entries()
    )) {
      for (const property of Array.from(properties)) {
        disposers.push(
          observe(target, [property], storeChangeCallback, options.debugId)
        );
      }
    }
    return () => {
      // Dispose subscriptions
      for (let dispose of disposers) {
        dispose();
      }
    };
  }, [{} /* Run after every render */]);

  const observabilityContext = useMemo(() => {
    return {
      onGet(target, property) {
        if (!isRenderingRef.current) {
          return;
        }
        let readProperties = readDuringRenderRef.current!.get(target);
        if (!readProperties) {
          readProperties = new Set();
          readDuringRenderRef.current!.set(target, readProperties);
        }
        readProperties.add(property);
      },
      onSet() {
        if (isRenderingRef.current) {
          throw new Error("Do not write state during render");
        }
      },
    } as ObservabilityContext;
  }, []);

  const isRenderingRef = useRef(false);
  if (!isDevToolsRender()) {
    // Mark as rendering
    isRenderingRef.current = true;

    // Use snapshot during render, holding a strong reference until apply phase
    // If weakRef is empty, it means no other component was rendered using this snapshot
    // in the current cycle and we don't need to use the snapshot here as well
    observabilityContext.snapshot = snapshotRef.deref();
  }
  const afterRender: () => void = useCallback(() => {
    // Mark rendering as complete
    isRenderingRef.current = false;

    // Stop reading from snapshot after rendered
    if (followGlobalSnapshot && globalSnapshotRef.current) {
      observabilityContext.snapshot = globalSnapshotRef.current;
    } else {
      observabilityContext.snapshot = undefined;
    }

    // Let's execute it even sooner next render, during effect dispose, but it will be executed twice
    // That allows following component effect disposers to not be considered in a snapshot or during render
    return afterRender;
  }, []);
  useLayoutEffect(afterRender, [{} /* Run after every render */]);

  return useCallback<Observed>((fn) => {
    return withObservabilityContext(observabilityContext, fn);
  }, []);
}

export function observer<P>(render: FunctionComponent<P>): FunctionComponent<P>;
export function observer<P>(
  options: ObserveOptions,
  render: FunctionComponent<P>
): FunctionComponent<P>;
export function observer<P>(
  ...args: [ObserveOptions, FunctionComponent<P>] | [FunctionComponent<P>]
): FunctionComponent<P> {
  let options = args.length === 2 ? args[0] : undefined;
  let render = args.length === 2 ? args[1] : args[0];
  return memo(function wrapped(props: P, context) {
    const observed = useObserved(options);
    return observed(() => render(props, context));
  });
}
