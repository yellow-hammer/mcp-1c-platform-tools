/**
 * Бандл MCP-сервера (stdio): один файл out/src/index.js с встроенными
 * @modelcontextprotocol/sdk и zod. node_modules не нужен в VSIX.
 */
import * as esbuild from "esbuild";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

await esbuild.build({
  entryPoints: [path.join(__dirname, "src", "index.ts")],
  bundle: true,
  outfile: path.join(__dirname, "out", "src", "index.js"),
  platform: "node",
  format: "esm",
  target: "node20",
  minify: true,
  sourcemap: true,
  mainFields: ["module", "main"],
});
