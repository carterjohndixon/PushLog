/**
 * PushLog AI mode definitions: system prompts, prompt modifiers, temperatures.
 * The JSON output schema is the same for every mode.
 */

export type PushlogMode =
  | "clean_summary"
  | "slack_friendly"
  | "detailed_engineering"
  | "executive_summary"
  | "incident_aware";

export const PUSHLOG_MODES: readonly PushlogMode[] = [
  "clean_summary",
  "slack_friendly",
  "detailed_engineering",
  "executive_summary",
  "incident_aware",
] as const;

export interface PushlogModeConfig {
  label: string;
  description: string;
  systemPrompt: string;
  promptModifier: string;
  temperature: number;
}

export const PUSHLOG_MODE_CONFIG: Record<PushlogMode, PushlogModeConfig> = {
  clean_summary: {
    label: "Clean Summary",
    description: "Balanced developer-friendly summaries optimized for readability and signal.",
    systemPrompt:
      "You are a senior software engineer summarizing git commits for a development team. Provide clear, concise, and useful summaries of code changes. Prioritize readability, accuracy, and signal over fluff. Always respond with valid JSON only.",
    promptModifier: "Optimize for a balanced developer-friendly summary.",
    temperature: 0.3,
  },
  slack_friendly: {
    label: "Slack-Friendly",
    description: "Short, scannable summaries designed for quick reading in Slack.",
    systemPrompt:
      "You are summarizing git commits for a Slack notification. Keep summaries concise, clear, and highly scannable. Prioritize what changed and why it matters. Avoid unnecessary jargon unless it is critical for understanding. Always respond with valid JSON only.",
    promptModifier: "Keep all fields concise and optimized for quick reading in Slack.",
    temperature: 0.2,
  },
  detailed_engineering: {
    label: "Detailed Engineering",
    description: "Technical deep-dives with implementation details for engineers.",
    systemPrompt:
      "You are a senior software engineer performing a technical review of git changes. Provide more technical detail about implementation, structure, and code-level impact. Assume the reader is an engineer. Always respond with valid JSON only.",
    promptModifier: "Include more technical implementation detail in the details field.",
    temperature: 0.35,
  },
  executive_summary: {
    label: "Executive Summary",
    description: "Non-technical summaries focused on business value and user outcomes.",
    systemPrompt:
      "You are explaining code changes to a non-technical stakeholder. Focus on user-facing outcomes, business value, and high-level purpose. Avoid deep implementation jargon. Always respond with valid JSON only.",
    promptModifier: "Frame the summary around user impact and business meaning where possible.",
    temperature: 0.3,
  },
  incident_aware: {
    label: "Incident-Aware",
    description: "Risk-focused analysis highlighting potential production issues and breaking changes.",
    systemPrompt:
      "You are a senior engineer focused on reliability, production risk, and incident prevention. Analyze code changes carefully and identify potential risks, breaking changes, and operational concerns. Pay special attention to authentication, authorization, database queries, migrations, API contracts, state management, infrastructure/config, logging, error handling, queues, retries, and operational failure points. If changes appear risky, reflect that in impact and details. Always respond with valid JSON only.",
    promptModifier: "Explicitly call out potential production risks, breaking changes, and failure points if present.",
    temperature: 0.2,
  },
};

export function isValidPushlogMode(mode: string): mode is PushlogMode {
  return PUSHLOG_MODES.includes(mode as PushlogMode);
}

export function getModeConfig(mode: PushlogMode): PushlogModeConfig {
  return PUSHLOG_MODE_CONFIG[mode] ?? PUSHLOG_MODE_CONFIG.clean_summary;
}
