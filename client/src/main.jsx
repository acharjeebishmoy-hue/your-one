import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { AuthProvider } from "./auth.jsx";
import { LOW_END, REDUCED_MOTION } from "./perf.js";
import "./styles.css";

// Apply low-end class to <html> so CSS can disable heavy effects
if (LOW_END) document.documentElement.classList.add("low-end");
if (REDUCED_MOTION) document.documentElement.classList.add("reduced-motion");

// Installable app: register the service worker (PWA)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
