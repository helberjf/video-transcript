// Monta a pasta que vai para o projeto Python da Vercel: o codigo de backend/app mais as
// dependencias leves desta pasta. Uso: node deploy/vercel-backend/stage.mjs
// Depois: cd .vercel-build/backend && vercel deploy --prod
import { copyFileSync, cpSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..");
const target = join(repo, ".vercel-build", "backend");

// Limpa a montagem anterior, mas preserva o vinculo com o projeto da Vercel (.vercel/project.json).
mkdirSync(target, { recursive: true });
for (const name of readdirSync(target)) {
  if (name !== ".vercel") {
    rmSync(join(target, name), { recursive: true, force: true });
  }
}

cpSync(join(repo, "backend", "app"), join(target, "app"), {
  recursive: true,
  filter: (source) => !source.includes("__pycache__") && !source.endsWith(".pyc"),
});
for (const file of ["requirements.txt", "vercel.json"]) {
  copyFileSync(join(here, file), join(target, file));
}
writeFileSync(join(target, ".python-version"), "3.12\n");

const size = (dir) =>
  readdirSync(dir).reduce((total, name) => {
    const path = join(dir, name);
    return total + (statSync(path).isDirectory() ? size(path) : statSync(path).size);
  }, 0);
console.log(`Backend montado em ${target} (${Math.round(size(join(target, "app")) / 1024)} KB de codigo)`);
