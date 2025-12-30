import * as vscode from "vscode";

import { showStatusMessage } from "../shared/statusBar";
import { fileKey, getConfig, isPhpDoc, saveIfDirty, TriggerType } from "../shared/utils";

import { clearDiagnosticsByUri, setDiagnostics } from "../shared/mago/store";
import { runMagoAndParse } from "../shared/mago/run";
import { buildIssuesDiagnostic } from "../shared/mago/parse";

export function registerLintFile(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("magoPhpTools.lintFile", async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;
            await lintFile(editor.document, "manual", context);
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(async (doc) => {
            const cfg = getConfig();
            if (cfg.lintOnSave) await lintFile(doc, "auto", context);
        })
    );
}

async function lintFile(
    doc: vscode.TextDocument,
    trigger: TriggerType = "auto",
    context: vscode.ExtensionContext
): Promise<void> {
    if (!isPhpDoc(doc)) return;

    // ✅ Ensure mago sees the same content VS Code is showing
    if (!(await saveIfDirty(doc, "lint"))) return;

    clearDiagnosticsByUri(doc.uri)

    const res = await runMagoAndParse(doc, ["lint"], context, true);
    if (res.code !== 0) {
        if (res.msg) vscode.window.showErrorMessage(res.msg);
        return;
    }

    const fileIssue = res.issues?.get(fileKey(doc.uri));
    if (!fileIssue || fileIssue.issues.length === 0) {
        showStatusMessage("✔ Mago: No issues found");
        return;
    }

    const diags = buildIssuesDiagnostic(doc, fileIssue.issues);
    setDiagnostics(doc.uri, diags);
}
