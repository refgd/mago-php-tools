import * as vscode from "vscode";

import { showStatusMessage } from "./statusBar";
import { isPhpDoc, TriggerType } from "./utils";
import { clearDiagnosticsAndFixes, runMagoAndParse, setDiagnostics } from "./magoRunner";

export async function lintDocument(
    doc: vscode.TextDocument,
    trigger: TriggerType = "auto",
    context: vscode.ExtensionContext
): Promise<void> {
    if (!isPhpDoc(doc)) return;

    clearDiagnosticsAndFixes(doc.uri)

    const res = await runMagoAndParse(doc, ["lint"], context, true);
    if(res.code !== 0){
        if(res.msg) vscode.window.showErrorMessage(res.msg);
        return;
    }

    const fileIssue = res.issues?.get(doc.uri.fsPath);
    if(!fileIssue || fileIssue.issues.length === 0){
        showStatusMessage("✔ Mago: No issues found");
        return;
    }

    setDiagnostics(doc.uri, fileIssue.diags);
}
