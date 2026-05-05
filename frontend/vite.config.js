import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Minimal CJS-to-ESM shim for .cjs files imported by the frontend.
 *  Wraps the file in an IIFE that provides `module` / `exports` globals,
 *  then re-exports the resulting object as the ES default export.
 *  This lets the backend keep using require() on the same file unchanged.
 */
const cjsShimPlugin = {
  name: "cjs-shim",
  transform(code, id) {
    if (!id.endsWith(".cjs")) return null;
    return {
      code: [
        "const __cjs_mod__ = { exports: {} };",
        "(function (module, exports) {",
        code,
        "})(__cjs_mod__, __cjs_mod__.exports);",
        "export default __cjs_mod__.exports;"
      ].join("\n"),
      map: null
    };
  }
};

export default defineConfig({
  plugins: [react(), cjsShimPlugin],
  server: {
    port: 5173
  }
});

