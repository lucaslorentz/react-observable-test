/**
 * react-observable-test snapshots that are observability library agnostic
 * Snapshots could work even accross observability libraries
 * as long as those libraries integrates with it
 */

import { TreeMap } from "./tree-map";

const _id = Symbol("id");
const _values = Symbol("values");
const _objects = Symbol("values");
const _size = Symbol("size");
const _nextSnapshot = Symbol("nextSnapshot");
const _setValue = Symbol("setValue");
const _create = Symbol("create");

// Used for faster "has" operation without iterating through keys
export const notPresent = Symbol("notPresent");

const latestObjectSnapshots = new WeakMap<Object, ObjectSnapshot>();
export class ObjectSnapshot {
  private constructor(id: number) {
    this[_id] = id;
  }
  static [_create](id: number) {
    return new ObjectSnapshot(id);
  }
  [_id]: number;
  [_values] = new TreeMap();
  [_size] = 0;
  [_nextSnapshot]: ObjectSnapshot | undefined;
  [_setValue](keys: unknown[], value: unknown): boolean {
    if (!this[_values].has(keys)) {
      this[_values].set(keys, value);
      this[_size]++;
      return true;
    }
    return false;
  }
  get id(): number {
    return this[_id];
  }
  get nextSnapshot(): ObjectSnapshot | undefined {
    return this[_nextSnapshot];
  }
  // TODO: Rename to getdata and just return _values.inner
  keys(keys: unknown[] = [], stopSnapshot?: ObjectSnapshot): Set<unknown> {
    if (stopSnapshot === this) {
      return new Set();
    }
    const objects = this[_nextSnapshot]?.keys(keys, stopSnapshot) ?? new Set();
    for (const obj of Array.from(this[_values].keys(keys))) {
      objects.add(obj);
    }
    return objects;
  }
  has(
    keys: unknown[],
    stopSnapshotOrCurrentHas?: ObjectSnapshot | (() => boolean)
  ): boolean {
    let snap: ObjectSnapshot | undefined = this;
    while (snap) {
      if (stopSnapshotOrCurrentHas === snap) {
        break;
      }
      if (snap[_values].has(keys)) {
        return snap[_values].get(keys) !== notPresent;
      }
      snap = snap[_nextSnapshot];
    }
    if (typeof stopSnapshotOrCurrentHas === "function") {
      return stopSnapshotOrCurrentHas();
    }
    return false;
  }
  get(
    keys: unknown[],
    stopSnapshotOrGetCurrentValue?: ObjectSnapshot | (() => unknown)
  ): unknown {
    let snap: ObjectSnapshot | undefined = this;
    while (snap) {
      if (stopSnapshotOrGetCurrentValue === snap) {
        break;
      }
      if (snap[_values].has(keys)) {
        return snap[_values].get(keys);
      }
      snap = snap[_nextSnapshot];
    }
    if (typeof stopSnapshotOrGetCurrentValue === "function") {
      return stopSnapshotOrGetCurrentValue();
    }
    return undefined;
  }
}
export function createObjectSnapshot(target: Object) {
  const latest = latestObjectSnapshots.get(target);
  if (latest?.[_size] === 0) {
    return latest;
  }
  const newSnapshot = ObjectSnapshot[_create](latest ? latest.id + 1 : 1);
  if (latest) {
    latest[_nextSnapshot] = newSnapshot;
  }
  latestObjectSnapshots.set(target, newSnapshot);
  return newSnapshot;
}

let latestSnapshotRef: WeakRef<Snapshot> | undefined;
export class Snapshot {
  private constructor(id: number) {
    this[_id] = id;
  }
  static [_create](id: number) {
    return new Snapshot(id);
  }
  [_id]: number;
  [_objects] = new Map<Object, ObjectSnapshot>(); // TODO: Change to weakmap?
  [_size] = 0;
  [_nextSnapshot]: Snapshot | undefined;
  [_setValue](object: Object, keys: unknown[], value: unknown): boolean {
    let objectSnapshot = this[_objects].get(object);
    if (!objectSnapshot) {
      objectSnapshot = createObjectSnapshot(object);
      this[_objects].set(object, objectSnapshot);
    }
    if (objectSnapshot[_setValue](keys, value)) {
      this[_size]++;
      return true;
    }
    return false;
  }
  get id(): number {
    return this[_id];
  }
  get nextSnapshot(): Snapshot | undefined {
    return this[_nextSnapshot];
  }
  getObjects(compareSnapshot?: Snapshot): Set<Object> {
    const objects = new Set<Object>();
    let snap: Snapshot | undefined = this;
    while (snap) {
      if (compareSnapshot === snap) {
        break;
      }
      for (const obj of snap[_objects].keys()) {
        objects.add(obj);
      }
      snap = snap[_nextSnapshot];
    }
    return objects;
  }
  getObjectSnapshot(
    object: Object,
    compareSnapshot?: Snapshot
  ): ObjectSnapshot | undefined {
    let snap: Snapshot | undefined = this;
    while (snap) {
      if (compareSnapshot === snap) {
        break;
      }
      if (snap[_objects].has(object)) {
        return snap[_objects].get(object);
      }
      snap = snap[_nextSnapshot];
    }
    return undefined;
  }
  keys(
    object: Object,
    keys: unknown[] = [],
    compareSnapshot?: Snapshot
  ): Set<unknown> {
    const objectSnapshot = this.getObjectSnapshot(object, compareSnapshot);
    if (!objectSnapshot) {
      return new Set();
    }
    const compareObjectSnapshot = compareSnapshot?.getObjectSnapshot(object);
    return objectSnapshot.keys(keys, compareObjectSnapshot);
  }
  has(
    object: Object,
    keys: unknown[],
    compareSnapshotOrCurrent?: Snapshot | (() => boolean)
  ): boolean {
    if (typeof compareSnapshotOrCurrent === "function") {
      const objectSnapshot = this.getObjectSnapshot(object, undefined);
      if (!objectSnapshot) {
        return compareSnapshotOrCurrent();
      }
      return objectSnapshot.has(keys, compareSnapshotOrCurrent);
    } else {
      const objectSnapshot = this.getObjectSnapshot(
        object,
        compareSnapshotOrCurrent
      );
      if (!objectSnapshot) {
        return false;
      }
      const compareObjectSnapshot =
        compareSnapshotOrCurrent?.getObjectSnapshot(object);
      return objectSnapshot.has(keys, compareObjectSnapshot);
    }
  }
  get(
    object: Object,
    keys: unknown[],
    compareSnapshotOrCurrent?: Snapshot | (() => unknown)
  ): unknown {
    if (typeof compareSnapshotOrCurrent === "function") {
      const objectSnapshot = this.getObjectSnapshot(object, undefined);
      if (!objectSnapshot) {
        return compareSnapshotOrCurrent();
      }
      return objectSnapshot.get(keys, compareSnapshotOrCurrent);
    } else {
      const objectSnapshot = this.getObjectSnapshot(
        object,
        compareSnapshotOrCurrent
      );
      if (!objectSnapshot) {
        return undefined;
      }
      const compareObjectSnapshot =
        compareSnapshotOrCurrent?.getObjectSnapshot(object);
      return objectSnapshot.get(keys, compareObjectSnapshot);
    }
  }
}

export function updateSnapshots(
  object: Object,
  keys: unknown[],
  value: unknown
) {
  latestSnapshotRef?.deref()?.[_setValue](object, keys, value);
}

const snapshotMonitors = new Set<{
  callback: (snapshot: Snapshot) => void;
}>();
export function monitorNewSnapshot(
  callback: (snapshot: Snapshot) => void
): () => void {
  const monitor = {
    callback,
  };
  snapshotMonitors.add(monitor);
  return () => {
    snapshotMonitors.delete(monitor);
  };
}

export function createSnapshot(): Snapshot {
  const latest = latestSnapshotRef?.deref();
  if (latest?.[_size] === 0) {
    return latest;
  }
  const newSnapshot = Snapshot[_create](latest ? latest.id + 1 : 1);
  if (latest) {
    latest[_nextSnapshot] = newSnapshot;
  }
  latestSnapshotRef = new WeakRef(newSnapshot);
  for (const monitor of Array.from(snapshotMonitors)) {
    monitor.callback(newSnapshot);
  }
  return newSnapshot;
}
