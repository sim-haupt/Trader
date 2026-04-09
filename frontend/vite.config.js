import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";

function getGitSha() {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

const buildTime = new Date().toISOString();
const appVersion = process.env.npm_package_version || "0.0.0";
const gitSha = getGitSha();

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __APP_BUILD_SHA__: JSON.stringify(gitSha),
    __APP_BUILD_TIME__: JSON.stringify(buildTime)
  }
});
