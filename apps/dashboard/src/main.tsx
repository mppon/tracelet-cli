/** 本文件负责把 React Dashboard 挂载到浏览器页面。 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { I18nProvider } from "./i18n";
import "./style.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("缺少 Dashboard 根节点");
}

createRoot(root).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
);
