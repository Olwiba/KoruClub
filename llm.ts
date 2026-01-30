import { Ollama } from "ollama";
import type { Goal } from "./goalStore";

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

// Extract goals from a user's message
export const extractGoals = async (message: string): Promise<string[]> => {
  if (!modelReady) {
    console.warn("LLM not ready, skipping goal extraction");
    return [];
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

    // Parse the response - try to extract JSON array
    const text = response.response.trim();
    const match = text.match(/\[[\s\S]*\]/);
    
    if (match) {
      const goals = JSON.parse(match[0]);
      if (Array.isArray(goals)) {
        return goals.filter((g) => typeof g === "string" && g.length > 0);
      }
    }
    
    console.warn("Could not parse goals from LLM response:", text);
    return [];
  } catch (error) {
    console.error("Error extracting goals:", error);
    return [];
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
    const goalsText = activeGoals
      .map((g, i) => `${i + 1}. [${g.id}] ${g.text}`)
      .join("\n");

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
            m.goalId &&
            activeGoals.some((g) => g.id === m.goalId) &&
            ["high", "medium", "low"].includes(m.confidence)
        );
      }
    }
    
    return [];
  } catch (error) {
    console.error("Error matching completions:", error);
    return [];
  }
};

// Generate a brief encouraging response
export const generateResponse = async (
  context: "goal_captured" | "goal_completed" | "check_in",
  data: { goals?: string[]; completedGoals?: string[]; userName?: string }
): Promise<string | null> => {
  if (!modelReady) {
    return null;
  }

  try {
    let prompt = "";
    
    switch (context) {
      case "goal_captured":
        prompt = `Generate a brief (1-2 sentences) encouraging acknowledgment for someone who just set these sprint goals: ${data.goals?.join(", ")}. Be casual and supportive. Include one relevant emoji.`;
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

    return response.response.trim();
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

    // Build context for the LLM
    const currentGoalsList = activeGoals.length > 0
      ? activeGoals.map((g) => `- ${g.text}`).join("\n")
      : "No active goals set yet";

    const sprintHistory = history.sprints
      .map((s) => `Sprint ${s.sprintNumber}: ${s.completed}/${s.total} completed`)
      .join("\n");

    const carriedOverList = history.patterns.frequentlyCarriedOver.length > 0
      ? history.patterns.frequentlyCarriedOver.join(", ")
      : "None";

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

export const isLLMReady = () => modelReady;
