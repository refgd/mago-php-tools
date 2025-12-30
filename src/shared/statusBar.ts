// statusBar.ts
import * as vscode from "vscode";

let statusBarItem: vscode.StatusBarItem | undefined;
let hideTimer: NodeJS.Timeout | undefined;

export function showStatusMessage(
    text: string,
    timeoutMs = 2500
): void {
    if (!statusBarItem) {
        statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
    }

    // Clear previous timer
    if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = undefined;
    }

    statusBarItem.text = text;
    statusBarItem.tooltip = "Mago PHP Tools";
    statusBarItem.show();

    hideTimer = setTimeout(() => {
        statusBarItem?.hide();
    }, timeoutMs);
}

export function disposeStatusBar(): void {
    if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = undefined;
    }
    statusBarItem?.dispose();
    statusBarItem = undefined;
}
