export type MagoJson = {
  issues?: Array<{
    level?: string; // Error|Warning|Note|Help...
    code?: string;
    category?: string;
    message?: string;
    notes?: string[];
    help?: string;
    annotations?: Array<{
      message?: string;
      kind?: string; // Primary|Secondary
      span?: {
        file_id?: { path?: string; name?: string };
        start?: { offset?: number; line?: number };
        end?: { offset?: number; line?: number };
      };
    }>;
    edits?: Array<
      [
        { path?: string; name?: string; size?: number; file_type?: string },
        MagoEdit[]
      ]
    >;
  }>;
};

export type MagoEdit = {
  range: { start: number; end: number };
  new_text: string;
  safety?: string; // "safe"
};

export type TextPosition = {
  line: number;
  col: number;
};

export type TextEdit = {
  start: TextPosition;
  end: TextPosition;
  newText: string;
};

export type MagoIssue = {
  issueIndex: number;
  category?: string;
  level?: string;
  code?: string;
  message?: string;
  help?: string;
  filePath: string;
  primaryAnn: any;
  safeEdits: MagoEdit[];
  hasSafeFix: boolean;
};

export type MagoFix = {
  id: string;
  category?: string;
  code?: string;
  msg: string;
  level?: string;
  range: {
    start: TextPosition;
    end: TextPosition;
  };
  edits: TextEdit[];
};

export type FileIssue = {
  filePath: string;
  issues: MagoIssue[];
};
