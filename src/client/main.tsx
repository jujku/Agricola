import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles/index.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element #root not found.");
}

try {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
} catch (error) {
  root.innerHTML = `<main class="app-shell"><section class="notice">前端启动失败：${
    error instanceof Error ? error.message : "未知错误"
  }</section></main>`;
}
