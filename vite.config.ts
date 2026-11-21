import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
export default defineConfig({
  plugins: [
    react(),
    tailwind(),
    cloudflare({
      persistState: process.env.EVERMORE_TEST_STATE
        ? { path: process.env.EVERMORE_TEST_STATE }
        : true,
    }),
  ],
});
