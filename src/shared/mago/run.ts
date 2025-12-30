import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { spawn } from "child_process";
import { getConfig } from "../utils";
import { FileIssue } from "./types";
import {
    parseMagoJson,
    parseSingleIssue,
} from "./parse";

function fileExists(p: string): boolean {
    try {
        fs.accessSync(p, fs.constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

/** Walk up from startDir to filesystem root, looking for mago.toml. */
function findMagoRoot(startDir: string): string | null {
    let dir = startDir;
    while (true) {
        const candidate = path.join(dir, "mago.toml");
        if (fileExists(candidate)) return dir;

        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    return null;
}

function getBundledMagoConfig(context: vscode.ExtensionContext): string | undefined {
    const uri = vscode.Uri.joinPath(context.extensionUri, "mago.toml");
    if (!fs.existsSync(uri.fsPath)) return undefined;
    return uri.fsPath;
}

export function runMagoCommand(
    filePath: string,
    args: string[],
    context: vscode.ExtensionContext,
    stdinText?: string
): Promise<{
    code: number | null;
    stdout: string;
    stderr: string;
    magoRoot: string;
}> {
    return new Promise((resolve, reject) => {
        const docDir = path.dirname(filePath);
        const cfg = getConfig();

        let magoRoot = findMagoRoot(docDir);
        const finalArgs = [...args];

        if (!magoRoot) {
            magoRoot = docDir;
            const bundledFile = getBundledMagoConfig(context);
            if (!bundledFile) {
                // IMPORTANT: resolve/reject properly (old code "return {..}" did nothing)
                return resolve({
                    code: 1,
                    stdout: "",
                    stderr: "Bundled mago.toml not found in extension.",
                    magoRoot,
                });
            }
            finalArgs.unshift("--config", bundledFile);
        }

        const child = spawn(cfg.magoPath, finalArgs, {
            cwd: magoRoot,
            shell: process.platform === "win32",
        });

        let stdout = "";
        let stderr = "";

        child.stdout?.on("data", (d) => (stdout += d.toString()));
        child.stderr?.on("data", (d) => (stderr += d.toString()));

        child.on("error", (err) => reject(err));
        child.on("close", (code) => resolve({ code, stdout, stderr, magoRoot }));

        if (stdinText !== undefined) {
            child.stdin?.write(stdinText, "utf8");
        }
        child.stdin?.end();
    });
}

export async function runMagoAndParse(
    doc: vscode.TextDocument,
    args: string[],
    context: vscode.ExtensionContext,
    byfile?: boolean
): Promise<{
    code: number;
    msg?: string;
    magoRoot: string;
    issues?: Map<string, FileIssue>;
}> {
    const filePath = doc.uri.fsPath;
    const category = args[0] === "analyze" ? "analysis" : "lint";

    const runArgs = [...args, "--reporting-format", "json"];
    if (byfile) runArgs.push(filePath);

    const res = await runMagoCommand(filePath, runArgs, context);
    const stderr = res.stderr?.trim() ?? "";
    const fileGroup = new Map<string, FileIssue>();
    const magoRoot = res.magoRoot;

    if (stderr) {
        if (/no issues found\.?/i.test(stderr)) {
            return { code: 0, issues: fileGroup, magoRoot };
        }
        return { code: 1, msg: res.stderr, magoRoot };
    }

    const parsed = parseMagoJson(res.stdout ?? "");
    if (!parsed) {
        return { code: 1, msg: "Wrong JSON output", magoRoot };
    }

    const issues = parsed?.issues ?? [];
    for (let i = 0; i < issues.length; i++) {
        const issue = parseSingleIssue(category, i, issues[i]);
        if (!issue) continue;

        const group =
            fileGroup.get(issue.filePath) ?? {
                filePath: issue.filePath,
                issues: []
            };

        group.issues.push(issue);

        fileGroup.set(issue.filePath, group);
    }

    return { code: 0, issues: fileGroup, magoRoot };
}
