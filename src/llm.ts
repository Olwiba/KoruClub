import { Ollama } from "ollama";
import type { Goal } from "./goalStore";
import { getDBSummaryForLLM } from "./goalStore";

const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL || "qwen2:0.5b";

const ollama = new Ollama({ host: OLLAMA_HOST });

let modelReady = false;

// Check if Ollama is available and model is pulled
export const initLLM = async (): Promise<boolean> => {
  try {
    const models = await ollama.list();
    const hasModel = models.models.some((m: { name: string }) => m.name.startsWith(MODEL.split(":")[0]));

    if (!hasModel) {
      console.log(`Model ${MODEL} not found, pulling...`);
      await ollama.pull({ model: MODEL });
    }

    modelReady = true;
    console.log(`LLM ready: ${MODEL}`);
    return true;
  } catch (error) {
    console.error("Failed to initialize LLM:", error);
    modelReady = false;
    return false;
  }
};

// Fallback regex-based goal extraction when LLM fails
const extractGoalsFallback = (message: string): string[] => {
  const goals: string[] = [];
  // Normalize special characters (zero-width spaces, etc.)
  const normalized = message.replace(/[\u200B-\u200D\uFEFF\u2060]/g, '');
  const lines = normalized.split("\n");
  
  for (const line of lines) {
    // Remove leading/trailing whitespace and special chars
    const trimmed = line.replace(/^[\s\u00A0\u2000-\u200A]+|[\s\u00A0\u2000-\u200A]+$/g, '');
    if (!trimmed) continue;
    
    // Match lines starting with emoji, bullet, number, dash, or asterisk
    const goalMatch = trimmed.match(/^(?:[\u{1F300}-\u{1FAD6}]|[-–—•*►▶→]|\d+[.):\-]?)\s*(.+)/u);
    if (goalMatch && goalMatch[1]) {
      const goalText = goalMatch[1].trim();
      if (goalText.length > 3 && goalText.length < 200) {
        goals.push(goalText);
      }
    }
  }
  
  return goals;
};

// Detect if LLM returned the prompt examples instead of actual goals
const PROMPT_EXAMPLES = [
  "finish the landing page",
  "fix the auth bug",
  "focus on testing",
  "ship v2",
  "write docs",
  "review PRs",
];

const isPromptExampleResponse = (goals: string[]): boolean => {
  const matchCount = goals.filter(g => 
    PROMPT_EXAMPLES.some(ex => g.toLowerCase().includes(ex.toLowerCase()))
  ).length;
  return matchCount >= 2;
};

// Extract goals from a user's message
export const extractGoals = async (message: string): Promise<string[]> => {
  // Try fallback first if message has clear goal markers
  const fallbackGoals = extractGoalsFallback(message);
  
  if (!modelReady) {
    console.warn("LLM not ready, using fallback goal extraction");
    return fallbackGoals;
  }

  try {
    const response = await ollama.generate({
      model: MODEL,
      prompt: `Extract the goals or tasks from this message. Return ONLY a JSON array of strings, nothing else.

Message: "${message}"

Examples:
- "I want to finish the landing page and fix the auth bug" → ["finish the landing page", "fix the auth bug"]
- "This sprint I'll focus on testing" → ["focus on testing"]
- "My goals: 1) ship v2 2) write docs 3) review PRs" → ["ship v2", "write docs", "review PRs"]

Return ONLY the JSON array:`,
      stream: false,
      options: {
        temperature: 0.1,
        num_predict: 200,
      },
    });

    const text = response.response.trim();
    const match = text.match(/\[[\s\S]*\]/);

    if (match) {
      const goals = JSON.parse(match[0]);
      if (Array.isArray(goals)) {
        const validGoals = goals.filter((g) => typeof g === "string" && g.length > 0);
        
        // Check if LLM just returned the prompt examples (hallucination)
        if (isPromptExampleResponse(validGoals)) {
          console.warn("[LLM] Detected prompt example hallucination, using fallback");
          return fallbackGoals.length > 0 ? fallbackGoals : [];
        }
        
        // If LLM found fewer goals than fallback, use fallback (LLM probably missed some)
        if (validGoals.length > 0 && validGoals.length >= fallbackGoals.length) {
          return validGoals;
        } else if (fallbackGoals.length > 0) {
          console.log(`[LLM] Using fallback extraction (${fallbackGoals.length} goals vs LLM's ${validGoals.length})`);
          return fallbackGoals;
        }
        return validGoals;
      }
    }

    console.warn("Could not parse goals from LLM response:", text);
    return fallbackGoals.length > 0 ? fallbackGoals : [];
  } catch (error) {
    console.error("Error extracting goals:", error);
    return fallbackGoals.length > 0 ? fallbackGoals : [];
  }
};

// Match a completion message to stored goals
export const matchCompletions = async (
  message: string,
  activeGoals: Goal[]
): Promise<{ goalId: string; confidence: "high" | "medium" | "low" }[]> => {
  if (!modelReady || activeGoals.length === 0) {
    return [];
  }

  try {
    const goalsText = activeGoals.map((g, i) => `${i + 1}. [${g.id}] ${g.text}`).join("\n");

    const response = await ollama.generate({
      model: MODEL,
      prompt: `A user posted an update. Match their message to completed goals from their list.

User's active goals:
${goalsText}

User's message: "${message}"

Return ONLY a JSON array of objects with goalId and confidence (high/medium/low).
Only include goals that the user has clearly completed or made significant progress on.
If no goals match, return [].

Example response: [{"goalId": "user-1-123", "confidence": "high"}]

Return ONLY the JSON array:`,
      stream: false,
      options: {
        temperature: 0.1,
        num_predict: 300,
      },
    });

    const text = response.response.trim();
    const match = text.match(/\[[\s\S]*\]/);

    if (match) {
      const matches = JSON.parse(match[0]);
      if (Array.isArray(matches)) {
        return matches.filter(
          (m) =>
            m.goalId && activeGoals.some((g) => g.id === m.goalId) && ["high", "medium", "low"].includes(m.confidence)
        );
      }
    }

    return [];
  } catch (error) {
    console.error("Error matching completions:", error);
    return [];
  }
};

// Validate LLM response doesn't contain garbage or echoed content
const isValidResponse = (response: string, originalMessage?: string): boolean => {
  if (!response || response.length < 5 || response.length > 500) {
    return false;
  }
  
  // Check for common garbage patterns
  if (response.includes("```") || response.includes("json") || response.includes("[") && response.includes("]")) {
    return false;
  }
  
  // Check if response echoes significant portion of original message
  if (originalMessage && originalMessage.length > 20) {
    const originalWords = originalMessage.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    const responseWords = response.toLowerCase().split(/\s+/);
    const matchCount = originalWords.filter(w => responseWords.includes(w)).length;
    if (matchCount > originalWords.length * 0.3) {
      console.warn("[LLM] Response appears to echo user message, discarding");
      return false;
    }
  }
  
  return true;
};

// Generate a brief encouraging response
export const generateResponse = async (
  context: "goal_captured" | "goal_completed" | "check_in",
  data: { goals?: string[]; completedGoals?: string[]; userName?: string },
  originalMessage?: string
): Promise<string | null> => {
  if (!modelReady) {
    return null;
  }

  try {
    let prompt = "";

    switch (context) {
      case "goal_captured":
        prompt = `Generate a brief (1-2 sentences) encouraging acknowledgment for someone who just set these sprint goals: ${data.goals?.join(", ")}. Be casual and supportive. Include one relevant emoji. Do NOT repeat their goals back to them.`;
        break;
      case "goal_completed":
        prompt = `Generate a brief (1 sentence) celebration for completing: ${data.completedGoals?.join(", ")}. Be enthusiastic but concise. Include one relevant emoji.`;
        break;
      case "check_in":
        prompt = `Generate a brief (1 sentence) friendly mid-sprint check-in message. Be casual and encouraging. Include one relevant emoji.`;
        break;
    }

    const response = await ollama.generate({
      model: MODEL,
      prompt,
      stream: false,
      options: {
        temperature: 0.7,
        num_predict: 100,
      },
    });

    const text = response.response.trim();
    
    if (!isValidResponse(text, originalMessage)) {
      console.warn("[LLM] Invalid response, using fallback");
      return null;
    }
    
    return text;
  } catch (error) {
    console.error("Error generating response:", error);
    return null;
  }
};

// Generate mentorship/coaching based on goal history
export const generateMentorship = async (data: {
  activeGoals: Goal[];
  history: {
    sprints: {
      sprintNumber: number;
      goals: Goal[];
      completed: number;
      total: number;
    }[];
    patterns: {
      frequentlyCompleted: string[];
      frequentlyCarriedOver: string[];
    };
  };
  stats: {
    totalGoals: number;
    completedGoals: number;
    completionRate: number;
    currentStreak: number;
  };
}): Promise<string | null> => {
  if (!modelReady) {
    return null;
  }

  try {
    const { activeGoals, history, stats } = data;

    const currentGoalsList =
      activeGoals.length > 0 ? activeGoals.map((g) => `- ${g.text}`).join("\n") : "No active goals set yet";

    const sprintHistory = history.sprints.map((s) => `Sprint ${s.sprintNumber}: ${s.completed}/${s.total} completed`).join("\n");

    const carriedOverList =
      history.patterns.frequentlyCarriedOver.length > 0 ? history.patterns.frequentlyCarriedOver.join(", ") : "None";

    const prompt = `You are a supportive mentor helping someone track their personal/professional goals in 2-week sprints.

Here's their data:

CURRENT SPRINT GOALS:
${currentGoalsList}

RECENT SPRINT HISTORY:
${sprintHistory}

STATS:
- Completion rate: ${stats.completionRate}%
- Current streak: ${stats.currentStreak} sprints with completions
- Total goals set: ${stats.totalGoals}
- Total completed: ${stats.completedGoals}

GOALS THAT WERE CARRIED OVER (not completed):
${carriedOverList}

Based on this, provide brief personalized mentorship (3-5 sentences max). Consider:
- Acknowledge their progress honestly
- If they have incomplete goals, gently explore if they're too ambitious or need breaking down
- If completion rate is high, celebrate that
- If there are patterns (same goals carried over), suggest adjustments
- Keep it casual, supportive, and actionable
- End with one specific suggestion or question to reflect on

Be concise and genuine, not generic motivational fluff.`;

    const response = await ollama.generate({
      model: MODEL,
      prompt,
      stream: false,
      options: {
        temperature: 0.7,
        num_predict: 400,
      },
    });

    return response.response.trim();
  } catch (error) {
    console.error("Error generating mentorship:", error);
    return null;
  }
};

// ============================================
// ADMIN CHAT - Conversational DB queries
// ============================================

// Admin can have a conversation with the LLM about the database
export const adminChat = async (message: string): Promise<string> => {
  if (!modelReady) {
    return "LLM is not available right now. Please try again later.";
  }

  try {
    // Get current DB context
    const dbSummary = await getDBSummaryForLLM();

    const prompt = `You are an AI assistant for KoruClub, a goal-tracking bot for a WhatsApp group running bi-weekly sprints.

You have access to the following database information:

${dbSummary}

The admin is asking you a question about the data. Answer helpfully and concisely.
If they ask about specific users, use the last 6 characters of user IDs for privacy (shown as "User abc123").
If they ask for analysis or suggestions, provide actionable insights.
If they ask about something not in the data, say so.

Admin's question: "${message}"

Your response:`;

    const response = await ollama.generate({
      model: MODEL,
      prompt,
      stream: false,
      options: {
        temperature: 0.5,
        num_predict: 600,
      },
    });

    return response.response.trim();
  } catch (error) {
    console.error("Error in admin chat:", error);
    return "Sorry, I encountered an error processing your question. Please try again.";
  }
};

export const isLLMReady = () => modelReady;
