import * as vscode from "vscode";

import { showStatusMessage } from "../shared/statusBar";
import { fileKey, isPhpDoc, TriggerType } from "../shared/utils";

import { clearDiagnosticsByUri, setDiagnostics } from "../shared/mago/store";
import { runMagoAndParse } from "../shared/mago/run";
import { buildIssuesDiagnostic } from "../shared/mago/parse";

export async function lintDocument(
    doc: vscode.TextDocument,
    trigger: TriggerType = "auto",
    context: vscode.ExtensionContext
): Promise<void> {
    if (!isPhpDoc(doc)) return;

    clearDiagnosticsByUri(doc.uri)

    const res = await runMagoAndParse(doc, ["lint"], context, true);
    if(res.code !== 0){
        if(res.msg) vscode.window.showErrorMessage(res.msg);
        return;
    }

    const fileIssue = res.issues?.get(fileKey(doc.uri));
    if(!fileIssue || fileIssue.issues.length === 0){
        showStatusMessage("✔ Mago: No issues found");
        return;
    }

    const diags = buildIssuesDiagnostic(doc, fileIssue.issues);
    setDiagnostics(doc.uri, diags);
}
