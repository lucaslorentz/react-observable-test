import { useLayoutEffect, useRef } from "react";

export function RenderCount() {
  const ref = useRef(1);
  const renderCount = ref.current;
  useLayoutEffect(() => {
    ref.current = renderCount + 1;
  }, [renderCount]);
  return (
    <div
      style={{
        display: "inline-block",
        backgroundColor: "#ccc",
        borderRadius: 4,
        padding: "2px 4px",
        margin: "0 4px",
      }}
    >
      {renderCount}
    </div>
  );
}
