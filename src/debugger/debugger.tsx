import { memo, useEffect, useLayoutEffect, useReducer, useState } from "react";
import {
  getObservedProperties,
  getObservers,
  monitorObservers,
} from "../core/observability";
import { excludeFromSnapshots, isProxy, proxy } from "../core/proxy";
import { globalSnapshotRef, observer } from "../core/react";
import { createSnapshot, monitorNewSnapshot, Snapshot } from "../core/snapshot";

const DebuggerId = "Debugger";

function isDebugger(id?: string) {
  return id === DebuggerId;
}

function useObserversMonitor(value: any) {
  const [, forceRender] = useReducer((x) => x + 1, 0);

  useEffect(() => {
    if (!isProxy(value)) return;
    return monitorObservers(value, function (_, change) {
      if (!isDebugger(change.observer.debugId)) {
        forceRender();
      }
    });
  }, [value]);
}

const DebuggerObservers = memo(
  ({ target, property }: { target: any; property: PropertyKey }) => {
    useObserversMonitor(target);

    const observers = getObservers(target, [property]);

    return (
      <>
        {observers
          .filter((o) => !isDebugger(o.debugId))
          .map((o, i) => (
            <div
              key={i}
              style={{
                display: "inline-block",
                border: "1px solid #ccc",
                padding: "0px 4px",
                lineHeight: 1.4,
                borderRadius: 8,
                marginLeft: 8,
              }}
            >
              &#128064; {o.debugId}
            </div>
          ))}
      </>
    );
  }
);
DebuggerObservers.displayName = "DebuggerObservers";

const DebuggerObject = observer(
  { debugId: DebuggerId },
  ({ value, suffix }: { value: any; suffix?: any }) => {
    useObserversMonitor(value);

    let keys: PropertyKey[];
    if (Array.isArray(value)) {
      keys = new Array(value.length);
      for (let i = 0; i < value.length; i++) {
        keys[i] = String(i);
      }
    } else {
      keys = Object.keys(value);
    }

    const observedKeys = getObservedProperties(value, []).filter(
      (p) =>
        getObservers(value, [p]).filter((o) => !isDebugger(o.debugId)).length >
        0
    );

    keys = Array.from(new Set([...keys, ...observedKeys]));

    return (
      <>
        {value.constructor.name} {Array.isArray(value) ? "[" : "{"}
        {suffix}
        <div style={{ marginLeft: 20 }}>
          {keys.map((key) => (
            <div key={String(key)}>
              {String(key)}:{" "}
              <DebuggerItem
                value={value[key]}
                suffix={<DebuggerObservers target={value} property={key} />}
              />
            </div>
          ))}
        </div>
        {Array.isArray(value) ? "]" : "}"}
      </>
    );
  }
);
DebuggerObject.displayName = "DebuggerObject";

const DebuggerValue = observer(
  { debugId: DebuggerId },
  ({ value, suffix }: { value: any; suffix?: any }) => {
    let valueRepresentation;
    switch (typeof value) {
      case "function":
        valueRepresentation = <span style={{ color: "blue" }}>Function</span>;
        break;
      case "string":
        valueRepresentation = (
          <span style={{ color: "red" }}>
            "{value.substring(0, 100).replace(/\n/g, "\\n")}
            {value.length > 100 ? "..." : ""}"
          </span>
        );
        break;
      default:
        valueRepresentation = (
          <span style={{ color: "blue" }}>{String(value)}</span>
        );
        break;
    }
    return (
      <>
        {valueRepresentation}
        {suffix}
      </>
    );
  }
);
DebuggerValue.displayName = "DebuggerValue";

const DebuggerItem = observer(
  { debugId: DebuggerId },
  ({ value, suffix }: { value: any; suffix?: any }) => {
    useObserversMonitor(value);

    if (typeof value === "object" && value !== null) {
      return <DebuggerObject value={value} suffix={suffix} />;
    } else {
      return <DebuggerValue value={value} suffix={suffix} />;
    }
  }
);
DebuggerItem.displayName = "DebuggerItem";

const SnapshotValue = memo(
  (props: {
    snapshot: Snapshot;
    object: Object;
    compareSnapshot?: Snapshot;
    keys: any[];
  }) => {
    const { snapshot, object, compareSnapshot, keys } = props;
    const value = snapshot.get(object, keys, compareSnapshot);
    if (!(value instanceof Map)) {
      return <DebuggerValue value={value} />;
    }
    return (
      <>
        {"{"}
        <div style={{ marginLeft: 20 }}>
          {Array.from(snapshot.keys(object, keys, compareSnapshot)).map(
            (key, i) => (
              <div key={i}>
                {(typeof key === "object" && key && key.constructor.name) ||
                  String(key)}
                :{" "}
                <SnapshotValue
                  snapshot={snapshot}
                  object={object}
                  compareSnapshot={compareSnapshot}
                  keys={[...keys, key]}
                />
              </div>
            )
          )}
        </div>
        {"}"}
      </>
    );
  }
);

const SnapshotObjects = memo(
  (props: { snapshot: Snapshot; compareSnapshot?: Snapshot; keys: any[] }) => {
    const { snapshot, compareSnapshot, keys } = props;
    const objects = snapshot.getObjects(compareSnapshot);
    return (
      <>
        {"{"}
        <div style={{ marginLeft: 20 }}>
          {Array.from(objects).map((object, i) => (
            <div key={i}>
              {(typeof object === "object" &&
                object &&
                object.constructor.name) ||
                String(object)}
              :{" "}
              <SnapshotValue
                snapshot={snapshot}
                compareSnapshot={compareSnapshot}
                object={object}
                keys={[]}
              />
            </div>
          ))}
        </div>
        {"}"}
      </>
    );
  }
);

export const Debugger = observer(
  { debugId: DebuggerId, followGlobalSnapshot: false },
  ({
    value,
    monitorSnapshotsDefault,
  }: {
    value: any;
    monitorSnapshotsDefault?: boolean;
  }) => {
    const debuggerState = useState<{
      monitorSnapshots: boolean;
      monitorState: boolean;
      snapshots: Snapshot[];
    }>(() => {
      return proxy(
        excludeFromSnapshots({
          monitorSnapshots: monitorSnapshotsDefault ?? false,
          monitorState: false,
          snapshots: proxy(
            excludeFromSnapshots(
              monitorSnapshotsDefault ? [createSnapshot()] : []
            )
          ),
        })
      );
    })[0];

    useLayoutEffect(() => {
      if (!debuggerState.monitorSnapshots) return;
      debuggerState.snapshots.unshift(createSnapshot());
      const dispose = monitorNewSnapshot((s) =>
        debuggerState.snapshots.unshift(s)
      );
      return () => {
        dispose();
        debuggerState.snapshots.splice(0, debuggerState.snapshots.length);
        globalSnapshotRef.current = undefined;
      };
    }, [debuggerState.monitorSnapshots]);

    return (
      <pre
        style={{
          textAlign: "left",
          lineHeight: 1.8,
          border: "1px solid #ccc",
          padding: 8,
          borderRadius: 8,
          whiteSpace: "break-spaces",
        }}
      >
        <h1 style={{ margin: 0 }}>Debugger</h1>
        <div>
          <label>
            <input
              type="checkbox"
              checked={debuggerState.monitorSnapshots}
              onChange={(e) =>
                (debuggerState.monitorSnapshots = e.currentTarget.checked)
              }
            />{" "}
            Monitor snapshots
          </label>
        </div>
        {debuggerState.monitorSnapshots ? (
          <div>
            Snapshots:{" "}
            <button
              disabled={!globalSnapshotRef.current}
              onClick={() => (globalSnapshotRef.current = undefined)}
            >
              Current
            </button>
            {debuggerState.snapshots.map((snapshot) => {
              return (
                <button
                  key={snapshot.id}
                  disabled={globalSnapshotRef.current === snapshot}
                  onClick={() => (globalSnapshotRef.current = snapshot)}
                >
                  {snapshot.id}
                </button>
              );
            })}
          </div>
        ) : null}
        {globalSnapshotRef.current ? (
          <div>
            Snapshot:{" "}
            <SnapshotObjects
              snapshot={globalSnapshotRef.current}
              compareSnapshot={globalSnapshotRef.current?.nextSnapshot}
              keys={[]}
            />
          </div>
        ) : null}
        <div>
          <label>
            <input
              type="checkbox"
              checked={debuggerState.monitorState}
              onChange={(e) =>
                (debuggerState.monitorState = e.currentTarget.checked)
              }
            />{" "}
            Show state
          </label>
        </div>
        {debuggerState.monitorState ? (
          <>
            State: <DebuggerItem value={value} />
          </>
        ) : null}
      </pre>
    );
  }
);
Debugger.displayName = "Debugger";
