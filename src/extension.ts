import * as vscode from "vscode";
import { getConfig, saveIfDirty } from "./shared/utils";
import { clearDiagnosticsAll, registerMagoStore } from "./shared/mago/store";

import { formatDocument, getFormatEdits } from "./format/format";
import { wrapSelectionWithMagoIgnore } from "./format/formatIgnore";

import { lintDocument } from "./lint/lint";
import { registerLintProjectView } from "./lint/lintProject";

import { MagoCodeActionProvider } from "./actions/codeActions";
import { diffProvider, previewFix } from "./actions/previewAction";

import { registerAnalyzeView } from "./analyze/analyze";

export function activate(context: vscode.ExtensionContext) {

    registerMagoStore(context);

    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider("mago-diff", diffProvider)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("magoPhpTools.previewFix", previewFix)
    );

    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider(
            { language: "php" },
            new MagoCodeActionProvider(),
            { providedCodeActionKinds: MagoCodeActionProvider.providedKinds }
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            "magoPhpTools.formatIgnore",
            async () => wrapSelectionWithMagoIgnore()
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("magoPhpTools.formatFile", async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;
            await formatDocument(editor.document, "manual", context);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("magoPhpTools.lintFile", async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;
            const doc = editor.document;

            // ✅ Ensure mago sees the same content VS Code is showing
            if (!(await saveIfDirty(doc, "lint"))) return;

            await lintDocument(doc, "manual", context);
        })
    );

    registerAnalyzeView(context);
    registerLintProjectView(context);

    // ✅ Format as part of save (file remains saved)
    context.subscriptions.push(
        vscode.workspace.onWillSaveTextDocument((event) => {
            const doc = event.document;

            const cfg = getConfig();
            if (!cfg.formatOnSave) return;

            event.waitUntil(getFormatEdits(doc, "auto", context));
        })
    );

    // Lint after save is fine (doesn't dirty the file)
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(async (doc) => {
            const cfg = getConfig();
            if (cfg.lintOnSave) await lintDocument(doc, "auto", context);
        })
    );
}

export function deactivate() {
    clearDiagnosticsAll();
}
