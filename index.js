/**
 * Host half of the "Open in VS Code" bundle.
 *
 * 背景：DSH 桌面宿主以 ELECTRON_RUN_AS_NODE=1 启动（桌面壳以 Electron 的 Node 模式派生核心宿主）。
 * 内置 open-in-app 的 launchDetachedApp 用 { ...scrubbedParentEnv(), ...options.env } 构造子进程
 * 环境，而 scrubbedParentEnv() 只过滤 /KEY|PASSWORD|SECRET|TOKEN/i 与 DSH_* 前缀，并不剔除
 * ELECTRON_RUN_AS_NODE——于是 VS Code（同为 Electron）继承该变量后把自己当成 Node 解释器，把
 * 目录参数当成模块来 require，随即以非零码退出，路由返回 502 launch-failed（deepseek-harness
 * 讨论 #8049；V0.2.1-rc.3 仍复现）。
 *
 * 本插件不修改内置 open-in-app，而是提供一条独立的 POST /open-in-vscode 路由：定位 VS Code 的
 * Code.exe，构造启动环境时先取 scrubbedParentEnv() 再按大小写不敏感剔除 ELECTRON_RUN_AS_NODE
 * （“先清继承、后合显式”，与社区修法一致），detached spawn + 看护窗口判定启动结果。
 * 宿主自身环境不被修改，因此经 Windows Job runner 的命令执行（pwsh/grep 等）不受影响。
 */
import { execFile, spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { platform } from "node:os";
/** 敏感环境变量名（与 @deepseek-ai/dsh-subprocess 的清洗规则一致）。 */
const SENSITIVE_ENV_RE = /KEY|PASSWORD|SECRET|TOKEN/i;
/** 显式保留的代理变量（与 @deepseek-ai/dsh-subprocess 的合并行为一致）。 */
const PROXY_ENV_NAMES = ["HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy"];

/**
 * 复刻 @deepseek-ai/dsh-subprocess 的 scrubbedParentEnv：从父进程环境复制后，剔除
 * /KEY|PASSWORD|SECRET|TOKEN/i 与 DSH_* 前缀的变量，再显式合入代理变量。内联本实现
 * 是为了去掉对该包的 peer 依赖，便于作为独立插件发布。
 */
function scrubbedParentEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (SENSITIVE_ENV_RE.test(key) || key.startsWith("DSH_")) delete env[key];
  }
  for (const name of PROXY_ENV_NAMES) {
    if (process.env[name] !== void 0) env[name] = process.env[name];
  }
  return env;
}

export const name = "open-in-vscode";
export const inject = ["webServer", "connection", "subprocess"];

/** 本插件唯一的 Web 路由（与内置 /open-in-app/* 互不冲突）。 */
const OPEN_VSCODE_PATH = "/open-in-vscode";
/** 请求体上限：仅一个路径字符串，超出即拒绝。 */
const MAX_BODY_BYTES = 64 * 1024;
/** 看护窗口：子进程在窗口内非零退出判定失败；窗口到期仍在运行判定启动成功。 */
const LAUNCH_WATCH_MS = 1500;
/** Windows App Paths 下 VS Code 的注册表项（无 shell 的 reg.exe 查询）。 */
const APP_PATHS_REL = "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Code.exe";

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
}

function sendMethodNotAllowed(res, allow) {
  res.statusCode = 405;
  res.setHeader("allow", allow);
  res.end();
}

/** 收集有上限的请求体为 UTF-8 文本；超过上限返回 null（已排空）。 */
async function readBoundedBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.byteLength;
    if (size > MAX_BODY_BYTES) {
      req.resume();
      return null;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size).toString("utf8");
}

/** 已知安装位置：LOCALAPPDATA / ProgramFiles / ProgramFiles(x86)。 */
function knownCandidates(env) {
  const roots = [];
  if (env.LOCALAPPDATA) roots.push(join(env.LOCALAPPDATA, "Programs", "Microsoft VS Code"));
  if (env.ProgramFiles) roots.push(join(env.ProgramFiles, "Microsoft VS Code"));
  if (env["ProgramFiles(x86)"]) roots.push(join(env["ProgramFiles(x86)"], "Microsoft VS Code"));
  return roots.map((dir) => join(dir, "Code.exe"));
}

/** 注册表 App Paths 查询：返回 (Default) 的可执行文件路径，失败返回 null。 */
function queryAppPaths(root, env) {
  return new Promise((resolve) => {
    execFile("reg.exe", ["query", `${root}\\${APP_PATHS_REL}`, "/ve"], { env }, (error, stdout) => {
      if (error) {
        resolve(null);
        return;
      }
      const lines = String(stdout).split(/\r?\n/);
      for (let i = lines.length - 1; i >= 0; i--) {
        const match = lines[i].match(/REG_SZ\s+(.+)$/);
        if (match) {
          resolve(match[1].trim());
          return;
        }
      }
      resolve(null);
    });
  });
}

/** 定位 VS Code 的 Code.exe：已知路径 → App Paths 注册表 → PATH 中的 code 可执行文件。 */
async function findCodeExe(ctx, env) {
  for (const candidate of knownCandidates(env)) {
    if (existsSync(candidate)) return candidate;
  }
  if (platform() === "win32") {
    for (const root of ["HKLM", "HKCU"]) {
      const fromRegistry = await queryAppPaths(root, env);
      if (fromRegistry && existsSync(fromRegistry)) return fromRegistry;
    }
  }
  try {
    const resolved = await ctx.subprocess.resolveExecutable("code");
    if (resolved && /\.exe$/i.test(resolved) && existsSync(resolved)) return resolved;
  } catch {
    // PATH 中没有 code，忽略。
  }
  return null;
}

/** 启动环境：scrubbedParentEnv() 之后按大小写不敏感剔除 ELECTRON_RUN_AS_NODE。 */
function childEnvForGui() {
  const inherited = scrubbedParentEnv();
  for (const key of Object.keys(inherited)) {
    if (key.toUpperCase() === "ELECTRON_RUN_AS_NODE") delete inherited[key];
  }
  return inherited;
}

/**
 * 分离式启动 VS Code：子进程脱离本进程、无 stdio 管道、带清洗过的环境。
 * 看护窗口内非零退出判定失败；窗口到期仍在运行判定启动成功（unref 后任其存活）。
 */
function launchCode(exe, directory) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, [directory], {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
      env: childEnvForGui(),
    });
    let settled = false;
    const settle = (outcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(watch);
      child.unref();
      outcome();
    };
    const watch = setTimeout(() => settle(() => resolve("launched")), LAUNCH_WATCH_MS);
    child.on("error", (error) => settle(() => reject(error)));
    child.on("exit", (code, signalName) => {
      if (code === 0) settle(() => resolve("launched"));
      else settle(() => reject(new Error(`launcher exited with code ${String(code)}, signal ${String(signalName)}`)));
    });
  });
}

export function apply(ctx) {
  /** 应用 connection 的 Host/Origin 围栏与浏览器认证；true 表示已被拒绝并应答。 */
  const rejected = (req, res) => {
    const rejection = ctx.connection.requestRejection(req);
    if (rejection === undefined) return false;
    res.statusCode = rejection;
    res.end();
    return true;
  };
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: OPEN_VSCODE_PATH,
    handler: async (req, res) => {
      if (rejected(req, res)) return;
      if (req.method !== "POST") {
        sendMethodNotAllowed(res, "POST");
        return;
      }
      if (String(req.headers["content-type"]).split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
        sendJson(res, 415, { code: "unsupported-media-type", message: "content-type must be application/json" });
        return;
      }
      let text;
      try {
        text = await readBoundedBody(req);
      } catch {
        sendJson(res, 400, { code: "bad-request", message: "request body unreadable" });
        return;
      }
      if (text === null) {
        sendJson(res, 413, { code: "payload-too-large", message: "request body is too large" });
        return;
      }
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
      if (!body || typeof body !== "object" || typeof body.path !== "string") {
        sendJson(res, 400, { code: "bad-request", message: "request body must be JSON with a string \"path\"" });
        return;
      }
      const { path } = body;
      if (path === "" || !isAbsolute(path)) {
        sendJson(res, 400, { code: "bad-request", message: "path must be an absolute directory path" });
        return;
      }
      let directory = false;
      try {
        directory = statSync(path).isDirectory();
      } catch {
        directory = false;
      }
      if (!directory) {
        sendJson(res, 404, { code: "not-found", message: `directory does not exist: ${path}` });
        return;
      }
      const exe = await findCodeExe(ctx, process.env);
      if (exe === null) {
        sendJson(res, 404, { code: "not-found", message: "Visual Studio Code executable not found" });
        return;
      }
      try {
        await launchCode(exe, path);
        sendJson(res, 200, { ok: true });
      } catch (error) {
        sendJson(res, 502, { code: "launch-failed", message: "failed to launch vscode" });
      }
    }
  }), `open-in-vscode: POST ${OPEN_VSCODE_PATH}`);
}
