import * as vscode from "vscode";

export async function wrapSelectionWithMagoIgnore(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const doc = editor.document;
    const sel = editor.selection;

    const startLine = sel.start.line;
    const endLine = sel.end.character === 0
        ? sel.end.line - 1
        : sel.end.line;

    const fullRange = new vscode.Range(
        new vscode.Position(startLine, 0),
        doc.lineAt(endLine).range.end
    );

    const selectedText = doc.getText(fullRange);

    const firstLineText = doc.lineAt(startLine).text;
    const indent = firstLineText.match(/^\s*/)?.[0] ?? "";

    const wrapped =
        `${indent}// @mago-format-ignore-start\n` +
        selectedText + (selectedText.endsWith("\n") ? "" : "\n") +
        `${indent}// @mago-format-ignore-end\n`;

    await editor.edit((eb) => {
        eb.replace(fullRange, wrapped);
    });

    editor.selection = new vscode.Selection(
        new vscode.Position(sel.anchor.line + 1, sel.anchor.character),
        new vscode.Position(sel.active.line + 1, sel.active.character)
    );
}
