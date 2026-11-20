import {
  mkdir,
  readFile,
  writeFile,
  rename,
  open,
  lstat,
  realpath,
  rm,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { ensure } from "./contracts.js";
export class Workspace {
  constructor(readonly directory: string) {}
  static async create(base: string) {
    await mkdir(base, { recursive: true, mode: 0o700 });
    ensure(!(await lstat(base)).isSymbolicLink(), "WORKSPACE_SYMLINK");
    base = await realpath(base);
    const directory = path.join(base, randomUUID());
    await mkdir(directory, { mode: 0o700 });
    // Same OS ACL policy as the installer; no credentials or production config read.
    if (process.platform === "win32") {
      const sid = execFileSync("whoami", ["/user", "/fo", "csv", "/nh"], {
        encoding: "utf8",
      }).match(/S-1-(?:\d+-)+\d+/)?.[0];
      ensure(sid, "PRIVATE_WORKSPACE_FAILED");
      execFileSync(
        "icacls",
        [
          directory,
          "/inheritance:r",
          "/grant:r",
          `*${sid}:(OI)(CI)F`,
          "*S-1-5-18:(OI)(CI)F",
          "*S-1-5-32-544:(OI)(CI)F",
        ],
        { stdio: "pipe" },
      );
    }
    const w = new Workspace(directory);
    await w.write("workspace.json", {
      version: 1,
      kind: "steward-explorer-private",
      createdAt: Date.now(),
    });
    return w;
  }
  static async existing(base: string, id: string) {
    ensure(/^[0-9a-f-]{36}$/.test(id), "INVALID_WORKSPACE_ID");
    base = await realpath(base);
    const directory = path.join(base, id);
    ensure(
      !(await lstat(directory)).isSymbolicLink() &&
        (await realpath(directory)) === directory,
      "WORKSPACE_SYMLINK",
    );
    const w = new Workspace(directory);
    ensure(
      (await w.read<any>("workspace.json")).kind === "steward-explorer-private",
      "WRONG_WORKSPACE",
    );
    return w;
  }
  file(name: string) {
    ensure(/^[a-z][a-z0-9.-]{0,70}$/.test(name), "INVALID_WORKSPACE_FILE");
    return path.join(this.directory, name);
  }
  async read<T>(name: string): Promise<T> {
    const f = this.file(name);
    ensure(
      !(await lstat(f)).isSymbolicLink() && (await lstat(f)).size <= 16777216,
      "WORKSPACE_FILE_LIMIT",
    );
    return JSON.parse(await readFile(f, "utf8")) as T;
  }
  async optional<T>(name: string): Promise<T | undefined> {
    try {
      return await this.read<T>(name);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw e;
    }
  }
  async write(name: string, value: unknown) {
    const f = this.file(name),
      temporary = f + "." + randomUUID() + ".tmp";
    const fd = await open(temporary, "wx", 0o600);
    try {
      await fd.writeFile(JSON.stringify(value, null, 2) + "\n");
      await fd.sync();
    } finally {
      await fd.close();
    }
    await rename(temporary, f);
  }
  async lock<T>(fn: () => Promise<T>) {
    const file = this.file("lock.json");
    let handle;
    try {
      handle = await open(file, "wx", 0o600);
    } catch {
      throw Error("WORKSPACE_LOCKED");
    }
    try {
      await handle.writeFile(JSON.stringify({ pid: process.pid }));
      await handle.sync();
      return await fn();
    } finally {
      await handle.close();
      await rm(file);
    }
  }
  async recoverLock() {
    const lock = await this.read<{ pid: number }>("lock.json");
    ensure(Number.isInteger(lock.pid) && lock.pid > 0, "INVALID_LOCK");
    let alive = true;
    try {
      process.kill(lock.pid, 0);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ESRCH") alive = false;
    }
    ensure(!alive, "WORKSPACE_OWNER_RUNNING");
    await rm(this.file("lock.json"));
  }
  async remove() {
    await this.lock(async () => {
      const marker = await this.read<any>("workspace.json");
      ensure(marker.kind === "steward-explorer-private", "WRONG_WORKSPACE");
      await this.write("workspace.json", { ...marker, deleting: true });
      await this.write("approval.json", { approved: false });
    });
    ensure(
      !(await lstat(this.directory)).isSymbolicLink(),
      "WORKSPACE_SYMLINK",
    );
    await rm(this.directory, { recursive: true });
  }
}
