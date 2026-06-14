import { defineConfig } from "wxt";
import { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";

// The build-time API base (set by scripts/install.mjs as WXT_PUBLIC_API_URL).
// When set, the background worker proxies fixture resolution through this origin
// instead of calling Polymarket's Gamma API directly — the prod endpoint lives
// in Dublin so it dodges Polymarket's US geofence. We need a matching host
// permission for whatever origin the bundle was built against.
const apiUrl = process.env.WXT_PUBLIC_API_URL;
const apiHostPermission = apiUrl ? `${new URL(apiUrl).origin}/*` : undefined;

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
    // stubhub: read the event page. gamma: the background worker resolves the
    // blowout combo against Polymarket from here when no API base is configured
    // (bypasses page CORS). apiHostPermission: the Fanguard API origin (prod or
    // local) the bundle was built against, when WXT_PUBLIC_API_URL is set.
    host_permissions: [
      "*://*.stubhub.com/*",
      "*://gamma-api.polymarket.com/*",
      ...(apiHostPermission ? [apiHostPermission] : []),
    ],
  },
  vite: () => ({
    plugins: [babel({ presets: [reactCompilerPreset()] }), tailwindcss()],
  }),
});
