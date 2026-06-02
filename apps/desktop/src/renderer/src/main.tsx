import React from "react";
import { createRoot } from "react-dom/client";
import { AppProviders } from "./providers/AppProviders";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppProviders />
  </React.StrictMode>,
);
