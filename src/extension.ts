import * as vscode from "vscode";
import { clearDiagnosticsAll, clearDiagnosticsByUri, registerDiagnostic } from "./shared/mago/store";

import { registerLintFile } from "./lint/lintFile";
import { registerLintProject } from "./lint/lintProject";
import { registerAnalyzeProject } from "./analyze/analyzeProject";


import { registerFormatFile } from "./format/formatFile";
import { registerFormatIgnore } from "./format/formatIgnore";


import { registerCodeActions } from "./actions/codeActions";
import { registerPreviewAction } from "./actions/previewAction";


export function activate(context: vscode.ExtensionContext) {
    registerDiagnostic(context);
    
    registerFormatFile(context);

    registerLintFile(context);
    registerLintProject(context);

    registerAnalyzeProject(context);

    registerCodeActions(context);
    registerPreviewAction(context);

    registerFormatIgnore(context);

    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument((doc) => {
            if (doc.languageId !== "php") return;

            clearDiagnosticsByUri(doc.uri);
        })
    );
}

export function deactivate() {
    clearDiagnosticsAll();
}
