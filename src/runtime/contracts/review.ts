export interface RuntimeRuleValidation {
  schemaVersion: "1";
  validationId: string;
  decisionId: string;
  createdAt: string;
  passed: boolean;
  blockedReasons: string[];
  warnings: string[];
  checkedRules: string[];
  summaryKo: string;
}

export interface RuntimeReview {
  schemaVersion: "1";
  reviewId: string;
  decisionId: string;
  validationId: string;
  createdAt: string;
  approved: boolean;
  blockedReasons: string[];
  riskFlags: string[];
  operatorActionRequired: boolean;
  reviewSummaryKo: string;
  reviewNotesEn: string;
}

export function validateRuntimeRuleValidation(value: unknown): RuntimeRuleValidation {
  const validation = expectRecord(value, "validation");
  expectLiteral(validation.schemaVersion, "1", "validation.schemaVersion");
  expectString(validation.validationId, "validation.validationId");
  expectString(validation.decisionId, "validation.decisionId");
  expectString(validation.createdAt, "validation.createdAt");
  expectBoolean(validation.passed, "validation.passed");
  expectStringArray(validation.blockedReasons, "validation.blockedReasons");
  expectStringArray(validation.warnings, "validation.warnings");
  expectStringArray(validation.checkedRules, "validation.checkedRules");
  expectString(validation.summaryKo, "validation.summaryKo");
  return validation as unknown as RuntimeRuleValidation;
}

export function validateRuntimeReview(value: unknown): RuntimeReview {
  const review = expectRecord(value, "review");
  expectLiteral(review.schemaVersion, "1", "review.schemaVersion");
  expectString(review.reviewId, "review.reviewId");
  expectString(review.decisionId, "review.decisionId");
  expectString(review.validationId, "review.validationId");
  expectString(review.createdAt, "review.createdAt");
  const approved = expectBoolean(review.approved, "review.approved");
  const blockedReasons = expectStringArray(review.blockedReasons, "review.blockedReasons");
  expectStringArray(review.riskFlags, "review.riskFlags");
  expectBoolean(review.operatorActionRequired, "review.operatorActionRequired");
  const reviewSummaryKo = expectString(review.reviewSummaryKo, "review.reviewSummaryKo");
  const reviewNotesEn = expectString(review.reviewNotesEn, "review.reviewNotesEn");
  rejectPlaceholder(reviewSummaryKo, "review.reviewSummaryKo");
  rejectPlaceholder(reviewNotesEn, "review.reviewNotesEn");
  if (approved === false && blockedReasons.length === 0) {
    throw new Error("review.blockedReasons must contain at least one concrete reason when approved=false.");
  }
  return review as unknown as RuntimeReview;
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function expectString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value;
}

function expectBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }

  return value;
}

function expectStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }

  return value.map((entry, index) => expectString(entry, `${label}[${index}]`));
}

function expectLiteral<T extends string>(value: unknown, expected: T, label: string): T {
  if (value !== expected) {
    throw new Error(`${label} must be ${expected}.`);
  }

  return expected;
}

function rejectPlaceholder(value: string, label: string): void {
  const normalized = value.toLowerCase();
  const blocked = [
    "replace this placeholder",
    "초안",
    "ai가 최종 검토를 채우기 전까지는 보수적으로 보류합니다"
  ];
  if (blocked.some((entry) => normalized.includes(entry))) {
    throw new Error(`${label} must not contain placeholder text.`);
  }
}
