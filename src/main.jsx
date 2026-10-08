import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import TagManager from "react-gtm-module";

const tagManagerArgs = {
  gtmId: "GTM-KZ4FQ7B9",
};
TagManager.initialize(tagManagerArgs);

// GitHub Pages base path
const BASE_PATH = process.env.GITHUB_PAGES ? '/website-test' : '';
const currentPath = window.location.pathname;
const expectedPath = BASE_PATH + '/';
const lowercasePath = currentPath.toLowerCase();
const expectedLowercase = expectedPath.toLowerCase();

if (currentPath !== expectedPath && currentPath !== '/') {
  window.location.replace(
    window.location.origin +
      expectedPath +
      window.location.search +
      window.location.hash,
  );
} else {
  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
