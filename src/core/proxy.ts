import {
  $mapKeys,
  $mapValues,
  $ownKeys,
  Change,
  reportChanges,
} from "./observability";
import { notPresent, Snapshot, updateSnapshots } from "./snapshot";

const propertyBlocklist: Set<string | symbol> = new Set(["constructor"]);

const _proxyTarget = Symbol("proxyTarget");

export function unproxy<T extends Object>(obj: T) {
  if (typeof obj === "object" && obj !== null) {
    return Reflect.get(obj, _proxyTarget) ?? obj;
  }
  return obj;
}

export function isProxy<T extends Object>(obj: T) {
  return (
    typeof obj === "object" &&
    obj !== null &&
    Boolean(Reflect.get(obj, _proxyTarget))
  );
}

const proxies = new WeakMap<any, any>();
export function proxy<T extends Object>(target: T): T {
  if (typeof target !== "object" && typeof target !== "function") {
    throw new Error("Only objects or functions can be proxied");
  }
  if (isProxy(target)) {
    throw new Error("Target is already a proxy");
  }
  if (proxies.has(target)) {
    return proxies.get(target);
  }
  const proxy = new Proxy(target, proxyHandler);
  proxies.set(target, proxy);
  return proxy;
}

const snapshotExclusions = new WeakSet();
export function excludeFromSnapshots<T extends object>(target: T): T {
  snapshotExclusions.add(target);
  return target;
}

function checkKeysUnbound(
  object: any,
  objectProxy: any,
  lastKeys: (string | symbol)[],
  keys: (string | symbol)[],
  keysSymbol: symbol,
  debugId?: string
): Change[] {
  let changed = false;
  const maxLength = Math.max(lastKeys.length, keys.length);
  for (let i = 0; i < maxLength; i++) {
    if (keys[i] !== lastKeys[i]) {
      if (!snapshotExclusions.has(object)) {
        updateSnapshots(objectProxy, [keysSymbol, String(i)], lastKeys[i]);
      }
      changed = true;
    }
  }
  if (lastKeys.length !== keys.length) {
    if (!snapshotExclusions.has(object)) {
      updateSnapshots(objectProxy, [keysSymbol, "length"], lastKeys.length);
    }
    changed = true;
  }
  if (!changed) {
    return [];
  }
  return [
    {
      target: objectProxy,
      property: keysSymbol,
      oldValue: lastKeys,
      newValue: keys,
      debugId,
    },
  ];
}

function trackOwnKeys(target: any, targetProxy: any): () => Change[] {
  const lastKeys = Reflect.ownKeys(target);
  return () =>
    checkKeysUnbound(
      target,
      targetProxy,
      lastKeys,
      Reflect.ownKeys(target),
      $ownKeys
    );
}

export interface ObservabilityContext {
  debugId?: string;
  snapshot?: Snapshot;
  onGet?(target: any, property: string | symbol): void;
  onSet?(target: any, property: string | symbol, value: any): void;
}

let currentObservabilityContext: ObservabilityContext = {
  debugId: "Global",
};
export function getObservabilityContext() {
  return currentObservabilityContext;
}
export function withObservabilityContext(
  context: ObservabilityContext,
  fn: () => any
) {
  const previous = currentObservabilityContext;
  currentObservabilityContext = context;
  try {
    return fn();
  } finally {
    currentObservabilityContext = previous;
  }
}

type ApplyInterceptor = (
  target: any,
  thisArg: any,
  argumentList: any[]
) => void;
const applyInterceptors = new WeakMap<Function, ApplyInterceptor>();
export function interceptApply(fn: Function, interceptor: ApplyInterceptor) {
  applyInterceptors.set(fn, interceptor);
}

type GetInterceptor = (
  target: any,
  property: string | symbol,
  receiver: any
) => void;
const getInterceptors = new WeakMap<
  Function,
  Map<string | symbol, GetInterceptor>
>();
export function interceptGet(
  baseType: Function,
  property: string | symbol,
  interceptor: GetInterceptor
) {
  let baseTypeInterceptors = getInterceptors.get(baseType);
  if (!baseTypeInterceptors) {
    baseTypeInterceptors = new Map();
    getInterceptors.set(baseType, baseTypeInterceptors);
  }
  baseTypeInterceptors.set(property, interceptor);
}

function ensureNotProxy(target: any) {
  if (isProxy(target)) {
    throw new Error(
      "Double interceptor detected. Avoid proxying already proxied objects"
    );
  }
}
function ensureProxy(target: any) {
  if (!isProxy(target)) {
    throw new Error("Should be proxy");
  }
}

let isGetter = false;
let isSetter = false;
let runningGets = 0;

const proxyHandler = {
  get(target: any, property: string | symbol, receiver: any) {
    ensureNotProxy(target);

    if (property === _proxyTarget) {
      return target;
    }
    if (property === $ownKeys) {
      return this.ownKeys(target);
    }

    if (propertyBlocklist.has(property)) {
      return Reflect.get(target, property, receiver);
    }

    const baseGetInterceptors = getInterceptors.get(target.constructor);
    const getInterceptor = baseGetInterceptors?.get(property);
    if (getInterceptor) {
      return getInterceptor(target, property, receiver);
    }

    let value: any;
    let localIsGetter;
    try {
      runningGets++;
      isGetter = false;
      if (currentObservabilityContext.snapshot) {
        value = currentObservabilityContext.snapshot.get(
          receiver,
          [property],
          () => Reflect.get(target, property, receiver)
        );
      } else {
        value = Reflect.get(target, property, receiver);
      }
      localIsGetter = isGetter;
    } finally {
      isGetter = true; // Flag to caller that it is a getter
      runningGets--;
    }

    if (!localIsGetter) {
      currentObservabilityContext.onGet?.(receiver, property);
    }

    if (value === notPresent) {
      return undefined;
    }

    if (typeof value === "function") {
      return proxy(value);
    }

    return value;
  },
  set(target: any, property: string | symbol, newValue: any, receiver: any) {
    ensureNotProxy(target);

    if (currentObservabilityContext.snapshot) {
      throw new Error("Cannot make changes in snapshot");
    }
    if (runningGets > 0) {
      throw new Error("Getters should not have side effects");
    }

    const oldHas = Reflect.has(target, property);
    const oldValue = Reflect.get(target, property);
    const checkOwnKeys = trackOwnKeys(target, receiver);

    let wasSet;
    let localIsSetter;
    try {
      isSetter = false;
      wasSet = Reflect.set(
        target,
        property,
        newValue,
        // TODO: Receiver should always be the proxy, check if it is and remove the proxy call
        receiver
      );
      localIsSetter = isSetter;
    } finally {
      isSetter = true; // Flag to caller that it is a setter
    }

    if (wasSet) {
      if (!localIsSetter) {
        if (!snapshotExclusions.has(target)) {
          updateSnapshots(receiver, [property], oldHas ? oldValue : notPresent);
        }
        reportChanges([
          {
            target: receiver,
            property,
            oldValue,
            newValue,
            debugId: currentObservabilityContext.debugId,
          },
          ...checkOwnKeys(),
        ]);
        currentObservabilityContext.onSet?.(receiver, property, newValue);
      }
      return true;
    }
    return false;
  },
  defineProperty(
    target: any,
    property: string | symbol,
    descriptor: PropertyDescriptor
  ) {
    ensureNotProxy(target);
    const targetProxy = proxy(target);
    const checkOwnKeys = trackOwnKeys(target, targetProxy);
    const defined = Reflect.defineProperty(target, property, descriptor);
    if (defined) {
      checkOwnKeys();
    }
    return defined;
  },
  deleteProperty(target: any, property: string | symbol) {
    ensureNotProxy(target);
    if (currentObservabilityContext.snapshot) {
      throw new Error("Cannot make changes in snapshot");
    }
    if (runningGets > 0) {
      throw new Error("Getters should not have side effects");
    }
    const targetProxy = proxy(target);
    const oldHas = Reflect.has(target, property);
    const oldValue = Reflect.get(target, property);
    const checkOwnKeys = trackOwnKeys(target, targetProxy);
    if (Reflect.deleteProperty(target, property)) {
      if (!snapshotExclusions.has(target)) {
        updateSnapshots(
          targetProxy,
          [property],
          oldHas ? oldValue : notPresent
        );
      }
      reportChanges([
        {
          target: targetProxy,
          property,
          oldValue,
          newValue: notPresent,
          debugId: currentObservabilityContext.debugId,
        },
        ...checkOwnKeys(),
      ]);
      currentObservabilityContext.onSet?.(targetProxy, property, undefined);
      return true;
    }

    return false;
  },
  apply(target: any, thisArg: any, args: any[]) {
    ensureNotProxy(target);
    const applyInterceptor = applyInterceptors.get(target);
    if (applyInterceptor) {
      return applyInterceptor(target, thisArg, args);
    }
    return Reflect.apply(target, thisArg, args);
  },
  getOwnPropertyDescriptor(target: any, property: string | symbol) {
    ensureNotProxy(target);
    const targetProxy = proxy(target);
    const propertyDescriptor = Reflect.getOwnPropertyDescriptor(
      target,
      property
    );
    if (propertyDescriptor) {
      if ("value" in propertyDescriptor) {
        propertyDescriptor.value = this.get(target, property, targetProxy);
      }
      return propertyDescriptor;
    }
    if (this.has(target, property)) {
      return {
        value: this.get(target, property, targetProxy),
        writable: true,
        enumerable: true,
        configurable: true,
      };
    }
    return undefined;
  },
  has(target: any, property: string | symbol) {
    ensureNotProxy(target);
    const targetProxy = proxy(target);
    currentObservabilityContext.onGet?.(targetProxy, $ownKeys);
    if (currentObservabilityContext.snapshot) {
      return currentObservabilityContext.snapshot.has(
        targetProxy,
        [property],
        () => Reflect.has(target, property)
      );
    } else {
      return Reflect.has(target, property);
    }
  },
  ownKeys(target: any): ArrayLike<string | symbol> {
    ensureNotProxy(target);
    const targetProxy = proxy(target);
    currentObservabilityContext.onGet?.(targetProxy, $ownKeys);
    const ownKeys = Reflect.ownKeys(target);
    if (currentObservabilityContext.snapshot) {
      const snapshotOwnKeysLength = currentObservabilityContext.snapshot.get(
        targetProxy,
        [$ownKeys, "length"],
        () => ownKeys.length
      ) as number;
      const snapshotOwnKeys = new Array(snapshotOwnKeysLength);
      for (let i = 0; i < snapshotOwnKeysLength; i++) {
        snapshotOwnKeys[i] = currentObservabilityContext.snapshot.get(
          targetProxy,
          [$ownKeys, String(i)],
          () => ownKeys[i]
        );
      }
      return snapshotOwnKeys;
    } else {
      return ownKeys;
    }
  },
};

// Arrays
interceptApply(
  Array.prototype.push,
  function (target, arrayProxy: Array<any>, args) {
    ensureNotProxy(target);
    ensureProxy(arrayProxy);
    const array = unproxy(arrayProxy);
    arrayProxy.splice(array.length, 0, ...args);
    return array.length;
  }
);
interceptApply(
  Array.prototype.pop,
  function (target, arrayProxy: Array<any>, args) {
    ensureNotProxy(target);
    ensureProxy(arrayProxy);
    const array = unproxy(arrayProxy);
    const removedItems = arrayProxy.splice(array.length - 2, 1);
    return removedItems[0];
  }
);
interceptApply(
  Array.prototype.shift,
  function (target, arrayProxy: Array<any>, args) {
    ensureNotProxy(target);
    ensureProxy(arrayProxy);
    const removedItems = arrayProxy.splice(0, 1);
    return removedItems[0];
  }
);
interceptApply(
  Array.prototype.unshift,
  function (target, arrayProxy: Array<any>, args) {
    ensureNotProxy(target);
    ensureProxy(arrayProxy);
    const array = unproxy(arrayProxy);
    arrayProxy.splice(0, 0, ...args);
    return array.length;
  }
);
interceptApply(
  Array.prototype.reverse,
  function (target, arrayProxy: Array<any>, args) {
    ensureNotProxy(target);
    ensureProxy(arrayProxy);
    const array = unproxy(arrayProxy);
    const checkOwnKeys = trackOwnKeys(array, arrayProxy);
    Reflect.apply(target, array, args);
    const changes: Change[] = [];
    const length = array.length;
    for (let s = 0, e = 0; s < length / 2; s++, e--) {
      if (array[s] !== array[e]) {
        if (!snapshotExclusions.has(array)) {
          updateSnapshots(arrayProxy, [String(s)], array[e]);
          updateSnapshots(arrayProxy, [String(e)], array[s]);
        }
        changes.push({
          target: arrayProxy,
          property: String(s),
          oldValue: array[e],
          newValue: array[s],
          debugId: currentObservabilityContext.debugId,
        });
        changes.push({
          target: arrayProxy,
          property: String(e),
          oldValue: array[s],
          newValue: array[e],
          debugId: currentObservabilityContext.debugId,
        });
      }
    }
    changes.push(...checkOwnKeys());
    reportChanges(changes);
    return array;
  }
);
interceptApply(
  Array.prototype.splice,
  function (target, arrayProxy: Array<any>, args) {
    ensureNotProxy(target);
    ensureProxy(arrayProxy);
    const array = unproxy(arrayProxy);
    const [start] = args;
    const oldLength = array.length;
    const checkOwnKeys = trackOwnKeys(array, arrayProxy);
    const removedItems = Reflect.apply(target, array, args);
    const changes: Change[] = [];
    let index = start;
    for (let r = 0; r < removedItems.length; r++, index++) {
      if (removedItems[index] !== array[index]) {
        if (!snapshotExclusions.has(array)) {
          updateSnapshots(arrayProxy, [String(index)], removedItems[index]);
        }
        changes.push({
          target: arrayProxy,
          property: String(index),
          oldValue: removedItems[index],
          newValue: array[index],
          debugId: currentObservabilityContext.debugId,
        });
      }
    }
    let oldIndex = index + (args.length - 2) - removedItems.length; // index + inserted - removed
    if (oldIndex !== index) {
      const maxLength = Math.max(oldLength, array.length);
      for (; index < maxLength; index++, oldIndex++) {
        if (array[oldIndex] !== array[index]) {
          if (!snapshotExclusions.has(array)) {
            updateSnapshots(arrayProxy, [String(index)], array[oldIndex]);
          }
          changes.push({
            target: arrayProxy,
            property: String(index),
            oldValue: array[oldIndex],
            newValue: array[index],
            debugId: currentObservabilityContext.debugId,
          });
        }
      }
    }
    if (!snapshotExclusions.has(array)) {
      updateSnapshots(arrayProxy, ["length"], oldLength);
    }
    if (oldLength !== array.length) {
      changes.push({
        target: arrayProxy,
        property: "length",
        oldValue: oldLength,
        newValue: array.length,
        debugId: currentObservabilityContext.debugId,
      });
    }
    changes.push(...checkOwnKeys());
    reportChanges(changes);
    return removedItems;
  }
);

// Maps
function trackMapKeys(
  map: Map<any, any>,
  mapProxy: Map<any, any>
): () => Change[] {
  const lastKeys = Array.from(map.keys());
  return () =>
    checkKeysUnbound(map, mapProxy, lastKeys, Array.from(map.keys()), $mapKeys);
}

interceptApply(
  Map.prototype.set,
  function (func, mapProxy: Map<any, any>, args) {
    ensureNotProxy(func);
    ensureProxy(mapProxy);
    const map = unproxy(mapProxy);
    const [key, newValue] = args;
    const oldValue = map.has(key) ? map.get(key) : notPresent;
    const oldSize = map.size;
    const checkMapKeys = trackMapKeys(map, mapProxy);

    Reflect.apply(func, map, args);

    if (!snapshotExclusions.has(map)) {
      updateSnapshots(mapProxy, [$mapValues, key], oldValue);
      if (oldSize !== map.size) {
        updateSnapshots(mapProxy, ["size"], oldSize);
      }
    }
    const changes: Change[] = [
      // TODO: FIX observability
      {
        target: mapProxy,
        property: $mapValues,
        oldValue,
        newValue,
        debugId: currentObservabilityContext.debugId,
      },
      ...checkMapKeys(),
    ];
    if (oldSize !== map.size) {
      changes.push({
        target: mapProxy,
        property: "size",
        oldValue: oldSize,
        newValue: map.size,
        debugId: currentObservabilityContext.debugId,
      });
    }
    reportChanges(changes);
    // interceptor.options.onSet?.(target, property, newValue);

    return mapProxy;
  }
);
interceptApply(
  Map.prototype.delete,
  function (func, mapProxy: Map<any, any>, args) {
    ensureNotProxy(func);
    ensureProxy(mapProxy);
    const map = unproxy(mapProxy);
    const oldValue = map.get(args[0]);
    const oldSize = map.size;
    const checkMapKeys = trackMapKeys(map, mapProxy);

    const deleted = Reflect.apply(func, map, args);

    if (deleted) {
      const [key] = args;
      if (!snapshotExclusions.has(map)) {
        updateSnapshots(mapProxy, ["size"], oldSize);
        updateSnapshots(mapProxy, [$mapValues, key], oldValue);
      }
      reportChanges([
        {
          target: mapProxy,
          property: "size",
          oldValue,
          newValue: oldSize - 1,
          debugId: currentObservabilityContext.debugId,
        },
        {
          target: mapProxy,
          property: $mapValues,
          oldValue,
          newValue: map.size,
          debugId: currentObservabilityContext.debugId,
        },
        ...checkMapKeys(),
      ]);
      // interceptor.options.onSet?.(target, property, newValue);
    }

    return deleted;
  }
);
interceptApply(
  Map.prototype.keys,
  function (func, mapProxy: Map<any, any>, args) {
    ensureNotProxy(func);
    ensureProxy(mapProxy);
    const map = unproxy(mapProxy);
    if (currentObservabilityContext.snapshot) {
      const mapKeys = Array.from(map.keys());
      const snapshotMapKeysLength = currentObservabilityContext.snapshot.get(
        mapProxy,
        [$mapKeys, "length"],
        () => mapKeys.length
      ) as number;
      const snapshotMapKeys = new Array(snapshotMapKeysLength);
      for (let i = 0; i < snapshotMapKeysLength; i++) {
        snapshotMapKeys[i] = currentObservabilityContext.snapshot.get(
          mapProxy,
          [$mapKeys, String(i)],
          () => mapKeys[i]
        );
      }
      return snapshotMapKeys;
    } else {
      return Reflect.apply(func, map, args);
    }
  }
);
interceptApply(
  Map.prototype.get,
  function (func, mapProxy: Map<any, any>, args) {
    ensureNotProxy(func);
    ensureProxy(mapProxy);
    const map = unproxy(mapProxy);
    if (currentObservabilityContext.snapshot) {
      const [key] = args;
      return currentObservabilityContext.snapshot.get(
        mapProxy,
        [$mapValues, key],
        () => map.get(key)
      ) as number;
    } else {
      return Reflect.apply(func, map, args);
    }
  }
);
interceptApply(
  Map.prototype.forEach,
  function (func, mapProxy: Map<any, any>, args) {
    ensureNotProxy(func);
    ensureProxy(mapProxy);
    const map = unproxy(mapProxy);
    if (currentObservabilityContext.snapshot) {
      const [callbackFn] = args;
      const mapKeys = mapProxy.keys();
      for (const mapKey of mapKeys) {
        const mapValue = mapProxy.get(mapKey);
        callbackFn(mapValue, mapKey, mapProxy);
      }
    } else {
      return Reflect.apply(func, map, args);
    }
  }
);
interceptApply(
  Map.prototype.entries,
  function (func, mapProxy: Map<any, any>, args) {
    ensureNotProxy(func);
    ensureProxy(mapProxy);
    const map = unproxy(mapProxy);
    if (currentObservabilityContext.snapshot) {
      const mapKeys = mapProxy.keys() as unknown as any[];
      // TODO: Rebuild as iterator
      const mapEntries = new Array(mapKeys.length);
      let i = 0;
      for (const mapKey of mapKeys) {
        const mapValue = mapProxy.get(mapKey);
        mapEntries[i++] = [mapKey, mapValue];
      }
      return mapEntries[Symbol.iterator]();
    } else {
      return Reflect.apply(func, map, args);
    }
  }
);
interceptGet(Map, "size", function (target, property, receiver) {
  ensureNotProxy(target);
  ensureProxy(receiver);
  if (currentObservabilityContext.snapshot) {
    return currentObservabilityContext.snapshot.get(receiver, ["size"], () =>
      Reflect.get(target, "size")
    );
  } else {
    return Reflect.get(target, "size");
  }
});
