import OpenAI from 'openai';
import dotenv from 'dotenv';
import { calculateTokenCost } from './stripe';

dotenv.config();

// AI summary generation (OpenAI + OpenRouter, e.g. x-ai/grok-4.1-fast)
// Push trigger for webhook test.

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

export interface AiUsageResult {
  summary: CodeSummary;
  tokensUsed: number;
  cost: number; // in cents
  actualModel?: string; // The actual model used by OpenAI
}

export interface GenerateCodeSummaryOptions {
  /** When set, use OpenRouter with this API key and treat model as OpenRouter model id (e.g. openai/gpt-4o). No PushLog credit deduction. */
  openRouterApiKey?: string;
}

export async function generateCodeSummary(
  pushData: PushEventData, 
  model: string = 'gpt-5.2', // PushLog: gpt-5.2, gpt-4o, etc. OpenRouter: e.g. openai/gpt-4o, anthropic/claude-3.5-sonnet
  maxTokens: number = 1000,
  options?: GenerateCodeSummaryOptions
): Promise<AiUsageResult> {
  const useOpenRouter = !!options?.openRouterApiKey?.trim();
  const client = useOpenRouter
    ? new OpenAI({
        apiKey: options!.openRouterApiKey!.trim(),
        baseURL: 'https://openrouter.ai/api/v1',
      })
    : openai;

  // For PushLog-only: migrate invalid models to gpt-5.2
  if (!useOpenRouter) {
    const validModels = ['gpt-5.2', 'gpt-5.1', 'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4-turbo-preview', 'gpt-4-0125-preview', 'gpt-4-1106-preview', 'gpt-4', 'gpt-4-0613', 'gpt-3.5-turbo', 'gpt-3.5-turbo-0125', 'gpt-3.5-turbo-1106', 'gpt-3.5-turbo-16k'];
    if (!validModels.includes(model)) {
      console.warn(`⚠️ Invalid or deprecated model "${model}" detected. Migrating to gpt-5.2.`);
      model = 'gpt-5.2';
    }
  }

  try {
    const prompt = `
You are a world-class code review assistant tasked with analyzing a git push and providing a concise, helpful summary of the highest level of detail possible. Analyze this git push and provide a concise, helpful summary.

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

    console.log(`🔍 ${useOpenRouter ? 'OpenRouter' : 'OpenAI'} API Request - Model: ${model}, Max Tokens: ${maxTokens}`);
    const requestParams: any = {
      model: model,
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
      max_completion_tokens: maxTokens,
      temperature: 0.3, // All supported models support temperature
    };
    
    let completion;
    try {
      completion = await client.chat.completions.create(requestParams);
    } catch (apiError: any) {
      console.error('❌ OpenAI API Error Details:');
      console.error('   Status:', apiError?.status);
      console.error('   Message:', apiError?.message);
      console.error('   Code:', apiError?.code);
      console.error('   Type:', apiError?.type);
      console.error('   Param:', apiError?.param);
      if (apiError?.error) {
        console.error('   Error Object:', JSON.stringify(apiError.error, null, 2));
      }
      if (apiError?.response) {
        console.error('   Response:', JSON.stringify(apiError.response, null, 2));
      }
      throw apiError; // Re-throw to be caught by outer catch
    }

    // Log the actual model used by OpenAI (in case of model fallback)
    const actualModel = completion.model;
    
    const response = completion.choices[0]?.message?.content;
    if (!response) {
      throw new Error('No response from OpenAI');
    }

    let jsonString = response.trim();
    
    // Remove markdown code blocks if present
    if (jsonString.startsWith('```json')) {
      jsonString = jsonString.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonString.startsWith('```')) {
      jsonString = jsonString.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    // Parse the JSON response
    let summary: CodeSummary;
    try {
      summary = JSON.parse(jsonString) as CodeSummary;
    } catch (parseError) {
      console.error('❌ Failed to parse AI response as JSON:', parseError);
      console.error('📄 Raw AI response:', jsonString);
      throw new Error(`Failed to parse AI response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
    }
    
    // Validate summary structure
    if (!summary.summary || !summary.impact || !summary.category) {
      console.error('❌ Invalid AI response structure:', summary);
      throw new Error('AI response missing required fields');
    }
    
    // Calculate usage and cost (OpenRouter: user pays; we don't deduct PushLog credits)
    const tokensUsed = completion.usage?.total_tokens || 0;
    const cost = useOpenRouter ? 0 : calculateTokenCost(model, tokensUsed);
    
    console.log(`✅ AI summary generated - Model: ${actualModel}, Tokens: ${tokensUsed}${useOpenRouter ? '' : `, Cost: $${(cost / 100).toFixed(4)}`}`);
    
    return {
      summary,
      tokensUsed,
      cost,
      actualModel // Include the actual model used
    };
  } catch (error) {
    console.error('❌ Error generating code summary:', error);
    console.error('📊 Model attempted:', model);
    console.error('📊 Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined
    });
    console.error('📊 Push data:', {
      repository: pushData.repositoryName,
      branch: pushData.branch,
      filesChanged: pushData.filesChanged.length,
      additions: pushData.additions,
      deletions: pushData.deletions
    });
    
    // Fallback summary if AI fails (use correct additions/deletions values)
    return {
      summary: {
        summary: `Updated ${pushData.filesChanged.length} files with ${pushData.additions || 0} additions and ${pushData.deletions || 0} deletions`,
        impact: 'medium',
        category: 'other',
        details: `Changes made to ${pushData.filesChanged.join(', ')}`
      },
      tokensUsed: 0,
      cost: 0
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

  // Ensure impact is a valid key, default to medium if not
  const impact = (summary.impact && impactEmoji[summary.impact]) ? summary.impact : 'medium';
  const category = summary.category || 'other';

  return `*${pushData.repositoryName}* - ${pushData.branch} branch 

${impactEmoji[impact]} *${summary.summary}*

${categoryEmoji[category]} **${category.toUpperCase()}** | :bar_chart: +${pushData.additions} -${pushData.deletions} lines
${summary.details}

🔗 <https://github.com/${pushData.repositoryName}/commit/${pushData.commitSha}|View Commit>`;
}