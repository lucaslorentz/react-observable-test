import { TreeMap } from "./tree-map";

test("get", () => {
  const treeMap = new TreeMap(
    new Map([
      ["1", new Map([["1.1", "Test"]])],
      [
        "2",
        new Map([
          ["2.1", "Test"],
          ["2.2", "Test"],
        ]),
      ],
    ])
  );
  expect(treeMap.get([])).toBe(treeMap.innerMap);
  expect(treeMap.get(["1"])).toBeInstanceOf(Map);
  expect(treeMap.get(["1", "1.1"])).toBe("Test");
  expect(treeMap.get(["2"])).toBeInstanceOf(Map);
  expect(treeMap.get(["2", "2.1"])).toBe("Test");
  expect(treeMap.get(["2", "2.2"])).toBe("Test");
});

test("keys", () => {
  const treeMap = new TreeMap(
    new Map([
      ["1", new Map([["1.1", "Test"]])],
      [
        "2",
        new Map([
          ["2.1", "Test"],
          ["2.2", "Test"],
        ]),
      ],
    ])
  );
  expect(Array.from(treeMap.keys([]))).toEqual(["1", "2"]);
  expect(Array.from(treeMap.keys(["1"]))).toEqual(["1.1"]);
  expect(Array.from(treeMap.keys(["2"]))).toEqual(["2.1", "2.2"]);
});

test("has", () => {
  const treeMap = new TreeMap(
    new Map([
      ["1", new Map([["1.1", "Test"]])],
      [
        "2",
        new Map([
          ["2.1", "Test"],
          ["2.2", "Test"],
        ]),
      ],
    ])
  );
  expect(treeMap.has([])).toBe(true);
  expect(treeMap.has(["1"])).toBe(true);
  expect(treeMap.has(["1", "1.1"])).toBe(true);
  expect(treeMap.has(["2", "2.1"])).toBe(true);
  expect(treeMap.has(["2", "2.2"])).toBe(true);
  expect(treeMap.has(["1", "1.2"])).toBe(false);
  expect(treeMap.has(["3", "1.2"])).toBe(false);
});

test("set", () => {
  const treeMap = new TreeMap();
  treeMap.set(["1", "1.1"], "Test");
  treeMap.set(["2", "2.1"], "Test");
  treeMap.set(["2", "2.2"], "Test");
  expect(treeMap.innerMap).toEqual(
    new Map([
      ["1", new Map([["1.1", "Test"]])],
      [
        "2",
        new Map([
          ["2.1", "Test"],
          ["2.2", "Test"],
        ]),
      ],
    ])
  );
});

test("delete", () => {
  const treeMap = new TreeMap(
    new Map([
      ["1", new Map([["1.1", "Test"]])],
      [
        "2",
        new Map([
          ["2.1", "Test"],
          ["2.2", "Test"],
        ]),
      ],
    ])
  );
  treeMap.delete(["1", "1.1"]);
  treeMap.delete(["2", "2.2"]);
  expect(treeMap.innerMap).toEqual(
    new Map([["2", new Map([["2.1", "Test"]])]])
  );
  treeMap.delete(["1", "1.1"]);
  treeMap.delete(["2", "2.1"]);
  expect(treeMap.innerMap).toEqual(new Map());
});

test("clear", () => {
  const treeMap = new TreeMap(
    new Map([
      ["1", new Map([["1.1", "Test"]])],
      [
        "2",
        new Map([
          ["2.1", "Test"],
          ["2.2", "Test"],
        ]),
      ],
    ])
  );
  treeMap.clear(["2"]);
  expect(treeMap.innerMap).toEqual(
    new Map([["1", new Map([["1.1", "Test"]])]])
  );
  treeMap.clear(["1"]);
  expect(treeMap.innerMap).toEqual(new Map());
});
