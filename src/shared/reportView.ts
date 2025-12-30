import * as vscode from "vscode";
import { FileIssue, MagoIssue } from "./mago/types";
import { buildIssuesDiagnostic, sameFile } from "./mago/parse";
import { setDiagnostics } from "./mago/store";
import { runMagoAndParse } from "./mago/run";

export type ReportKind = "analyze" | "lint";

export type ReportViewSpec = {
    kind: ReportKind;

    // VS Code view id (contributes.views)
    viewId: string;

    // unique virtual scheme for decorations
    scheme: string;

    // commands (must exist in package.json contributes.commands)
    cmdRun: string;
    cmdRefresh: string;
    cmdClear: string;
    cmdOpenFile: string;
    cmdOpenIssue: string;

    // context keys used for view/title buttons and visibility
    visibleContextKey: string;

    // labels
    viewTitle: string; // for status messages etc.

    // mago subcommand args (without config fallback)
    // example: ["analyze", "--reporting-format", "json"]
    baseArgs: string[];
};

type Node =
    | { kind: "empty" }
    | { kind: "file"; file: FileIssue }
    | { kind: "issue"; file: FileIssue; issue: MagoIssue };

// ---------- URI helpers ----------
function fileUri(spec: ReportViewSpec, filePath: string): vscode.Uri {
    return vscode.Uri.from({ scheme: spec.scheme, path: `/file/${encodeURIComponent(filePath)}` });
}
function issueUri(spec: ReportViewSpec, filePath: string, issueIndex: number): vscode.Uri {
    return vscode.Uri.from({
        scheme: spec.scheme,
        path: `/issue/${encodeURIComponent(filePath)}/${issueIndex}`
    });
}
function decodeFileUri(spec: ReportViewSpec, uri: vscode.Uri): string | null {
    if (uri.scheme !== spec.scheme) return null;
    const m = uri.fsPath.match(/^\/file\/(.+)$/);
    if (!m) return null;
    try {
        return decodeURIComponent(m[1]);
    } catch {
        return null;
    }
}
function decodeIssueUri(
    spec: ReportViewSpec,
    uri: vscode.Uri
): { filePath: string; issueIndex: number } | null {
    if (uri.scheme !== spec.scheme) return null;
    const m = uri.fsPath.match(/^\/issue\/(.+)\/(\d+)$/);
    if (!m) return null;
    try {
        return { filePath: decodeURIComponent(m[1]), issueIndex: Number(m[2]) };
    } catch {
        return null;
    }
}

// ---------- display helpers ----------
function relLabel(absPath: string, magoRoot: string | null): string {
    if (!magoRoot) return absPath;
    const root = magoRoot.endsWith("/") ? magoRoot : magoRoot + "/";
    return absPath.startsWith(root) ? absPath.slice(root.length) : absPath;
}
function buildTooltip(issue: MagoIssue): string {
    const lines: string[] = [];
    if (issue.level) lines.push(`Severity: ${issue.level}`);
    if (issue.code) lines.push(`Code: ${issue.code}`);
    if (issue.hasSafeFix) lines.push(`Auto-fix: available (safe)`);
    if (issue.message) lines.push(`Message: ${issue.message}`);
    if (issue.help) lines.push(`Help: ${issue.help}`);
    return lines.join("\n");
}
function issueThemeIcon(issue: MagoIssue): vscode.ThemeIcon {
    switch ((issue.level ?? "").toLowerCase()) {
        case "error":
            return new vscode.ThemeIcon("error");
        case "warning":
            return new vscode.ThemeIcon("warning");
        case "note":
        case "info":
            return new vscode.ThemeIcon("info");
        case "help":
        case "hint":
            return new vscode.ThemeIcon("lightbulb");
        default:
            return new vscode.ThemeIcon("circle-outline");
    }
}
function issueBadge(level?: string, hasSafeFix?: boolean): {
    badge: string;
    color: vscode.ThemeColor;
    tooltip: string;
} {
    const lv = (level ?? "").toLowerCase();
    const star = hasSafeFix ? "*" : "";
    if (lv === "error") {
        return {
            badge: (`E${star}`).slice(0, 2),
            color: new vscode.ThemeColor("problemsErrorIcon.foreground"),
            tooltip: hasSafeFix ? "Error (safe fix available)" : "Error"
        };
    }
    if (lv === "warning") {
        return {
            badge: (`W${star}`).slice(0, 2),
            color: new vscode.ThemeColor("problemsWarningIcon.foreground"),
            tooltip: hasSafeFix ? "Warning (safe fix available)" : "Warning"
        };
    }
    if (lv === "note" || lv === "info") {
        return {
            badge: (`I${star}`).slice(0, 2),
            color: new vscode.ThemeColor("problemsInfoIcon.foreground"),
            tooltip: hasSafeFix ? "Info/Note (safe fix available)" : "Info/Note"
        };
    }
    if (lv === "help" || lv === "hint") {
        return {
            badge: (`H${star}`).slice(0, 2),
            color: new vscode.ThemeColor("editorLightBulb.foreground"),
            tooltip: hasSafeFix ? "Help/Hint (safe fix available)" : "Help/Hint"
        };
    }
    return {
        badge: (`?${star}`).slice(0, 2),
        color: new vscode.ThemeColor("foreground"),
        tooltip: hasSafeFix ? "Issue (safe fix available)" : "Issue"
    };
}


// ---------- doc helpers ----------
async function openDocByMagoPath(filePath: string): Promise<vscode.TextDocument> {
    const uri = vscode.Uri.parse(`file://${filePath}`);
    return vscode.workspace.openTextDocument(uri);
}

async function revealSingleIssue(doc: vscode.TextDocument, issue: MagoIssue): Promise<void> {
    const diagnostics = buildIssuesDiagnostic(doc, [issue]);

    // show ONLY this issue in Problems + expose its safe fix to CodeActions
    setDiagnostics(doc.uri, diagnostics);

    if(diagnostics.length > 0){
        const diagnostic = diagnostics[0];
        
        const editor = await vscode.window.showTextDocument(doc, { preview: false });
        editor.selection = new vscode.Selection(diagnostic.range.start, diagnostic.range.end);
        editor.revealRange(diagnostic.range, vscode.TextEditorRevealType.InCenter);
    }
}

// ---------- Decorations ----------
class ReportDecorationProvider implements vscode.FileDecorationProvider {

    private issuesByFile = new Map<string, FileIssue>();

    constructor(private spec: ReportViewSpec) { }

    setIssues(groups: FileIssue[]) {
        this.issuesByFile.clear();
        for (const g of groups) this.issuesByFile.set(g.filePath, g);
    }

    clear() {
        this.issuesByFile.clear();
    }

    provideFileDecoration(uri: vscode.Uri): vscode.ProviderResult<vscode.FileDecoration> {
        const filePath = decodeFileUri(this.spec, uri);
        if (filePath) {
            const g = this.issuesByFile.get(filePath);
            if (!g) return;
            const count = g.issues.length;
            if (count <= 0) return;
            return {
                badge: count > 99 ? "99" : String(count),
                tooltip: `${count} mago issue${count === 1 ? "" : "s"}`,
                color: new vscode.ThemeColor("foreground")
            };
        }

        const issueKey = decodeIssueUri(this.spec, uri);
        if (issueKey) {
            const g = this.issuesByFile.get(issueKey.filePath);
            if (!g) return;
            const iss = g?.issues.find((x) => x.issueIndex === issueKey.issueIndex);
            if (!iss) return;
            const b = issueBadge(iss.level, iss.hasSafeFix);
            return { badge: b.badge, tooltip: b.tooltip, color: b.color };
        }

        return;
    }
}

// ---------- Tree Provider ----------
class ReportTreeProvider implements vscode.TreeDataProvider<Node> {
    private _onDidChangeTreeData = new vscode.EventEmitter<Node | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    
    private state: "idle" | "running" | "ran" = "idle";

    private issues: FileIssue[] = [];
    magoRoot: string | null = null;

    private docCache = new Map<string, vscode.TextDocument>();

    constructor(private spec: ReportViewSpec, private decorations: ReportDecorationProvider) { }
    
    setRunning(magoRoot: string | null) {
        this.state = "running";
        this.magoRoot = magoRoot;
        this.issues = [];
        this.docCache.clear();
        this.decorations.clear();
        this._onDidChangeTreeData.fire();
        vscode.commands.executeCommand("setContext", this.spec.visibleContextKey, false);
    }

    setResults(magoRoot: string | null, issues: FileIssue[]) {
        this.state = "ran";
        this.magoRoot = magoRoot;
        this.issues = issues;
        this.decorations.setIssues(issues);
        this._onDidChangeTreeData.fire();
        vscode.commands.executeCommand("setContext", this.spec.visibleContextKey, true);
    }

    clear() {
        this.state = "idle";
        this.magoRoot = null;
        this.issues = [];
        this.docCache.clear();
        this.decorations.clear();
        this._onDidChangeTreeData.fire();
        vscode.commands.executeCommand("setContext", this.spec.visibleContextKey, false);
    }

    getTreeItem(element: Node): vscode.TreeItem {
        if (element.kind === "empty") {
            const label =
                this.state === "idle"
                    ? `Run ${this.spec.viewTitle}`
                    : this.state === "running"
                        ? `Running ${this.spec.viewTitle}…`
                        : "No issues found";

            const icon =
                this.state === "idle"
                    ? "play"
                    : this.state === "running"
                        ? "sync~spin"
                        : "check";

            const ti = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
            ti.contextValue = `${this.spec.kind}Empty`;
            ti.iconPath = new vscode.ThemeIcon(icon);
            ti.tooltip = `${this.spec.viewTitle}: ${label}`;
            return ti;
        }

        if (element.kind === "file") {
            const ti = new vscode.TreeItem(
                relLabel(element.file.filePath, this.magoRoot),
                vscode.TreeItemCollapsibleState.Collapsed
            );

            ti.resourceUri = fileUri(this.spec, element.file.filePath);
            ti.tooltip = element.file.filePath;
            ti.contextValue = `${this.spec.kind}File`;
            ti.iconPath = new vscode.ThemeIcon("file");
            ti.command = {
                command: this.spec.cmdOpenFile,
                title: "Open File",
                arguments: [element.file.filePath]
            };
            return ti;
        }

        const issue = element.issue;
        const msg = issue.code ? `[${issue.code}] ${issue.message ?? "Issue"}` : issue.message ?? "Issue";

        const ti = new vscode.TreeItem(msg, vscode.TreeItemCollapsibleState.None);
        ti.resourceUri = issueUri(this.spec, issue.filePath, issue.issueIndex);
        ti.contextValue = `${this.spec.kind}Issue`;
        ti.iconPath = issueThemeIcon(issue);
        ti.tooltip = buildTooltip(issue);
        ti.command = {
            command: this.spec.cmdOpenIssue,
            title: "Open Issue",
            arguments: [issue.filePath, issue.issueIndex]
        };
        return ti;
    }

    async getChildren(element?: Node): Promise<Node[]> {
        if (!element) {
            if (this.issues.length === 0) {
                return [{ kind: "empty" }];
            }
            return this.issues.map((g) => ({ kind: "file", file: g }));
        }

        if (element.kind === "file") {
            return element.file.issues.map((iss) => ({ kind: "issue", file: element.file, issue: iss }));
        }

        return [];
    }

    private async openDoc(filePath: string): Promise<vscode.TextDocument> {
        const cached = this.docCache.get(filePath);
        if (cached) return cached;
        const doc = await openDocByMagoPath(filePath);
        this.docCache.set(filePath, doc);
        return doc;
    }

    async openFile(filePath: string) {
        const doc = await this.openDoc(filePath);
        await vscode.window.showTextDocument(doc, { preview: false });
    }

    async openIssue(filePath: string, issueIndex: number) {
        const group = this.issues.find((g) => sameFile(g.filePath, filePath));
        const issue = group?.issues.find((x) => x.issueIndex === issueIndex);

        if (!group || !issue) {
            vscode.window.showWarningMessage(`${this.spec.viewTitle}: issue not found (re-run).`);
            return;
        }

        const doc = await this.openDoc(filePath);
        await revealSingleIssue(doc, issue);
    }
}

function sortIssues(issues: Map<string, FileIssue>): FileIssue[] {
    return [...issues.values()].sort((a, b) => a.filePath.localeCompare(b.filePath));
}

// ---------- runner (shared) ----------
async function runReport(
    spec: ReportViewSpec,
    provider: ReportTreeProvider,
    context: vscode.ExtensionContext,
    doc: vscode.TextDocument
) {
    provider.setRunning(null);

    const res = await runMagoAndParse(doc, spec.baseArgs, context);

    if(res.code !== 0){
        if(res.msg) vscode.window.showErrorMessage(res.msg);
        provider.clear();
        return;
    }
    const magoRoot = res.magoRoot;

    if(!res.issues || res.issues.size === 0){
        provider.setResults(magoRoot, []);
        return;
    }

    const issues = sortIssues(res.issues);
    provider.setResults(magoRoot, issues);
}

// ---------- public factory ----------
export function registerMagoReportView(context: vscode.ExtensionContext, spec: ReportViewSpec): void {
    const decorations = new ReportDecorationProvider(spec);
    const provider = new ReportTreeProvider(spec, decorations);

    // view UI
    const treeView = vscode.window.createTreeView(spec.viewId, {
        treeDataProvider: provider,
        showCollapseAll: true
    });
    context.subscriptions.push(treeView);

    // decorations
    context.subscriptions.push(vscode.window.registerFileDecorationProvider(decorations));

    // commands
    context.subscriptions.push(
        vscode.commands.registerCommand(spec.cmdRun, async () => {
            const activeDoc = vscode.window.activeTextEditor?.document;
            if(!activeDoc) return;

            await vscode.commands.executeCommand(`${spec.viewId}.focus`);
            await runReport(spec, provider, context, activeDoc);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(spec.cmdRefresh, async () => {
            const activeDoc = vscode.window.activeTextEditor?.document;
            if(!activeDoc) return;

            await runReport(spec, provider, context, activeDoc);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(spec.cmdClear, () => {
            provider.clear();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(spec.cmdOpenFile, async (filePath: string) => {
            await provider.openFile(filePath);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(spec.cmdOpenIssue, async (filePath: string, issueIndex: number) => {
            await provider.openIssue(filePath, issueIndex);
        })
    );
}
