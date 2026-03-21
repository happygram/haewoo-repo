import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIST_DIR = path.join(__dirname, "dist");
const PORT = Number(process.env.PORT || 3000);
const API_PROXY_TARGET = process.env.API_PROXY_TARGET || "";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

function safeJoin(baseDir, requestPathname) {
  // 경로 트래버설 방지: dist 내부로만 접근 허용
  const rel = path
    .normalize(decodeURIComponent(requestPathname))
    .replace(/^(\.\.(\/|\\|$))+/, "");
  return path.join(baseDir, rel);
}

async function fileExists(p) {
  try {
    const st = await fs.promises.stat(p);
    return st.isFile();
  } catch {
    return false;
  }
}

function proxyRequest(req, res, targetBaseUrl) {
  const targetUrl = new URL(targetBaseUrl);
  const isHttps = targetUrl.protocol === "https:";
  const mod = isHttps ? https : http;

  // req.url에는 path+query가 포함됨. targetBaseUrl의 path와 합치지 않음.
  const outPath = req.url || "/";
  const targetHost = targetUrl.hostname;
  const targetPort = targetUrl.port ? Number(targetUrl.port) : isHttps ? 443 : 80;

  const headers = { ...req.headers };
  headers.host = targetHost;
  // ALB/로드밸런서 환경에서 XFF가 이미 있으면 보존
  headers["x-forwarded-for"] = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  headers["x-forwarded-proto"] = req.headers["x-forwarded-proto"] || "http";

  const requestOptions = {
    protocol: targetUrl.protocol,
    hostname: targetHost,
    port: targetPort,
    method: req.method,
    path: outPath,
    headers,
  };

  const proxyReq = mod.request(requestOptions, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on("error", (err) => {
    res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`proxy error: ${err.message}`);
  });

  req.pipe(proxyReq, { end: true });
}

const server = http.createServer(async (req, res) => {
  try {
    if (!req.url) {
      res.writeHead(400);
      return res.end("Bad Request");
    }

    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname;

    // `/api/*`는 backend으로 프록시 (nginx 없이도 같은 출처에서 처리)
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      if (!API_PROXY_TARGET) {
        res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end("API_PROXY_TARGET is not set");
      }
      return proxyRequest(req, res, API_PROXY_TARGET);
    }

    // 정적 파일 우선 제공
    let filePath = safeJoin(DIST_DIR, pathname);

    // 디렉토리면 index.html로
    if (await fileExists(filePath)) {
      // OK
    } else {
      if (!pathname.endsWith("/")) filePath = safeJoin(DIST_DIR, `${pathname}/`);
      if (!(await fileExists(filePath))) {
        filePath = path.join(DIST_DIR, "index.html");
      } else {
        filePath = path.join(filePath, "index.html");
      }
    }

    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME_TYPES[ext] || "application/octet-stream";

    const data = await fs.promises.readFile(filePath);
    res.writeHead(200, { "Content-Type": mime });
    return res.end(data);
  } catch (e) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(e?.message || "Internal Server Error");
  }
});

server.listen(PORT, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`frontend server listening on :${PORT}`);
});

