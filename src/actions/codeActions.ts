import * as vscode from "vscode";
import { getFixByRange } from "../shared/mago/store";

export function registerCodeActions(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider(
            { language: "php" },
            new MagoCodeActionProvider(),
            { providedCodeActionKinds: MagoCodeActionProvider.providedKinds }
        )
    );
}

class MagoCodeActionProvider implements vscode.CodeActionProvider {
    static readonly providedKinds = [vscode.CodeActionKind.QuickFix];

    provideCodeActions(
        document: vscode.TextDocument,
        _range: vscode.Range,
        context: vscode.CodeActionContext
    ): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = [];

        for (const diag of context.diagnostics) {
            const fix = getFixByRange(document, diag.range);
            if (fix) {
                if (fix.edits.length > 0) {
                    // Apply fix
                    const apply = new vscode.CodeAction(
                        `Mago: Fix "${fix.code ?? "issue"}"`,
                        vscode.CodeActionKind.QuickFix
                    );
                    apply.isPreferred = true;
                    apply.diagnostics = [diag];

                    const fixEdit = new vscode.WorkspaceEdit();
                    for (const e of fix.edits) {
                        fixEdit.replace(document.uri, new vscode.Range(e.start.line, e.start.col, e.end.line, e.end.col), e.newText);
                    }
                    apply.edit = fixEdit;

                    // Preview fix (diff)
                    const preview = new vscode.CodeAction(
                        `Mago: Preview fix "${fix.code ?? "issue"}"`,
                        vscode.CodeActionKind.QuickFix
                    );
                    preview.diagnostics = [diag];
                    preview.command = {
                        command: "magoPhpTools.previewFix",
                        title: "Preview Fix",
                        arguments: [document.uri, fix.id]
                    };

                    actions.push(apply, preview);
                }

                // ---- Suppress with @mago-expect ----
                const suppressCode = `${fix.category ?? "lint"}:${fix.code}`;
                const suppress = new vscode.CodeAction(
                    'Mago: Suppress with @mago-expect',
                    vscode.CodeActionKind.QuickFix
                );
                suppress.diagnostics = [diag];

                const startLine = diag.range.start.line;
                const firstLineText = document.lineAt(startLine).text;
                const indent = firstLineText.match(/^\s*/)?.[0] ?? "";

                const suppressEdit = new vscode.WorkspaceEdit();
                suppressEdit.insert(
                    document.uri,
                    new vscode.Position(startLine, 0),
                    `${indent}// @mago-expect ${suppressCode}\n`
                );

                suppress.edit = suppressEdit;

                actions.push(suppress);
            }
        }

        return actions;
    }
}
