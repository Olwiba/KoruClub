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
  const weekNum = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
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

  // Find old active goals
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

    // Mark old goal as carried over
    await db.goal.update({
      where: { id: old.id },
      data: { status: "carried_over" },
    });

    // Create new goal in current sprint
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

  // Group by sprint
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

  // Find patterns - simple keyword extraction from goal texts
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

  // Calculate streak (consecutive sprints with completions)
  const sprintsWithCompletions = [
    ...new Set(
      userGoals
        .filter((g) => g.status === "completed")
        .map((g) => g.sprintNum)
    ),
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
