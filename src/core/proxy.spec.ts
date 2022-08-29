import { $mapKeys, $mapValues, $ownKeys } from "./observability";
import { proxy, withObservabilityContext } from "./proxy";
import { notPresent, createSnapshot } from "./snapshot";

test("snapshot arrays", () => {
  const array: any[] = proxy([1]);

  const snapshot1 = createSnapshot();
  array.push(2);
  const snapshot2 = createSnapshot();
  array.splice(0, 2);

  // Current
  expect(Object.keys(array)).toEqual([]);
  expect(array).toEqual([]);
  expect(0 in array).toBe(false);
  expect("length" in array).toBe(true);
  expect("slice" in array).toBe(true);
  expect(Object.getOwnPropertyDescriptor(array, 0)).toBe(undefined);
  expect(Object.getOwnPropertyDescriptor(array, "length")).toEqual({
    configurable: false,
    enumerable: false,
    value: 0,
    writable: true
  });
  expect(Object.getOwnPropertyDescriptor(array, "slice")).toMatchObject({
    configurable: true,
    enumerable: true,
    writable: true
  });

  // Snapshot 2
  expect(snapshot2.get(array, [])).toEqual(
    new Map<any, any>([
      ["0", 1],
      ["1", 2],
      ["length", 2],
      [
        $ownKeys,
        new Map<any, any>([
          ["0", "0"],
          ["1", "1"],
          ["2", "length"],
          ["length", 3]
        ])
      ]
    ])
  );
  withObservabilityContext({ snapshot: snapshot2 }, () => {
    expect(Object.keys(array)).toEqual(["0", "1"]);
    expect(array).toEqual([1, 2]);
    expect(0 in array).toBe(true);
    expect("length" in array).toBe(true);
    expect("slice" in array).toBe(true);
    expect(Object.getOwnPropertyDescriptor(array, 0)).toEqual({
      configurable: true,
      enumerable: true,
      value: 1,
      writable: true
    });
    expect(Object.getOwnPropertyDescriptor(array, "length")).toEqual({
      configurable: false,
      enumerable: false,
      value: 2,
      writable: true
    });
    expect(Object.getOwnPropertyDescriptor(array, "slice")).toMatchObject({
      configurable: true,
      enumerable: true,
      writable: true
    });
  });

  // Snashot 1
  expect(snapshot1.get(array, [])).toEqual(
    new Map<any, any>([
      ["1", undefined],
      ["length", 1],
      [
        $ownKeys,
        new Map<any, any>([
          ["1", "length"],
          ["2", undefined],
          ["length", 2]
        ])
      ]
    ])
  );
  withObservabilityContext({ snapshot: snapshot1 }, () => {
    expect(Object.keys(array)).toEqual(["0"]);
    expect(array).toEqual([1]);
  });
});

test("snapshot arrays extra keys", () => {
  const array: any[] = proxy([1]);
  (array as any).foo = "foo-value";
  const snapshot1 = createSnapshot();
  delete (array as any).foo;
  (array as any).bar = "bar-value";
  const snapshot2 = createSnapshot();
  delete (array as any).bar;

  // Current
  expect(array).toEqual([1]);
  expect(Object.keys(array)).toEqual(["0"]);
  expect("bar" in array).toBe(false);
  expect(Object.getOwnPropertyDescriptor(array, "bar")).toBe(undefined);

  // Snapshot 2
  withObservabilityContext({ snapshot: snapshot2 }, () => {
    expect(Object.keys(array)).toEqual(["0", "bar"]);
    expect((array as any).foo).toBeUndefined();
    expect((array as any).bar).toBe("bar-value");
    expect("bar" in array).toBe(true);
    expect(Object.getOwnPropertyDescriptor(array, "bar")).toEqual({
      configurable: true,
      enumerable: true,
      value: "bar-value",
      writable: true
    });
  });

  // Snashot 1
  withObservabilityContext({ snapshot: snapshot1 }, () => {
    expect(Object.keys(array)).toEqual(["0", "foo"]);
    expect((array as any).foo).toBe("foo-value");
    expect((array as any).bar).toBeUndefined();
  });
});

test("snapshot objects", () => {
  const obj: any = proxy({ foo: 1 });

  const snapshot1 = createSnapshot();
  obj.foo = 2;
  obj.bar = 1;
  const snapshot2 = createSnapshot();
  obj.bar = 2;
  delete obj.foo;

  // Current
  expect(obj).toEqual({
    bar: 2
  });
  expect(Object.keys(obj)).toEqual(["bar"]);

  // Snapshot 2
  expect(snapshot2.get(obj, [])).toEqual(
    new Map<any, any>([
      ["foo", 2],
      ["bar", 1],
      [
        $ownKeys,
        new Map<any, any>([
          ["0", "foo"],
          ["1", "bar"],
          ["length", 2]
        ])
      ]
    ])
  );
  withObservabilityContext({ snapshot: snapshot2 }, () => {
    expect(obj).toEqual({ foo: 2, bar: 1 });
    expect(Object.keys(obj)).toEqual(["foo", "bar"]);
  });

  // Snashot 1
  expect(snapshot1.get(obj, [])).toEqual(
    new Map<any, any>([
      ["foo", 1],
      ["bar", notPresent],
      [
        $ownKeys,
        new Map<any, any>([
          ["1", undefined],
          ["length", 1]
        ])
      ]
    ])
  );
  withObservabilityContext({ snapshot: snapshot1 }, () => {
    expect(obj).toEqual({ foo: 1 });
    expect(Object.keys(obj)).toEqual(["foo"]);
  });
});

test("snapshot classes", () => {
  class Base {
    zoo: any;
  }
  class Test extends Base {
    foo: any;
    bar: any;
  }

  const obj = proxy(new Test());

  const snapshot1 = createSnapshot();
  obj.foo = 1;
  obj.zoo = 1;

  const snapshot2 = createSnapshot();
  obj.bar = 1;
  obj.zoo = 2;

  // Current
  expect(obj.foo).toBe(1);
  expect(obj.bar).toBe(1);
  expect(obj.zoo).toBe(2);

  // Snapshot 2
  // expect(snapshot2.get(obj, [])).toEqual(
  //   new Map<any, any>([
  //     ["bar", undefined],
  //     ["zoo", 1],
  //   ])
  // );
  withObservabilityContext({ snapshot: snapshot2 }, () => {
    expect(obj.foo).toBe(1);
    expect(obj.bar).toBe(undefined);
    expect(obj.zoo).toBe(1);
  });

  // Snapshot 1
  // expect(snapshot1.get(obj, [])).toEqual(
  //   new Map<any, any>([
  //     ["foo", undefined],
  //     ["zoo", undefined]
  //   ])
  // );
  withObservabilityContext({ snapshot: snapshot1 }, () => {
    expect(obj.foo).toBe(undefined);
    expect(obj.bar).toBe(undefined);
    expect(obj.zoo).toBe(undefined);
  });
});

test("snapshot maps", () => {
  const map = proxy(
    new Map<any, any>([["foo", 1]])
  );

  const snapshot1 = createSnapshot();
  map.set("foo", 2);
  map.set("bar", 1);
  const snapshot2 = createSnapshot();
  map.set("bar", 2);
  map.delete("foo");

  // Current
  expect(Array.from(map.keys())).toEqual(["bar"]);
  expect(map).toEqual(new Map([["bar", 2]]));

  // Snapshot 2
  expect(snapshot2.get(map, [])).toEqual(
    new Map<any, any>([
      [
        $mapValues,
        new Map<any, any>([
          ["bar", 1],
          ["foo", 2]
        ])
      ],
      ["size", 2],
      [
        $mapKeys,
        new Map<any, any>([
          ["0", "foo"],
          ["1", "bar"],
          ["length", 2]
        ])
      ]
    ])
  );
  withObservabilityContext({ snapshot: snapshot2 }, () => {
    expect(Array.from(map.keys())).toEqual(["foo", "bar"]);
    expect(map).toEqual(
      new Map([
        ["foo", 2],
        ["bar", 1]
      ])
    );
  });

  // Snashot 1
  expect(snapshot1.get(map, [])).toEqual(
    new Map<any, any>([
      [
        $mapValues,
        new Map<any, any>([
          ["foo", 1],
          ["bar", notPresent]
        ])
      ],
      ["size", 1],
      [
        $mapKeys,
        new Map<any, any>([
          ["1", undefined],
          ["length", 1]
        ])
      ]
    ])
  );
  withObservabilityContext({ snapshot: snapshot1 }, () => {
    expect(Array.from(map.keys())).toEqual(["foo"]);
    expect(map).toEqual(new Map([["foo", 1]]));
  });
});
