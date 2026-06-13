import { defineConfig } from "wxt";
import { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";

// https://wxt.dev/api/config.html
export default defineConfig({
  // @wxt-dev/module-react adds @vitejs/plugin-react, JSX auto-imports, and the
  // jsx tsconfig settings. React Compiler is applied via the rolldown babel
  // bridge (Vite 8 / plugin-react v6).
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Fanguard",
    description: "Polymarket odds overlay for live event pages.",
    permissions: ["storage"],
    host_permissions: ["*://*.stubhub.com/*"],
  },
  vite: () => ({
    plugins: [babel({ presets: [reactCompilerPreset()] }), tailwindcss()],
  }),
});
