import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import packageJson from "../../package.json";

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  base: "/",
  plugins: [
    tanstackRouter({ autoCodeSplitting: true }),
    tailwindcss(),
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
  ],
  server: {
    host: true,
    hmr: true,
    port: 5173,
  },
  optimizeDeps: {
    exclude: ["better-auth"],
  },
  ssr: {
    noExternal: ["better-auth"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@i18n": path.resolve(__dirname, "../../i18n"),
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          const normalizedId = id.replaceAll("\\", "/");

          if (id.includes("@codemirror") || id.includes("codemirror")) {
            return "vendor-codemirror";
          }

          if (
            id.includes("/shiki/dist/langs/") ||
            id.includes("/shiki/dist/themes/") ||
            id.includes("@shikijs/langs") ||
            id.includes("@shikijs/themes")
          ) {
            return;
          }

          if (id.includes("shiki")) {
            return "vendor-shiki";
          }

          if (id.includes("@tiptap") || id.includes("prosemirror")) {
            return "vendor-editor";
          }

          if (id.includes("@dnd-kit")) {
            return "vendor-dnd";
          }

          if (id.includes("@tanstack")) {
            return "vendor-tanstack";
          }

          if (id.includes("framer-motion")) {
            return "vendor-motion";
          }

          if (normalizedId.includes("/node_modules/react-day-picker/")) {
            return "vendor-calendar";
          }

          if (normalizedId.includes("/node_modules/date-fns/")) {
            return "vendor-date";
          }

          if (id.includes("i18next") || id.includes("react-i18next")) {
            return "vendor-i18n";
          }

          if (
            id.includes("react-hook-form") ||
            id.includes("@hookform") ||
            id.includes("/zod/")
          ) {
            return "vendor-forms";
          }

          if (
            id.includes("react-markdown") ||
            id.includes("marked") ||
            id.includes("turndown") ||
            id.includes("micromark") ||
            id.includes("mdast") ||
            id.includes("hast") ||
            id.includes("remark") ||
            id.includes("rehype")
          ) {
            return "vendor-markdown";
          }

          if (
            id.includes("@radix-ui") ||
            id.includes("@base-ui") ||
            id.includes("/radix-ui/")
          ) {
            return "vendor-ui";
          }

          if (id.includes("lucide-react")) {
            return "vendor-icons";
          }

          if (id.includes("better-auth")) {
            return "vendor-auth";
          }

          if (
            normalizedId.includes("/node_modules/react/") ||
            normalizedId.includes("/node_modules/react-dom/") ||
            normalizedId.includes("/node_modules/scheduler/")
          ) {
            return "vendor-react";
          }
        },
      },
    },
    commonjsOptions: {
      include: [/better-auth/, /node_modules/],
      transformMixedEsModules: true,
    },
    target: "esnext",
  },
});
