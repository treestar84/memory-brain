export type SensitivePattern = {
  name: string;
  regex: RegExp;
};

export const DEFAULT_PATTERNS: SensitivePattern[] = [
  { name: "anthropic-key", regex: /sk-ant-[a-zA-Z0-9_-]{20,}/g },
  { name: "openai-key", regex: /sk-[a-zA-Z0-9]{20,}/g },
  { name: "aws-key", regex: /AKIA[0-9A-Z]{16}/g },
  { name: "jwt", regex: /eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]*/g },
  { name: "password-field", regex: /password\s*[=:]\s*["']?[^\s"']{4,}/gi },
  { name: "generic-secret", regex: /(?:secret|token|apikey|api_key)\s*[=:]\s*["']?[^\s"']{8,}/gi },
];
