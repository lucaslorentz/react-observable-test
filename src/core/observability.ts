/**
 * Observability
 */

import { isProxy } from "./proxy";
import { TreeMap } from "./tree-map";

export const $ownKeys = Symbol("ownKeys");
export const $mapKeys = Symbol("mapKeys");
export const $mapValues = Symbol("mapValues");

export interface ObserversChange {
  type: "add" | "remove";
  observer: Observer;
}

export type MonitorCallback = (target: any, change: ObserversChange) => void;

export interface Monitor {
  callback: MonitorCallback;
}
const monitors = new WeakMap<any, Set<Monitor>>();
function observersChanged(target: any, change: ObserversChange) {
  const targetMonitors = monitors.get(target);
  if (targetMonitors) {
    for (const monitor of Array.from(targetMonitors)) {
      monitor.callback(target, change);
    }
  }
}
export function monitorObservers(target: Object, callback: MonitorCallback) {
  if (!isProxy(target)) {
    throw new Error("Can't monitor non proxies");
  }

  const monitor: Monitor = {
    callback,
  };
  let targetMonitors = monitors.get(target);
  if (!targetMonitors) {
    targetMonitors = new Set<Monitor>();
    monitors.set(target, targetMonitors);
  }
  targetMonitors.add(monitor);
  return () => {
    targetMonitors!.delete(monitor);
    if (targetMonitors!.size === 0) {
      monitors.delete(targetMonitors);
    }
  };
}

export type ChangedCallback = (changes: Change[]) => void;

export interface Observer {
  readonly callback: ChangedCallback;
  readonly debugId?: string;
}

export interface Change {
  readonly target: Object;
  readonly property: PropertyKey;
  readonly oldValue: unknown;
  readonly newValue: unknown;
  readonly debugId?: string;
}

const observers = new WeakMap<any, TreeMap<Set<Observer>>>();

export function observe(
  target: any,
  keys: PropertyKey[],
  callback: ChangedCallback,
  debugId?: string
): () => void {
  if (!isProxy(target)) {
    throw new Error("Can't observe non proxies");
  }

  let targetObservers = observers.get(target);
  if (!targetObservers) {
    targetObservers = new TreeMap();
    observers.set(target, targetObservers);
  }

  let keysObservers = targetObservers.get(keys);
  if (!keysObservers) {
    keysObservers = new Set();
    targetObservers.set(keys, keysObservers);
  }

  const observer: Observer = {
    debugId,
    callback,
  };

  keysObservers.add(observer);
  observersChanged(target, { type: "add", observer });

  return function () {
    if (!keysObservers!.has(observer)) {
      return;
    }
    keysObservers!.delete(observer);
    if (keysObservers!.size === 0) {
      targetObservers!.delete(keys);
    }
    if (targetObservers!.size === 0) {
      observers.delete(target);
    }
    observersChanged(target, { type: "remove", observer });
  };
}

export function getObservedProperties(
  target: Object,
  keys: PropertyKey[]
): PropertyKey[] {
  const targetObservers = observers.get(target);
  if (!targetObservers) {
    return [];
  }
  return Array.from(targetObservers.keys(keys));
}

export function getObservers(target: Object, keys: PropertyKey[]): Observer[] {
  const objObservers = observers.get(target);
  if (!objObservers) {
    return [];
  }
  const keysObservers = objObservers.get(keys);
  if (!keysObservers) {
    return [];
  }
  return Array.from(keysObservers.values());
}

const batchNotifications = true;
let queuedChanges: Change[] = [];
function notifyQueuedChanges() {
  const changes = queuedChanges;
  queuedChanges = [];

  const changesByTarget: Map<any, Map<PropertyKey, Change[]>> = new Map();
  for (const change of changes) {
    let targetChanges = changesByTarget.get(change.target);
    if (!targetChanges) {
      targetChanges = new Map();
      changesByTarget.set(change.target, targetChanges);
    }
    let propertyChanges = targetChanges.get(change.property);
    if (!propertyChanges) {
      propertyChanges = [];
      targetChanges.set(change.property, propertyChanges);
    }
    propertyChanges.push(change);
  }

  for (const [target, targetChanges] of Array.from(changesByTarget)) {
    for (const [property, propertyChanges] of Array.from(targetChanges)) {
      const observersCopy = getObservers(target, [property]);
      for (const observer of observersCopy) {
        observer.callback(propertyChanges);
      }
    }
  }
}

export function reportChanges(changes: Change[]): void {
  for (let change of changes) {
    if (!isProxy(change.target)) {
      throw new Error("Can't report non proxies changes");
    }
  }

  if (batchNotifications) {
    if (queuedChanges.length === 0) {
      queueMicrotask(notifyQueuedChanges);
    }
    queuedChanges.push(...changes);
  } else {
    for (let change of changes) {
      const observersCopy = getObservers(change.target, [change.property]);
      for (const observer of observersCopy) {
        observer.callback([change]);
      }
    }
  }
}
