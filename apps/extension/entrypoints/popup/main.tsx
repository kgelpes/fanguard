import { createRoot } from "react-dom/client";

import { App } from "./App";
import "~/assets/tailwind.css";

createRoot(document.getElementById("app")!).render(<App />);
