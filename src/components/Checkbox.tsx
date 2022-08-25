import { memo } from "react";
import { useStoreIO, WritableValue } from "../store";
import { RenderCount } from "./RenderCount";

export const Checkbox = memo(
  ({ $value }: { $value: WritableValue<boolean | undefined> }) => {
    const { read, write } = useStoreIO({ debugId: "Checkbox" });
    return (
      <>
        <RenderCount />
        <input
          type="checkbox"
          checked={read($value) ?? false}
          onChange={(e) => write($value, e.currentTarget.checked)}
        />
      </>
    );
  }
);
Checkbox.displayName = "Checkbox";
