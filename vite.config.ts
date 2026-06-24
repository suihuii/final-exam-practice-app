import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/final-exam-practice-app/",
  plugins: [react()],
});
