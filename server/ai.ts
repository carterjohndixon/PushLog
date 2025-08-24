import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface PushEventData {
  repositoryName: string;
  branch: string;
  commitMessage: string;
  filesChanged: string[];
  additions: number;
  deletions: number;
  commitSha: string;
}

export interface CodeSummary {
  summary: string;
  impact: 'low' | 'medium' | 'high';
  category: string;
  details: string;
}

export async function generateCodeSummary(pushData: PushEventData): Promise<CodeSummary> {
  try {
    const prompt = `
You are a code review assistant. Analyze this git push and provide a concise, helpful summary.

Repository: ${pushData.repositoryName}
Branch: ${pushData.branch}
Commit Message: ${pushData.commitMessage}
Files Changed: ${pushData.filesChanged.join(', ')}
Changes: +${pushData.additions} -${pushData.deletions} lines

Please provide a summary in this JSON format:
{
  "summary": "Brief 1-2 sentence summary of what changed",
  "impact": "low|medium|high - based on the scope and nature of changes",
  "category": "feature|bugfix|refactor|docs|test|other",
  "details": "More detailed explanation of the changes and their purpose"
}

Focus on:
- What functionality was added/modified/fixed
- The business impact or user benefit
- Any important technical details
- Keep it concise but informative

Respond with only valid JSON:
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a helpful code review assistant that provides clear, concise summaries of code changes. Always respond with valid JSON."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
      max_completion_tokens: 350,
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      throw new Error('No response from OpenAI');
    }

    // Parse the JSON response
    const summary = JSON.parse(response) as CodeSummary;
    
    return summary;
  } catch (error) {
    console.error('Error generating code summary:', error);
    
    // Fallback summary if AI fails
    return {
      summary: `Updated ${pushData.filesChanged.length} files with ${pushData.additions} additions and ${pushData.deletions} deletions`,
      impact: 'medium',
      category: 'other',
      details: `Changes made to ${pushData.filesChanged.join(', ')}`
    };
  }
}

export async function generateSlackMessage(pushData: PushEventData, summary: CodeSummary): Promise<string> {
  const impactEmoji = {
    low: ':large_green_circle:',
    medium: ':large_yellow_circle:', 
    high: ':red_circle:'
  };

  const categoryEmoji: Record<string, string> = {
    feature: ':sparkles:',
    bugfix: ':bug:',
    refactor: ':wrench:',
    docs: ':books:',
    test: ':test_tube:',
    other: ':memo:'
  };

  return `*${pushData.repositoryName}* - ${pushData.branch} branch

${impactEmoji[summary.impact]} *${summary.summary}*

${categoryEmoji[summary.category]} **${summary.category.toUpperCase()}** | :bar_chart: +${pushData.additions} -${pushData.deletions} lines
${summary.details}

<https://github.com/${pushData.repositoryName}/commit/${pushData.commitSha}|View Commit>`;
}
