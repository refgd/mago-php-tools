import * as vscode from "vscode";
import * as path from "path";
import { fileKey } from "../shared/utils";
import { MagoFix } from "../shared/mago/types";
import { getFixById } from "../shared/mago/store";

/**
 * Read-only virtual document provider for diff-left (fixed code).
 * We use a custom scheme so VS Code will request content from us.
 */
class MagoDiffProvider implements vscode.TextDocumentContentProvider {
    static scheme = "mago-diff";

    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    readonly onDidChange = this._onDidChange.event;

    private content = new Map<string, string>();

    set(uri: vscode.Uri, text: string) {
        this.content.set(fileKey(uri), text);
        this._onDidChange.fire(uri);
    }

    clear(uri: vscode.Uri) {
        this.content.delete(fileKey(uri));
        this._onDidChange.fire(uri);
    }

    provideTextDocumentContent(uri: vscode.Uri): string {
        return this.content.get(fileKey(uri)) ?? "";
    }
}

const diffProvider = new MagoDiffProvider();

function safeId(s: string) {
    return s.replace(/[^\w.-]+/g, "_");
}

function computePatchedText(doc: vscode.TextDocument, fix: MagoFix): string {
    const original = doc.getText();

    const edits = fix.edits
        .map((e) => ({
            start: doc.offsetAt(new vscode.Position(e.start.line, e.start.col)),
            end: doc.offsetAt(new vscode.Position(e.end.line, e.end.col)),
            newText: e.newText
        }))
        .sort((a, b) => b.start - a.start);

    let out = original;
    for (const e of edits) {
        out = out.slice(0, e.start) + e.newText + out.slice(e.end);
    }
    return out;
}

function makeLeftUri(target: vscode.Uri, fix: MagoFix): vscode.Uri {
    const base = safeId(path.basename(target.path || "file.php"));
    const rule = safeId(fix.code ?? "fix");
    const id = safeId(fix.id).slice(0, 32);

    // Unique enough so multiple previews don’t collide
    return vscode.Uri.from({
        scheme: MagoDiffProvider.scheme,
        path: `/fixed/${base}.${rule}.${id}.php`
    });
}

/**
 * Opens a DIFF view:
 * - left: fixed code (virtual, read-only)
 * - right: real file (editable)
 */
async function previewFix(uri: vscode.Uri, fixId: string): Promise<void> {
    const doc = await vscode.workspace.openTextDocument(uri);

    const fix = getFixById(doc, fixId);
    if (!fix) {
        vscode.window.showWarningMessage("No mago fix found (try re-running lint).");
        return;
    }

    // If dirty, save first so the fix ranges (computed from lint run) match current text
    if (doc.isDirty) {
        const saved = await doc.save();
        if (!saved) return;
    }

    const refreshed = await vscode.workspace.openTextDocument(uri);
    const fixedText = computePatchedText(refreshed, fix);

    const leftUri = makeLeftUri(uri, fix);
    diffProvider.set(leftUri, fixedText);

    const title = `Mago Fix Preview (${fix.code ?? "fix"})`;

    // LEFT is fixed (virtual), RIGHT is real file
    await vscode.commands.executeCommand("vscode.diff", leftUri, uri, title);

    // Optional: focus right side (real file) so editing is easy
    // await vscode.commands.executeCommand("workbench.action.focusSecondEditorGroup");
}

export function registerPreviewAction(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider("mago-diff", diffProvider)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("magoPhpTools.previewFix", previewFix)
    );
}