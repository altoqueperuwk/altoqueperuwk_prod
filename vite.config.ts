import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
    plugins: [react(), tailwindcss()],
    server: { watch: { ignored: ["**/archivo-historico/**"] } },
    resolve: {
        // RouterProvider y useLink deben compartir el mismo RouterContext.
        dedupe: ["react-aria", "@react-aria/utils"],
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    test: {
        exclude: [...configDefaults.exclude, "**/archivo-historico/**"],
        // Aplicar la misma deduplicación a las dependencias de React Aria en pruebas.
        server: { deps: { inline: ["react-aria-components", "react-aria", /^@react-aria\//] } },
        environment: "jsdom",
        setupFiles: "./src/test/setup.ts",
        globals: true,
    },
});
