import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "./app/theme";
import { App } from "./app/App";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root element missing from index.html");

createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
