const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { atomicWriteJson } = require("../storage/atomic-write");

const DEFAULT_CONTENT_API = "https://liga-rk-api.suporteinhouserk.workers.dev/api/content";

function loadWindowScript(filePath, property) {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(filePath, "utf8"), sandbox, { filename: filePath });
  return sandbox.window[property] || sandbox[property] || {};
}

async function loadOfficialContent(options = {}) {
  const root = options.root || process.cwd();
  const localPath = options.localPath || path.join(root, "assets", "content.js");
  const cachePath = options.cachePath || path.join(root, "data", "official-content-cache.json");
  const apiUrl = options.apiUrl === undefined ? process.env.LIGA_RK_CONTENT_API || DEFAULT_CONTENT_API : options.apiUrl;
  const local = fs.existsSync(localPath) ? loadWindowScript(localPath, "LIGA_RK_CONTENT") : {};

  if (apiUrl && options.fetchRemote !== false) {
    try {
      const response = await fetch(`${String(apiUrl).replace(/\/+$/, "")}?v=${Date.now()}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(options.timeoutMs || 5000)
      });
      if (!response.ok) throw new Error(`API de conteudo retornou ${response.status}.`);
      const payload = await response.json();
      const content = payload && payload.content && payload.content.divisions ? payload.content : payload;
      validateContent(content);
      atomicWriteJson(cachePath, content);
      return { content, source: "online", updatedAt: payload.updatedAt || "" };
    } catch (error) {
      if (!options.silent) console.warn(`Conteudo online indisponivel: ${error.message}`);
    }
  }

  if (fs.existsSync(cachePath)) {
    const cached = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    validateContent(cached);
    return { content: cached, source: "cache", updatedAt: "" };
  }

  validateContent(local);
  return { content: local, source: "local", updatedAt: "" };
}

function validateContent(content) {
  if (!content || !content.divisions || !content.divisions.elite || !content.divisions.ascension) {
    throw new Error("Conteudo oficial sem as duas divisoes.");
  }
  return content;
}

module.exports = { DEFAULT_CONTENT_API, loadOfficialContent, loadWindowScript, validateContent };
