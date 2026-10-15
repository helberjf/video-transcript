// Gera a senha de acesso do modo pessoal (web) e o hash que vai para a Vercel.
// Uso: node scripts/gerar-senha-site.mjs <arquivo-de-saida-da-senha>
// A senha so e gravada no arquivo indicado (fora do repositorio); o hash sai no stdout.
import { randomBytes, randomInt, scryptSync } from "node:crypto";
import { writeFileSync } from "node:fs";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const LENGTH = 64; // ~372 bits de entropia
const N = 2 ** 15;
const r = 8;
const p = 1;

const outputPath = process.argv[2];
if (!outputPath) {
  console.error("Informe o arquivo onde a senha sera salva.");
  process.exit(1);
}

let password = "";
for (let index = 0; index < LENGTH; index += 1) {
  password += ALPHABET[randomInt(ALPHABET.length)];
}

const salt = randomBytes(16);
const hash = scryptSync(password, salt, 32, { N, r, p, maxmem: 256 * 1024 * 1024 });
writeFileSync(outputPath, `${password}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
process.stdout.write(`scrypt:${N}:${r}:${p}:${salt.toString("base64")}:${hash.toString("base64")}`);
