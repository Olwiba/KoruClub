// Goal extraction and completion handling
import type { Message } from "whatsapp-web.js";

import { COMPLETION_KEYWORDS, KICKOFF_WINDOW_HOURS } from "../config";
import { lastKickoffMessageId, lastKickoffTime } from "../state";
import { getActiveGoals, addGoals, completeGoal } from "../goalStore";
import { isLLMReady, extractGoals, matchCompletions, generateResponse } from "../llm";

export const handleGoalMessage = async (message: Message, content: string) => {
  const userId = message.author || message.from;

  // Check if reply to kickoff (goal setting)
  const quotedMsg = await message.getQuotedMessage().catch(() => null);
  const isReplyToKickoff =
    quotedMsg &&
    (quotedMsg.id._serialized === lastKickoffMessageId ||
      quotedMsg.body.includes("Sprint Kickoff") ||
      quotedMsg.body.includes("What are your main goals"));

  // Check if within 48-hour kickoff window
  const isWithinKickoffWindow =
    lastKickoffTime && Date.now() - lastKickoffTime.getTime() < KICKOFF_WINDOW_HOURS * 60 * 60 * 1000;

  // Capture goals if replying to kickoff OR within the 48hr window
  const shouldExtractGoals = isReplyToKickoff || isWithinKickoffWindow;

  if (shouldExtractGoals && isLLMReady()) {
    // Check if user already has goals this sprint to avoid duplicates
    const existingGoals = await getActiveGoals(userId);
    const hasRecentGoals = existingGoals.length > 0;

    // Only auto-extract (non-reply) if user doesn't have goals yet
    if (isReplyToKickoff || !hasRecentGoals) {
      const extractedGoals = await extractGoals(content);

      if (extractedGoals.length > 0) {
        await addGoals(userId, extractedGoals);

        const response = await generateResponse("goal_captured", { goals: extractedGoals });
        const goalsList = extractedGoals.map((g, i) => `${i + 1}. ${g}`).join("\n");

        await message.reply(
          response || `✅ Got it! I've captured your goals:\n\n${goalsList}\n\n_I'll track these for you this sprint!_`
        );
      }
    }
  }

  // Check for completion keywords
  const hasCompletionKeyword = COMPLETION_KEYWORDS.some((kw) => content.toLowerCase().includes(kw.toLowerCase()));

  if (hasCompletionKeyword && isLLMReady()) {
    const activeGoals = await getActiveGoals(userId);

    if (activeGoals.length > 0) {
      const matches = await matchCompletions(content, activeGoals);

      const completedGoals: string[] = [];
      for (const match of matches) {
        if (match.confidence === "high" || match.confidence === "medium") {
          const goal = await completeGoal(userId, match.goalId);
          if (goal) {
            completedGoals.push(goal.text);
            console.log(`[Completion] Marked goal as done: ${goal.text}`);
          }
        }
      }

      if (completedGoals.length > 0) {
        const response = await generateResponse("goal_completed", { completedGoals });
        await message.react("🎉");
        if (response && completedGoals.length > 1) {
          await message.reply(response);
        }
      }
    }
  }
};
