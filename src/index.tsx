import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TODOAppObserver } from "./AppWithObserver";

const rootElement = document.getElementById("root")!;
const root = createRoot(rootElement);
root.render(
  <StrictMode>
    <TODOAppObserver />
  </StrictMode>
);
