export interface RuntimeTradeComment {
  schemaVersion: "1";
  commentId: string;
  createdAt: string;
  snapshotId: string;
  analysisId: string;
  decisionId: string;
  reviewId: string;
  issueNumber: number;
  issueUrl: string;
  bodyMarkdown: string;
  userSummaryKo: string;
}

export function validateRuntimeTradeComment(value: unknown): RuntimeTradeComment {
  const comment = expectRecord(value, "comment");
  expectLiteral(comment.schemaVersion, "1", "comment.schemaVersion");
  expectString(comment.commentId, "comment.commentId");
  expectString(comment.createdAt, "comment.createdAt");
  expectString(comment.snapshotId, "comment.snapshotId");
  expectString(comment.analysisId, "comment.analysisId");
  expectString(comment.decisionId, "comment.decisionId");
  expectString(comment.reviewId, "comment.reviewId");
  expectNumber(comment.issueNumber, "comment.issueNumber");
  expectString(comment.issueUrl, "comment.issueUrl");
  expectString(comment.bodyMarkdown, "comment.bodyMarkdown");
  expectString(comment.userSummaryKo, "comment.userSummaryKo");
  return comment as unknown as RuntimeTradeComment;
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function expectLiteral<T extends string>(value: unknown, expected: T, label: string): T {
  if (value !== expected) {
    throw new Error(`${label} must be ${expected}.`);
  }

  return expected;
}

function expectString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value;
}

function expectNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }

  return value;
}
