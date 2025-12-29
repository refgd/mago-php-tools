import * as vscode from "vscode";
import { registerMagoReportView, ReportViewSpec } from "./reportView";

export const MAGO_LINT_PROJECT_VIEW_ID = "magoPhpTools.lintProjectView";

export function registerLintProjectView(context: vscode.ExtensionContext): void {
  const spec: ReportViewSpec = {
    kind: "lint",
    viewId: MAGO_LINT_PROJECT_VIEW_ID,
    scheme: "mago-lint-project",

    cmdRun: "magoPhpTools.lintProject",
    cmdRefresh: "magoPhpTools.lintProject.refresh",
    cmdClear: "magoPhpTools.lintProject.clear",
    cmdOpenFile: "magoPhpTools.lintProject.openFile",
    cmdOpenIssue: "magoPhpTools.lintProject.openIssue",

    visibleContextKey: "magoLintProject.visible",
    viewTitle: "Mago Lint",

    baseArgs: ["lint"]
  };

  registerMagoReportView(context, spec);
}
