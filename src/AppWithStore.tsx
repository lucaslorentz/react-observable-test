import { memo, useCallback } from "react";
import { Checkbox } from "./components/Checkbox";
import { RenderCount } from "./components/RenderCount";
import { TextInput } from "./components/TextInput";
import { Debugger } from "./debugger";
import { Store, storefy, useStoreIO } from "./store";
import "./styles.css";
import { TODOItemState, TODOState } from "./todo-state";

const store = storefy(new TODOState());

export const TODOAppStore = memo(() => {
  const { withValue, callable } = useStoreIO({ debugId: "Root" });
  return (
    <div className="App">
      <h1>
        TODO LIST <RenderCount />
      </h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          callable(store.addItem)();
        }}
      >
        <TextInput $value={store.text} />
        <button>Add</button>
      </form>
      <TODOItems />
      {withValue(store, (s) => (
        <Debugger value={s} />
      ))}
    </div>
  );
});
TODOAppStore.displayName = "App";

const TODOItems = memo(() => {
  const { map } = useStoreIO({ debugId: "TODOItems" });
  return (
    <>
      <h2>
        List <RenderCount />
      </h2>
      <h3>Pending:</h3>
      {map(store.pendingItems, (item) => (
        <TODOItem key={item.id} item={storefy(item)} />
      ))}
      <h3>Done:</h3>
      {map(store.doneItems, (item) => (
        <TODOItem key={item.id} item={storefy(item)} />
      ))}
    </>
  );
});
TODOItems.displayName = "TODOItems";

const TODOItem = memo(({ item }: { item: Store<TODOItemState> }) => {
  const { read, remove } = useStoreIO({ debugId: "TODOItem" });
  const handleRemove = useCallback(() => {
    remove(store.items, item);
  }, [remove, read, item]);
  return (
    <div>
      <RenderCount />
      <Checkbox $value={item.done} />
      <TextInput $value={item.text} />
      <button onClick={handleRemove}>X</button>
    </div>
  );
});
TODOItem.displayName = "TODOItem";
