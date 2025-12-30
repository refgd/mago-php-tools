import * as vscode from "vscode";
import * as path from "path";
import { fileKey } from "../utils";
import {
    MagoEdit,
    MagoFix,
    MagoIssue,
    MagoJson,
    TextEdit,
} from "./types";
import { putFix } from "./store";

type LineByteCache = {
    eol: vscode.EndOfLine;
    lineStartBytes: number[];
};

export function parseMagoJson(stdout: string): MagoJson | null {
    try {
        return JSON.parse(stdout);
    } catch {
        return null;
    }
}

export function pickPrimaryAnnotation(annotations: any[]): any | null {
    const primary = annotations.find(
        (a) => String(a?.kind ?? "").toLowerCase() === "primary"
    );
    return primary ?? annotations[0] ?? null;
}

export function sameFile(a: string, b?: string): boolean {
    if (!b) return false;
    try {
        return path.resolve(a) === path.resolve(b);
    } catch {
        return a === b;
    }
}

/** Extract *safe* edits for the given file from mago's `issue.edits` structure. */
export function extractSafeEditsForFile(
    editsTuples: any,
    filePath: string
): MagoEdit[] {
    if (!Array.isArray(editsTuples)) return [];

    for (const tuple of editsTuples) {
        const fileInfo = tuple?.[0];
        const editsArr: MagoEdit[] = tuple?.[1];

        if (!sameFile(filePath, fileInfo?.path)) continue;
        if (!Array.isArray(editsArr) || editsArr.length === 0) continue;

        const safeOnly = editsArr.filter(
            (e) => String(e?.safety ?? "safe").toLowerCase() === "safe"
        );
        if (safeOnly.length > 0) return safeOnly;
    }

    return [];
}

export function parseSingleIssue(
    category: string,
    issueIndex: number,
    issue: NonNullable<MagoJson["issues"]>[number]
): MagoIssue | undefined {
    const anns = issue.annotations ?? [];
    const primary = pickPrimaryAnnotation(anns);
    const filePath = String(primary?.span?.file_id?.path ?? "");
    if (!filePath || !primary) return undefined;

    const safeEdits = extractSafeEditsForFile(issue.edits, filePath);
    const hasSafeFix = safeEdits.length > 0;

    return {
        issueIndex,
        level: issue.level ? String(issue.level) : undefined,
        category: issue.category ? String(issue.category) : category,
        code: issue.code ? String(issue.code) : undefined,
        message: issue.message ? String(issue.message) : undefined,
        help: issue.help ? String(issue.help) : undefined,
        safeEdits,
        filePath,
        primaryAnn: primary,
        hasSafeFix,
    };
}

function utf8ByteLen(s: string): number {
    return Buffer.byteLength(s, "utf8");
}

export function buildLineByteCache(doc: vscode.TextDocument): LineByteCache {
    const eolStr = doc.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
    const eolBytes = utf8ByteLen(eolStr);

    const starts: number[] = new Array(doc.lineCount);
    let running = 0;

    for (let line = 0; line < doc.lineCount; line++) {
        starts[line] = running;
        const text = doc.lineAt(line).text;
        running += utf8ByteLen(text);
        if (line !== doc.lineCount - 1) running += eolBytes;
    }

    return { eol: doc.eol, lineStartBytes: starts };
}

function safeNumber(n: any): number | undefined {
    const x = Number(n);
    return Number.isFinite(x) ? x : undefined;
}

function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

function findLineByByteOffset(starts: number[], byteOffset: number): number {
    let lo = 0;
    let hi = starts.length - 1;

    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (starts[mid] <= byteOffset) lo = mid + 1;
        else hi = mid - 1;
    }

    return clamp(hi, 0, starts.length - 1);
}

/**
 * Convert mago byte offset (UTF-8 bytes from file start) into VS Code Position.
 * Uses a line-start byte cache and UTF-8->UTF-16 column conversion.
 */
export function byteOffsetToPosition(
    doc: vscode.TextDocument,
    cache: LineByteCache,
    byteOffset: number,
    lineHint?: number
): vscode.Position {
    const starts = cache.lineStartBytes;

    const lastLine = doc.lineCount - 1;
    const maxBytes =
        starts[lastLine] + utf8ByteLen(doc.lineAt(lastLine).text);

    const target = clamp(byteOffset, 0, maxBytes);

    let line: number;
    if (typeof lineHint === "number" && lineHint >= 0 && lineHint < doc.lineCount) {
        line = lineHint;
    } else {
        line = findLineByByteOffset(starts, target);
    }

    const lineText = doc.lineAt(line).text;
    const lineStartByte = starts[line];
    const withinLineBytes = clamp(
        target - lineStartByte,
        0,
        utf8ByteLen(lineText)
    );

    let b = 0;
    let col = 0;
    for (const ch of lineText) {
        const chBytes = utf8ByteLen(ch);
        if (b + chBytes > withinLineBytes) break;
        b += chBytes;
        col += ch.length; // UTF-16 code units
    }

    return new vscode.Position(line, col);
}

export function annotationToRange(
    doc: vscode.TextDocument,
    cache: LineByteCache,
    ann: any
): vscode.Range {
    const startOffset = safeNumber(ann?.span?.start?.offset);
    const endOffset = safeNumber(ann?.span?.end?.offset);
    const lineHint = safeNumber(ann?.span?.start?.line) ?? undefined;

    if (startOffset !== undefined) {
        const startPos = byteOffsetToPosition(doc, cache, startOffset, lineHint);
        const endPos =
            endOffset !== undefined
                ? byteOffsetToPosition(doc, cache, endOffset, lineHint)
                : new vscode.Position(startPos.line, startPos.character + 1);
        return new vscode.Range(startPos, endPos);
    }

    const line = lineHint ?? 0;
    return new vscode.Range(line, 0, line, 1);
}

function levelToSeverity(level: string | undefined): vscode.DiagnosticSeverity {
    switch ((level ?? "").toLowerCase()) {
        case "error":
            return vscode.DiagnosticSeverity.Error;
        case "warning":
            return vscode.DiagnosticSeverity.Warning;
        case "help":
        case "hint":
            return vscode.DiagnosticSeverity.Hint;
        case "note":
        case "info":
            return vscode.DiagnosticSeverity.Information;
        default:
            return vscode.DiagnosticSeverity.Warning;
    }
}

function buildIssueMessage(issue: NonNullable<MagoJson["issues"]>[number]): string {
    const parts: string[] = [];
    const code = issue.code ? `[${issue.code}] ` : "";
    parts.push(`${code}${issue.message ?? "Lint issue"}`);
    if (issue.help) parts.push(`Help: ${issue.help}`);
    return parts.join("\n");
}

export function generateID(doc: vscode.TextDocument, range: vscode.Range): string {
    return `${fileKey(doc.uri)}:${range.start.line}:${range.start.character}:${range.end.line}:${range.end.character}`;
}

export function magoEditsToTextEdits(
    doc: vscode.TextDocument,
    cache: LineByteCache,
    edits: MagoEdit[]
): TextEdit[] {
    if (!edits || edits.length === 0) return [];

    const lastLine = doc.lineCount - 1;
    const maxBytes =
        cache.lineStartBytes[lastLine] + utf8ByteLen(doc.lineAt(lastLine).text);

    return edits.map((e) => {
        const start = clamp(e.range.start, 0, maxBytes);
        const end = clamp(e.range.end, start, maxBytes);

        const startPos = byteOffsetToPosition(doc, cache, start);
        const endPos = byteOffsetToPosition(doc, cache, end);

        return {
            start: { line: startPos.line, col: startPos.character },
            end: { line: endPos.line, col: endPos.character },
            newText: e.new_text,
        };
    });
}

/**
 * Build the VS Code Diagnostic + corresponding MagoFix for a parsed issue.
 * (No caching here; store module owns persistence.)
 */
function buildIssueDiagnosticAndFix(
    doc: vscode.TextDocument,
    cache: LineByteCache,
    input: MagoIssue
): vscode.Diagnostic {
    const range = annotationToRange(doc, cache, input.primaryAnn);

    const sev = levelToSeverity(input.level);
    const baseMsg = buildIssueMessage({
        level: input.level,
        code: input.code,
        message: input.message,
        help: input.help,
    } as any);

    const annMsg = input.primaryAnn?.message
        ? `\nAnnotation: ${String(input.primaryAnn.message)}`
        : "";

    const diagnostic = new vscode.Diagnostic(range, `${baseMsg}${annMsg}`, sev);
    diagnostic.source = "mago";
    if (input.code) diagnostic.code = String(input.code);

    const id = generateID(doc, range);

    const fix: MagoFix = {
        id,
        category: input.category ? String(input.category) : "mago",
        code: input.code ? String(input.code) : undefined,
        msg: `${baseMsg}${annMsg}`,
        level: input.level,
        range: {
            start: { line: range.start.line, col: range.start.character },
            end: { line: range.end.line, col: range.end.character },
        },
        edits: magoEditsToTextEdits(doc, cache, input.safeEdits),
    };

    putFix(doc.uri, fix);

    return diagnostic;
}

export function buildIssuesDiagnostic(
    doc: vscode.TextDocument,
    issues: MagoIssue[]
): vscode.Diagnostic[] {
    const cache = buildLineByteCache(doc);
    const diagnostics: vscode.Diagnostic[] = [];

    for (let i = 0; i < issues.length; i++) {
        diagnostics.push(buildIssueDiagnosticAndFix(doc, cache, issues[i]));
    }

    return diagnostics;
}
