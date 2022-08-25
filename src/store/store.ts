import { globalSnapshotRef, Observed } from "../core/react";
import { BasicType, ExtractNulls, Falsy, IfEquals } from "./type-utils";
import { bindAllFunctions, numberfyProperty } from "./utils";
import {
  constant,
  field,
  isValue,
  isWritableValue,
  Value,
  WritableValue,
  _getContext,
  _read,
  _write,
} from "./value";

export type Store<T> = Value<T> & StoreChildren<T>;
export type WritableStore<T> = WritableValue<T> & StoreChildren<T>;

export type StoreChildren<T> = NonNullable<T> extends string
  ? {}
  : NonNullable<T> extends number
  ? {}
  : NonNullable<T> extends boolean
  ? {} // : NonNullable<T> extends ReadonlyArray<infer E> // ? { //     readonly [n: number]: Store<E | undefined>; //     readonly length: Store<number | ExtractNulls<T>>; //   }
  : {
      readonly [K in keyof NonNullable<T>]-?: IfEquals<
        { [K2 in K]: NonNullable<T>[K] },
        { -readonly [K2 in K]: NonNullable<T>[K] },
        WritableStore<NonNullable<T>[K] | ExtractNulls<T>>,
        Store<NonNullable<T>[K] | ExtractNulls<T>>
      >;
    };

const _proxyTarget = Symbol("proxyTarget");
function unproxyStore<T extends Object>(obj: T) {
  if (typeof obj === "object" && obj !== null) {
    return Reflect.get(obj, _proxyTarget) ?? obj;
  }
  return obj;
}

const storeProxyHandler: ProxyHandler<any> = {
  get(target: any, property: PropertyKey, receiver: any) {
    if (property === _proxyTarget) {
      return target;
    }
    // If target has the property, return it from target
    // This is used to return value implementation methods
    if (Reflect.has(target, property)) {
      return Reflect.get(target, property, receiver);
    }
    return storefy(field(target, numberfyProperty(property) as keyof Object));
  },
};

const stores = new WeakMap<any, any>();
export function storefy<T extends Object>(target: Value<T>): Store<T>;
export function storefy<T extends Object>(target: T): Store<T>;
export function storefy<T extends Object>(target: Value<T> | T): Store<T> {
  target = unproxyStore(target);
  if (!isValue(target)) {
    target = constant(target) as any;
  }
  if (stores.has(target)) {
    return stores.get(target);
  }
  const proxy = new Proxy(target, storeProxyHandler);
  stores.set(target, proxy);
  return proxy;
}

export class StoreIO {
  constructor(public readonly wrapper: Observed) {
    bindAllFunctions(this);
  }

  withValue<V, R>($values: [Value<V> | V], fn: (value: V) => R): R;
  withValue<V1, V2, R>(
    $values: [Value<V1> | V1, Value<V2> | V2],
    fn: (value1: V1, value2: V2) => R
  ): R;
  withValue<V1, V2, V3, R>(
    $values: [Value<V1> | V1, Value<V2> | V2, Value<V3> | V3],
    fn: (value1: V1, value2: V2, value3: V3) => R
  ): R;
  withValue<V1, V2, V3, V4, R>(
    $values: [Value<V1> | V1, Value<V2> | V2, Value<V3> | V3, Value<V4> | V4],
    fn: (value1: V1, value2: V2, value3: V3, value4: V4) => R
  ): R;
  withValue<V, R>($values: V[], fn: (...values: (Value<V> | V)[]) => R): R;
  withValue<V, R>($value: Value<V> | V, fn: (value: V) => R): R;
  withValue(
    $values: unknown[],
    fn: (...values: unknown[]) => unknown
  ): unknown {
    if (!Array.isArray($values)) {
      $values = [$values];
    }
    return this.wrapper(() => {
      const values: any = $values.map(($v) => (isValue($v) ? $v[_read]() : $v));
      return fn(...values);
    });
  }

  falsy<V>($value: Value<V>): $value is Value<V & Falsy> {
    return this.withValue([$value], (value) => !value);
  }
  truthy<V>($value: Value<V | Falsy>): $value is Value<V> {
    return this.withValue([$value], (value) => Boolean(value));
  }
  equal($valueA: Value<unknown>, $valueB: Value<unknown>): boolean {
    return this.withValue(
      [$valueA, $valueB],
      (valueA, valueB) => valueA == valueB
    );
  }
  same($valueA: Value<unknown>, $valueB: Value<unknown>): boolean {
    return this.withValue(
      [$valueA, $valueB],
      (valueA, valueB) => valueA === valueB
    );
  }

  read<V extends BasicType>(observable: Value<V>): V;
  read<V extends BasicType>($value: Value<V> | undefined): V | undefined;
  read<V extends BasicType>($value: Value<V> | undefined): V | undefined {
    if (!$value) return $value;
    return this.withValue([$value], (value) => value);
  }

  write<V>($value: WritableValue<V> | undefined, value: Value<V> | V): void {
    if (!$value) return;
    if (!isWritableValue($value)) throw new Error("Not writable");
    this.wrapper(() => {
      $value[_write](isValue(value) ? value[_read]() : value);
    });
  }

  map<V, R>($value: Value<V[]>, fn: (item: V, i: number) => R): R[] {
    if (!$value) return [];
    if (!isValue($value)) throw new Error("Not a value");
    return this.withValue([$value], (value) => value.map(fn));
  }

  filter<V>($value: Store<V[]>, fn: (item: V, i: number) => boolean): V[] {
    if (!$value) return [];
    if (!isValue($value)) throw new Error("Not a value");
    return this.withValue([$value], (value) => value.filter(fn));
  }

  foreach<V>($value: Store<V[]>, fn: (item: V) => void): void {
    if (!$value) return;
    if (!isValue($value)) throw new Error("Not a value");
    return this.withValue([$value], (value) => value.forEach(fn));
  }

  update<V>($value: Value<V[]>, $items: Value<V[]> | V[]): void {
    if (!$value) return;
    if (!isValue($value)) throw new Error("Not a value");
    this.withValue([$value, $items], (value, items) => {
      const length = items.length;
      for (let i = 0; i < length; i++) {
        value[i] = items[i];
      }
      // TODO: Writes to array length affect keys, we need to intercept that
      value.length = length;
    });
  }

  remove<V>($value: Value<V[]>, $item: Value<V> | V): boolean {
    if (!isValue($value)) throw new Error("Not a value");
    return this.withValue([$value, $item], (value, item) => {
      const index = value.indexOf(item);
      if (index === -1) return false;
      value.splice(index, 1);
      return true;
    });
  }

  callable<T extends Function>(holder: Value<T>): T;
  callable<T extends Function>(holder: Value<T> | undefined): T | undefined;
  callable<T extends Function>(holder: Value<T> | undefined): T | undefined {
    if (!holder) return;
    if (!isValue(holder)) throw new Error("Not a value");

    const value = holder[_read]();
    const context = holder[_getContext]();

    return ((...args: any[]) => {
      return this.wrapper(() => value.apply(context, args));
    }) as unknown as T | undefined;
  }
}

export const globalSnapshotStore = storefy(globalSnapshotRef).current;
