import * as vscode from "vscode";
import { registerMagoReportView, ReportViewSpec } from "../shared/reportView";

export function registerAnalyzeProject(context: vscode.ExtensionContext): void {
  const spec: ReportViewSpec = {
    kind: "analyze",
    viewId: "magoPhpTools.analyzeProjectView",
    scheme: "mago-analyze",

    cmdRun: "magoPhpTools.analyzeProject",
    cmdRefresh: "magoPhpTools.analyzeProject.refresh",
    cmdClear: "magoPhpTools.analyzeProject.clear",
    cmdOpenFile: "magoPhpTools.analyzeProject.openFile",
    cmdOpenIssue: "magoPhpTools.analyzeProject.openIssue",

    hasrunContextKey: "magoAnalyzeProject.hasrun",
    viewTitle: "Mago Analyze",

    baseArgs: ["analyze"]
  };

  registerMagoReportView(context, spec);
}
