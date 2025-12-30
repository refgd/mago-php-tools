import * as vscode from "vscode";

export type TriggerType = "auto" | "manual";

export function isPhpDoc(doc: vscode.TextDocument): boolean {
    return doc.languageId === "php" && doc.uri.scheme === "file";
}

export const fileKey = (uri: vscode.Uri) => uri.fsPath;

export function getConfig() {
    const cfg = vscode.workspace.getConfiguration("magoPhpTools");
    return {
        magoPath: cfg.get<string>("magoPath", "mago"),
        formatOnSave: cfg.get<boolean>("formatOnSave", true),
        lintOnSave: cfg.get<boolean>("lintOnSave", true)
    };
}

export async function saveIfDirty(doc: vscode.TextDocument, label: string): Promise<boolean> {
    if (!doc.isDirty) return true;
    vscode.window.setStatusBarMessage(`Mago: saving before ${label}…`, 1500);
    
    try {
        return await doc.save();
    } catch {
        return false;
    }
}