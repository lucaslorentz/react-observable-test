import { useCallback } from "react";
import { Checkbox } from "./components/Checkbox";
import { RenderCount } from "./components/RenderCount";
import { TextInput } from "./components/TextInput";
import { observer } from "./core";
import { Debugger } from "./debugger";
import { field } from "./store";
import "./styles.css";
import { TODOItemState, TODOState } from "./todo-state";

const store = new TODOState();

export const TODOAppObserver = observer({ debugId: "TODOApp" }, () => {
  return (
    <div className="App">
      <h1>
        TODO LIST <RenderCount />
      </h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          store.addItem();
        }}
      >
        <TextInput $value={field(store, "text")} />
        <button>Add</button>
      </form>
      <TODOItems />
      <Debugger value={store} />
    </div>
  );
});
TODOAppObserver.displayName = "App";

const TODOItems = observer({ debugId: "TODOItems" }, () => {
  return (
    <>
      <h2>
        List <RenderCount />
      </h2>
      <h3>Pending:</h3>
      {store.pendingItems.map((item) => (
        <TODOItem key={item.id} item={item} />
      ))}
      <h3>Done:</h3>
      {store.doneItems.map((item) => (
        <TODOItem key={item.id} item={item} />
      ))}
    </>
  );
});
TODOItems.displayName = "TODOItems";

const TODOItem = observer(
  { debugId: "TODOItem" },
  ({ item }: { item: TODOItemState }) => {
    const handleRemove = useCallback(() => {
      let index = store.items.indexOf(item);
      if (index !== -1) {
        store.items.splice(index, 1);
      }
    }, []);
    return (
      <div>
        <RenderCount />
        <Checkbox $value={field(item, "done")} />
        <TextInput $value={field(item, "text")} />
        <button onClick={handleRemove}>X</button>
      </div>
    );
  }
);
TODOItem.displayName = "TODOItem";
