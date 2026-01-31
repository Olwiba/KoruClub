import { db } from "./db";
import type { Goal as PrismaGoal } from "@prisma/client";

export interface Goal {
  id: string;
  userId: string;
  text: string;
  status: "active" | "completed" | "carried_over";
  createdAt: string;
  completedAt: string | null;
  sprintNumber: number;
}

// Convert Prisma Goal to our Goal interface
const toGoal = (g: PrismaGoal): Goal => ({
  id: g.id,
  userId: g.userId,
  text: g.text,
  status: g.status as "active" | "completed" | "carried_over",
  createdAt: g.createdAt.toISOString(),
  completedAt: g.completedAt?.toISOString() ?? null,
  sprintNumber: g.sprintNum,
});

// Get current sprint number based on ISO week
export const getCurrentSprintNumber = (): number => {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return Math.ceil(weekNum / 2);
};

// Initialize goals (just logs count)
export const loadGoals = async (): Promise<void> => {
  const count = await db.goal.count();
  console.log(`Goals DB ready: ${count} goals in database`);
};

// Add goals for a user
export const addGoals = async (userId: string, goalTexts: string[]): Promise<Goal[]> => {
  const sprintNum = getCurrentSprintNumber();
  const now = new Date();
  const newGoals: Goal[] = [];

  for (let idx = 0; idx < goalTexts.length; idx++) {
    const text = goalTexts[idx];
    const id = `${userId}-${sprintNum}-${Date.now()}-${idx}`;

    const created = await db.goal.create({
      data: {
        id,
        userId,
        text,
        status: "active",
        sprintNum,
        createdAt: now,
      },
    });

    newGoals.push(toGoal(created));
  }

  return newGoals;
};

// Get active goals for a user
export const getActiveGoals = async (userId: string): Promise<Goal[]> => {
  const goals = await db.goal.findMany({
    where: { userId, status: "active" },
  });
  return goals.map(toGoal);
};

// Get goals for current sprint
export const getCurrentSprintGoals = async (userId: string): Promise<Goal[]> => {
  const currentSprint = getCurrentSprintNumber();
  const goals = await db.goal.findMany({
    where: {
      userId,
      sprintNum: currentSprint,
      status: "active",
    },
  });
  return goals.map(toGoal);
};

// Mark a goal as completed
export const completeGoal = async (userId: string, goalId: string): Promise<Goal | null> => {
  try {
    const updated = await db.goal.update({
      where: { id: goalId },
      data: {
        status: "completed",
        completedAt: new Date(),
      },
    });

    if (updated.userId !== userId) {
      return null;
    }

    return toGoal(updated);
  } catch {
    return null;
  }
};

// Carry over incomplete goals to next sprint
export const carryOverGoals = async (userId: string): Promise<Goal[]> => {
  const currentSprint = getCurrentSprintNumber();
  const now = new Date();

  const oldGoals = await db.goal.findMany({
    where: {
      userId,
      status: "active",
      sprintNum: { lt: currentSprint },
    },
  });

  if (oldGoals.length === 0) return [];

  const carriedOver: Goal[] = [];

  for (let idx = 0; idx < oldGoals.length; idx++) {
    const old = oldGoals[idx];

    await db.goal.update({
      where: { id: old.id },
      data: { status: "carried_over" },
    });

    const newGoal = await db.goal.create({
      data: {
        id: `${userId}-${currentSprint}-${Date.now()}-carried-${idx}`,
        userId,
        text: old.text,
        status: "active",
        sprintNum: currentSprint,
        createdAt: now,
      },
    });

    carriedOver.push(toGoal(newGoal));
  }

  return carriedOver;
};

// Get sprint summary for a user
export const getSprintSummary = async (
  userId: string,
  sprintNumber?: number
): Promise<{ completed: Goal[]; active: Goal[]; carriedOver: Goal[] }> => {
  const sprint = sprintNumber ?? getCurrentSprintNumber();

  const goals = await db.goal.findMany({
    where: { userId, sprintNum: sprint },
  });

  const mapped = goals.map(toGoal);

  return {
    completed: mapped.filter((g) => g.status === "completed"),
    active: mapped.filter((g) => g.status === "active"),
    carriedOver: mapped.filter((g) => g.status === "carried_over"),
  };
};

// Get all users with active goals
export const getUsersWithActiveGoals = async (): Promise<string[]> => {
  const goals = await db.goal.findMany({
    where: { status: "active" },
    select: { userId: true },
    distinct: ["userId"],
  });
  return goals.map((g) => g.userId);
};

// Get goal history for a user across multiple sprints
export const getGoalHistory = async (
  userId: string,
  sprintCount: number = 3
): Promise<{
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
}> => {
  const currentSprint = getCurrentSprintNumber();
  const startSprint = Math.max(1, currentSprint - sprintCount + 1);

  const allGoals = await db.goal.findMany({
    where: {
      userId,
      sprintNum: { gte: startSprint, lte: currentSprint },
    },
    orderBy: { sprintNum: "desc" },
  });

  const mapped = allGoals.map(toGoal);

  const sprintMap = new Map<number, Goal[]>();
  for (let i = startSprint; i <= currentSprint; i++) {
    sprintMap.set(i, []);
  }
  for (const goal of mapped) {
    const existing = sprintMap.get(goal.sprintNumber) || [];
    existing.push(goal);
    sprintMap.set(goal.sprintNumber, existing);
  }

  const sprints = Array.from(sprintMap.entries())
    .map(([sprintNumber, goals]) => ({
      sprintNumber,
      goals,
      completed: goals.filter((g) => g.status === "completed").length,
      total: goals.length,
    }))
    .sort((a, b) => b.sprintNumber - a.sprintNumber);

  const completedGoals = mapped.filter((g) => g.status === "completed").map((g) => g.text.toLowerCase());
  const carriedOverGoals = mapped.filter((g) => g.status === "carried_over").map((g) => g.text.toLowerCase());

  return {
    sprints,
    patterns: {
      frequentlyCompleted: completedGoals.slice(0, 5),
      frequentlyCarriedOver: carriedOverGoals.slice(0, 5),
    },
  };
};

// Get stats for a user
export const getUserStats = async (
  userId: string
): Promise<{
  totalGoals: number;
  completedGoals: number;
  completionRate: number;
  currentStreak: number;
}> => {
  const userGoals = await db.goal.findMany({
    where: { userId },
  });

  const total = userGoals.length;
  const completed = userGoals.filter((g) => g.status === "completed").length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  const sprintsWithCompletions = [
    ...new Set(userGoals.filter((g) => g.status === "completed").map((g) => g.sprintNum)),
  ].sort((a, b) => b - a);

  let streak = 0;
  const currentSprint = getCurrentSprintNumber();
  for (let i = 0; i < sprintsWithCompletions.length; i++) {
    if (sprintsWithCompletions[i] === currentSprint - i) {
      streak++;
    } else {
      break;
    }
  }

  return {
    totalGoals: total,
    completedGoals: completed,
    completionRate,
    currentStreak: streak,
  };
};

// ============================================
// ADMIN STATS - Aggregate statistics for admin
// ============================================

export interface AdminStats {
  totalUsers: number;
  totalGoals: number;
  activeGoals: number;
  completedGoals: number;
  carriedOverGoals: number;
  overallCompletionRate: number;
  currentSprintNumber: number;
  currentSprintStats: {
    goals: number;
    completed: number;
    activeUsers: number;
  };
  topPerformers: {
    userId: string;
    completedGoals: number;
    completionRate: number;
  }[];
  recentActivity: {
    goalsSetLast7Days: number;
    goalsCompletedLast7Days: number;
  };
}

export const getAdminStats = async (): Promise<AdminStats> => {
  const currentSprint = getCurrentSprintNumber();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Get all goals
  const allGoals = await db.goal.findMany();

  // Total unique users
  const uniqueUsers = [...new Set(allGoals.map((g) => g.userId))];

  // Status counts
  const activeGoals = allGoals.filter((g) => g.status === "active").length;
  const completedGoals = allGoals.filter((g) => g.status === "completed").length;
  const carriedOverGoals = allGoals.filter((g) => g.status === "carried_over").length;

  // Current sprint stats
  const currentSprintGoals = allGoals.filter((g) => g.sprintNum === currentSprint);
  const currentSprintUsers = [...new Set(currentSprintGoals.map((g) => g.userId))];
  const currentSprintCompleted = currentSprintGoals.filter((g) => g.status === "completed").length;

  // Overall completion rate (completed / total excluding carried_over which are duplicates)
  const totalNonCarried = allGoals.filter((g) => g.status !== "carried_over").length;
  const overallCompletionRate = totalNonCarried > 0 ? Math.round((completedGoals / totalNonCarried) * 100) : 0;

  // Top performers (by completion rate, min 3 goals)
  const userStats: Record<string, { total: number; completed: number }> = {};
  for (const goal of allGoals) {
    if (goal.status === "carried_over") continue;
    if (!userStats[goal.userId]) {
      userStats[goal.userId] = { total: 0, completed: 0 };
    }
    userStats[goal.userId].total++;
    if (goal.status === "completed") {
      userStats[goal.userId].completed++;
    }
  }

  const topPerformers = Object.entries(userStats)
    .filter(([_, stats]) => stats.total >= 3)
    .map(([userId, stats]) => ({
      userId,
      completedGoals: stats.completed,
      completionRate: Math.round((stats.completed / stats.total) * 100),
    }))
    .sort((a, b) => b.completionRate - a.completionRate)
    .slice(0, 5);

  // Recent activity
  const goalsSetLast7Days = allGoals.filter((g) => new Date(g.createdAt) >= sevenDaysAgo).length;
  const goalsCompletedLast7Days = allGoals.filter(
    (g) => g.completedAt && new Date(g.completedAt) >= sevenDaysAgo
  ).length;

  return {
    totalUsers: uniqueUsers.length,
    totalGoals: allGoals.length,
    activeGoals,
    completedGoals,
    carriedOverGoals,
    overallCompletionRate,
    currentSprintNumber: currentSprint,
    currentSprintStats: {
      goals: currentSprintGoals.length,
      completed: currentSprintCompleted,
      activeUsers: currentSprintUsers.length,
    },
    topPerformers,
    recentActivity: {
      goalsSetLast7Days,
      goalsCompletedLast7Days,
    },
  };
};

// Get DB summary for LLM context (used by admin chat)
export const getDBSummaryForLLM = async (): Promise<string> => {
  const stats = await getAdminStats();
  const currentSprint = getCurrentSprintNumber();

  // Get recent goals with more detail for context
  const recentGoals = await db.goal.findMany({
    where: { sprintNum: { gte: currentSprint - 2 } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const goalsByStatus = {
    active: recentGoals.filter((g) => g.status === "active"),
    completed: recentGoals.filter((g) => g.status === "completed"),
    carriedOver: recentGoals.filter((g) => g.status === "carried_over"),
  };

  return `
DATABASE SUMMARY (KoruClub Goal Tracking):

OVERALL STATS:
- Total users: ${stats.totalUsers}
- Total goals ever set: ${stats.totalGoals}
- Goals completed: ${stats.completedGoals} (${stats.overallCompletionRate}% completion rate)
- Currently active goals: ${stats.activeGoals}
- Carried over (incomplete): ${stats.carriedOverGoals}

CURRENT SPRINT (#${stats.currentSprintNumber}):
- Goals set: ${stats.currentSprintStats.goals}
- Completed: ${stats.currentSprintStats.completed}
- Active users: ${stats.currentSprintStats.activeUsers}

RECENT ACTIVITY (Last 7 days):
- Goals set: ${stats.recentActivity.goalsSetLast7Days}
- Goals completed: ${stats.recentActivity.goalsCompletedLast7Days}

TOP PERFORMERS:
${stats.topPerformers.map((p, i) => `${i + 1}. User ${p.userId.slice(-6)}: ${p.completedGoals} completed (${p.completionRate}%)`).join("\n")}

SAMPLE RECENT GOALS (last 3 sprints):
Active: ${goalsByStatus.active.slice(0, 10).map((g) => `"${g.text}"`).join(", ")}
Completed: ${goalsByStatus.completed.slice(0, 10).map((g) => `"${g.text}"`).join(", ")}
`.trim();
};
