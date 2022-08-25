import { memo } from "react";
import { useStoreIO, WritableValue } from "../store";
import { RenderCount } from "./RenderCount";

export const TextInput = memo(
  ({ $value }: { $value: WritableValue<string | undefined> }) => {
    const { read, write } = useStoreIO({ debugId: "TextInput" });
    return (
      <>
        <RenderCount />
        <input
          value={read($value) ?? ""}
          onChange={(e) => {
            write($value, e.currentTarget.value);
          }}
        />
      </>
    );
  }
);
TextInput.displayName = "TextInput";
