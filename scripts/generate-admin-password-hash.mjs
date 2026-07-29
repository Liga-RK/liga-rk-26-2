import crypto from "node:crypto";

const ITERATIONS = 310_000;
const password = await readSecret("Senha administrativa: ");

if (password.length < 14) {
  process.stderr.write("Use uma senha com pelo menos 14 caracteres.\n");
  process.exitCode = 1;
} else {
  const salt = crypto.randomBytes(16);
  const digest = crypto.pbkdf2Sync(password, salt, ITERATIONS, 32, "sha256");
  process.stdout.write(
    `pbkdf2_sha256$${ITERATIONS}$${salt.toString("base64")}$${digest.toString("base64")}\n`
  );
}

async function readSecret(prompt) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
  }
  process.stderr.write(prompt);
  process.stdin.setEncoding("utf8");
  process.stdin.setRawMode(true);
  process.stdin.resume();
  let value = "";
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
    };
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === "\u0003") {
          cleanup();
          process.stderr.write("\n");
          reject(new Error("Operação cancelada."));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          process.stderr.write("\n");
          resolve(value);
          return;
        }
        if (character === "\u007f" || character === "\b") {
          if (value) {
            value = value.slice(0, -1);
            process.stderr.write("\b \b");
          }
          continue;
        }
        if (character >= " ") {
          value += character;
          process.stderr.write("*");
        }
      }
    };
    process.stdin.on("data", onData);
  });
}
