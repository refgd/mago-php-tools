import * as vscode from "vscode";
import { registerMagoReportView, ReportViewSpec } from "../shared/reportView";

export function registerLintProject(context: vscode.ExtensionContext): void {
  const spec: ReportViewSpec = {
    kind: "lint",
    viewId: "magoPhpTools.lintProjectView",
    scheme: "mago-lint-project",

    cmdRun: "magoPhpTools.lintProject",
    cmdRefresh: "magoPhpTools.lintProject.refresh",
    cmdClear: "magoPhpTools.lintProject.clear",
    cmdOpenFile: "magoPhpTools.lintProject.openFile",
    cmdOpenIssue: "magoPhpTools.lintProject.openIssue",

    hasrunContextKey: "magoLintProject.hasrun",
    viewTitle: "Mago Lint",

    baseArgs: ["lint"]
  };

  registerMagoReportView(context, spec);
}
