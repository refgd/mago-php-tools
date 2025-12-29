import * as vscode from "vscode";
import { registerMagoReportView, ReportViewSpec } from "./reportView";

export const MAGO_ANALYZE_VIEW_ID = "magoPhpTools.analyzeView";

export function registerAnalyzeView(context: vscode.ExtensionContext): void {
  const spec: ReportViewSpec = {
    kind: "analyze",
    viewId: MAGO_ANALYZE_VIEW_ID,
    scheme: "mago-analyze",

    cmdRun: "magoPhpTools.analyze",
    cmdRefresh: "magoPhpTools.analyze.refresh",
    cmdClear: "magoPhpTools.analyze.clear",
    cmdOpenFile: "magoPhpTools.analyze.openFile",
    cmdOpenIssue: "magoPhpTools.analyze.openIssue",

    visibleContextKey: "magoAnalyze.visible",
    viewTitle: "Mago Analyze",

    baseArgs: ["analyze"]
  };

  registerMagoReportView(context, spec);
}
