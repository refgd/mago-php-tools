import * as vscode from "vscode";
import {
    getConfig,
    TriggerType
} from "../shared/utils";
import { runMagoCommand } from "../shared/mago/run";

/** Used for onWillSave: returns edits that VS Code will apply during save. */
export async function getFormatEdits(
    doc: vscode.TextDocument,
    trigger: TriggerType = "auto",
    context: vscode.ExtensionContext
): Promise<vscode.TextEdit[]> {
    const cfg = getConfig();
    const filePath = doc.uri.fsPath;
    const input = doc.getText();

    const res = await runMagoCommand(filePath, ["fmt", "--stdin-input"], context, input);
    const stderr = res.stderr?.trim() ?? "";

    if (stderr) {
        if(!(trigger == 'auto' && cfg.lintOnSave && /Failed to parse/i.test(stderr))){
            vscode.window.showErrorMessage(stderr);
            return [];
        }
    }

    const formatted = res.stdout;

    // Never wipe file if tool returns empty
    if (!formatted || formatted.trim().length === 0) return [];

    if (formatted === input) return [];

    const fullRange = new vscode.Range(
        doc.positionAt(0),
        doc.positionAt(input.length)
    );

    return [vscode.TextEdit.replace(fullRange, formatted)];
}

/** Manual command formatting (applies edit immediately; leaves doc dirty until user saves). */
export async function formatDocument(
    doc: vscode.TextDocument,
    trigger: TriggerType = "auto",
    context: vscode.ExtensionContext
): Promise<void> {
    const edits = await getFormatEdits(doc, trigger, context);
    if (edits.length === 0) return;

    const we = new vscode.WorkspaceEdit();
    for (const e of edits) we.replace(doc.uri, e.range, e.newText);
    await vscode.workspace.applyEdit(we);
}
