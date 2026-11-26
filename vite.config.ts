import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
    plugins: [react(), tailwindcss()],
    server: { watch: { ignored: ["**/archivo-historico/**"] } },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    test: {
        exclude: [...configDefaults.exclude, "**/archivo-historico/**"],
        environment: "jsdom",
        setupFiles: "./src/test/setup.ts",
        globals: true,
    },
});
