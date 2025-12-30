// magoStore.ts
import * as vscode from "vscode";
import { fileKey } from "../utils";
import { MagoFix } from "./types";
import { generateID } from "./parse";

let DIAGNOSTIC_COLLECTION: vscode.DiagnosticCollection | undefined;

const FIX_BY_FILE = new Map<string, Map<string, MagoFix>>();

/**
 * Must be called once during extension activation.
 * Handles lifecycle + disposal automatically.
 */
export function registerMagoStore(context: vscode.ExtensionContext): void {
    if (DIAGNOSTIC_COLLECTION) {
        return; // already registered
    }

    DIAGNOSTIC_COLLECTION =
        vscode.languages.createDiagnosticCollection("mago");

    context.subscriptions.push(DIAGNOSTIC_COLLECTION);
}

/* ------------------------------------------------------------------ */
/* Diagnostics                                                         */
/* ------------------------------------------------------------------ */

export function setDiagnostics(
    uri: vscode.Uri,
    diagnostics: vscode.Diagnostic[]
): void {
    DIAGNOSTIC_COLLECTION?.set(uri, diagnostics);
}

export function clearDiagnosticsByUri(uri: vscode.Uri): void {
    DIAGNOSTIC_COLLECTION?.delete(uri);
    FIX_BY_FILE.delete(fileKey(uri));
}

export function clearDiagnosticsAll(): void {
    DIAGNOSTIC_COLLECTION?.clear();
    FIX_BY_FILE.clear();
}

/* ------------------------------------------------------------------ */
/* Fix storage                                                         */
/* ------------------------------------------------------------------ */

export function putFix(uri: vscode.Uri, fix: MagoFix): void {
    const key = fileKey(uri);
    let fixes = FIX_BY_FILE.get(key);
    if (!fixes) fixes = new Map<string, MagoFix>();
    fixes.set(fix.id, fix);
    FIX_BY_FILE.set(key, fixes);
}

export function getFixByRange(
    doc: vscode.TextDocument,
    range: vscode.Range
): MagoFix | undefined {
    const fixes = FIX_BY_FILE.get(fileKey(doc.uri));
    if (!fixes) return undefined;

    const id = generateID(doc, range);
    return fixes.get(id);
}

export function getFixById(
    doc: vscode.TextDocument,
    id: string
): MagoFix | undefined {
    const fixes = FIX_BY_FILE.get(fileKey(doc.uri));
    if (!fixes) return undefined;
    return fixes.get(id);
}
