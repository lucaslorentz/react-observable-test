export const _read = Symbol("read");
export const _write = Symbol("write");
export const _getContext = Symbol("getContext");

export interface Value<V> {
  [_read](): V;
  [_getContext](): any;
}

export interface WritableValue<V> extends Value<V> {
  [_write](value: V): void;
}

export function isValue<V>(value: Value<V> | V): value is Value<V> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return _read in value;
}

export function isWritableValue<V>(
  value: Value<V> | V
): value is WritableValue<V> {
  return isValue(value) && _write in value;
}

// Constant
const _value = Symbol("value");
class ConstValue<V> implements Value<V> {
  private [_value]: V;
  constructor(value: V) {
    this[_value] = value;
  }
  [_read](): V {
    return this[_value];
  }
  [_getContext]() {
    return;
  }
}

const refConstants = new WeakMap<any, any>();
const valConstants = new Map<any, any>();
export function constant<T>(value: T): ConstValue<T> {
  const map =
    typeof value === "object" && value !== null ? refConstants : valConstants;
  if (map.has(value)) {
    return map.get(value);
  }
  const c = new ConstValue(value);
  map.set(value, c);
  return c;
}

// Field
const _object = Symbol("object");
const _field = Symbol("field");
class FieldValue<T extends Object, F extends keyof T>
  implements WritableValue<T[F]>
{
  [_object]: Value<T> | T;
  [_field]: F;
  constructor(object: Value<T> | T, field: F) {
    this[_object] = object;
    this[_field] = field;
  }
  [_getContext]() {
    const object = this[_object];
    return isValue(object) ? object[_read]() : object;
  }
  [_read]() {
    const context = this[_getContext]();
    if (!context) return undefined as unknown as T[F];
    return context[this[_field]];
  }
  [_write](value: T[F]): void {
    let context = this[_getContext]();
    if (!context) {
      context = (typeof this[_field] === "number" ? [] : {}) as T;
      const object = this[_object];
      if (!isWritableValue(object)) {
        throw new Error("Field object is not writable");
      }
      object[_write](context);
    }
    context[this[_field]] = value;
  }
}

const fieldsCache = new WeakMap<object, Map<PropertyKey, any>>();
export function field<T extends Object, F extends keyof T>(
  target: Value<T> | T,
  field: F
): WritableValue<T[F]> {
  let targetFieldsCache = fieldsCache.get(target);
  if (!targetFieldsCache) {
    targetFieldsCache = new Map();
    fieldsCache.set(target, targetFieldsCache);
  }
  let cachedField = targetFieldsCache.get(field);
  if (!cachedField) {
    cachedField = new FieldValue(target, field);
    targetFieldsCache.set(field, cachedField);
  }
  return cachedField;
}
