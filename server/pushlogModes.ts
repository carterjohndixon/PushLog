/** 
 * PushLog AI mode definitions: system prompts, prompt modifiers, temperatures. 
 * The JSON output schema is the same for every mode. 
 */

export type PushLogMode =
  | "clean_summary"
  | "slack_friendly"
  | "detailed_engineering"
  | "executive_summary"
  | "incident_aware";

export const PUSHLOG_MODES: readonly PushLogMode[] = [
  "clean_summary",
  "slack_friendly",
  "detailed_engineering",
  "executive_summary",
  "incident_aware",
] as const;

export interface PushLogModeConfig {
  label: string;
  description: string;
  systemPrompt: string;
  promptModifier: string;
  temperature: number;
}

export const PUSHLOG_MODE_CONFIG: Record<PushLogMode, PushLogModeConfig> = {
  clean_summary: {
    label: "Clean Summary",
    description:
      "Balanced developer-friendly summaries optimized for readability and signal.",
    systemPrompt:
      "You are a senior software engineer summarizing git commits for a development team. Provide clear, concise, and useful summaries of code changes. Prioritize readability, accuracy, and signal over fluff. Keep the summary practical for developers scanning updates quickly. Always respond with valid JSON only.",
    promptModifier:
      "Optimize for a balanced developer-friendly summary. Make the summary field brief and clear, and use the details field for the most important technical context.",
    temperature: 0.3,
  },
  slack_friendly: {
    label: "Slack-Friendly",
    description:
      "Short, scannable summaries designed for quick reading in Slack.",
    systemPrompt:
      "You are summarizing git commits for a Slack notification. Keep summaries concise, clear, and highly scannable. Prioritize what changed and why it matters. Avoid unnecessary jargon unless it is critical for understanding. Compress the output for quick reading while preserving the key signal. Always respond with valid JSON only.",
    promptModifier:
      "Keep all fields concise and optimized for quick reading in Slack. The summary should be very short, and the details should be brief and easy to skim.",
    temperature: 0.2,
  },
  detailed_engineering: {
    label: "Detailed Engineering",
    description:
      "Technical deep-dives with implementation details for engineers.",
    systemPrompt:
      "You are a senior software engineer performing a technical review of git changes. Provide more technical detail about implementation, structure, code-level behavior, and likely developer intent. Assume the reader is an engineer and values specificity. Always respond with valid JSON only.",
    promptModifier:
      "Include meaningful implementation detail in the details field, such as architecture changes, file-level patterns, logic changes, or technical tradeoffs when they are evident from the change.",
    temperature: 0.35,
  },
  executive_summary: {
    label: "Executive Summary",
    description:
      "Non-technical summaries focused on business value and user outcomes.",
    systemPrompt:
      "You are explaining code changes to a non-technical stakeholder. Focus on user-facing outcomes, business value, product impact, and high-level purpose. Avoid deep implementation jargon, filenames, and low-level engineering detail unless essential for understanding impact. If the change is purely technical, explain its purpose in plain English. Always respond with valid JSON only.",
    promptModifier:
      "Frame the summary around customer, product, or operational impact where possible. Keep the language plain and non-technical.",
    temperature: 0.25,
  },
  incident_aware: {
    label: "Incident-Aware",
    description:
      "Risk-focused analysis highlighting potential production issues and breaking changes.",
    systemPrompt:
      "You are a senior engineer focused on reliability, production risk, and incident prevention. Analyze code changes carefully and identify potential risks, breaking changes, and operational concerns. Pay special attention to authentication, authorization, database queries, migrations, API contracts, state management, infrastructure/configuration, logging, error handling, queues, retries, and operational failure points. Be cautious but do not invent risks that are not reasonably supported by the change. If changes appear risky, reflect that in impact and details. Always respond with valid JSON only.",
    promptModifier:
      "Explicitly call out potential production risks, breaking changes, and failure points if present. Use the impact field to reflect operational risk, not just code size.",
    temperature: 0.2,
  },
};

export function isValidPushLogMode(mode: string): mode is PushLogMode {
  return PUSHLOG_MODES.includes(mode as PushLogMode);
}

export function getModeConfig(mode: PushLogMode): PushLogModeConfig {
  return PUSHLOG_MODE_CONFIG[mode] ?? PUSHLOG_MODE_CONFIG.clean_summary;
}
