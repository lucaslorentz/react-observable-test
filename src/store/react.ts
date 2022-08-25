import { useMemo } from "react";
import { ObserveOptions, useObserved } from "../core/react";
import { StoreIO } from "./store";

export function useStoreIO(options?: ObserveOptions): StoreIO {
  const observed = useObserved(options);

  return useMemo<StoreIO>(() => new StoreIO(observed), [observed]);
}
