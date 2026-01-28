import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "fs";

export interface Goal {
  id: string;
  userId: string;
  text: string;
  status: "active" | "completed" | "carried_over";
  createdAt: string;
  completedAt: string | null;
  sprintNumber: number;
}

interface GoalData {
  goals: Goal[];
}

export type GoalStore = GoalData;

const DATA_DIR = "./data";
const DATA_FILE = `${DATA_DIR}/goals.json`;
const TEMP_FILE = `${DATA_DIR}/goals.tmp.json`;

// Atomic write to prevent corruption
const saveData = (data: GoalData): void => {
  writeFileSync(TEMP_FILE, JSON.stringify(data, null, 2));
  renameSync(TEMP_FILE, DATA_FILE);
};

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

// Load goals from file
export const loadGoals = (): GoalStore => {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!existsSync(DATA_FILE)) {
    const initial: GoalData = { goals: [] };
    saveData(initial);
    console.log("Goals JSON initialized");
    return initial;
  }

  try {
    const raw = readFileSync(DATA_FILE, "utf-8");
    const data = JSON.parse(raw) as GoalData;
    console.log(`Loaded ${data.goals.length} goals from storage`);
    return data;
  } catch (err) {
    console.error("Failed to load goals, starting fresh:", err);
    const initial: GoalData = { goals: [] };
    saveData(initial);
    return initial;
  }
};

// Add goals for a user
export const addGoals = (
  store: GoalStore,
  userId: string,
  goalTexts: string[]
): Goal[] => {
  const sprintNum = getCurrentSprintNumber();
  const now = new Date().toISOString();
  const newGoals: Goal[] = [];

  goalTexts.forEach((text, idx) => {
    const goal: Goal = {
      id: `${userId}-${sprintNum}-${Date.now()}-${idx}`,
      userId,
      text,
      status: "active",
      createdAt: now,
      completedAt: null,
      sprintNumber: sprintNum,
    };
    store.goals.push(goal);
    newGoals.push(goal);
  });

  saveData(store);
  return newGoals;
};

// Get active goals for a user
export const getActiveGoals = (store: GoalStore, userId: string): Goal[] => {
  return store.goals.filter((g) => g.userId === userId && g.status === "active");
};

// Get goals for current sprint
export const getCurrentSprintGoals = (store: GoalStore, userId: string): Goal[] => {
  const currentSprint = getCurrentSprintNumber();
  return store.goals.filter(
    (g) => g.userId === userId && g.sprintNumber === currentSprint && g.status === "active"
  );
};

// Mark a goal as completed
export const completeGoal = (store: GoalStore, userId: string, goalId: string): Goal | null => {
  const goal = store.goals.find((g) => g.id === goalId && g.userId === userId);
  if (!goal) return null;

  goal.status = "completed";
  goal.completedAt = new Date().toISOString();
  saveData(store);
  return goal;
};

// Carry over incomplete goals to next sprint
export const carryOverGoals = (store: GoalStore, userId: string): Goal[] => {
  const currentSprint = getCurrentSprintNumber();
  const now = new Date().toISOString();
  const carriedOver: Goal[] = [];

  // Find old active goals
  const oldGoals = store.goals.filter(
    (g) => g.userId === userId && g.status === "active" && g.sprintNumber < currentSprint
  );

  if (oldGoals.length === 0) return [];

  // Mark old goals as carried over and create new ones
  oldGoals.forEach((old, idx) => {
    old.status = "carried_over";

    const newGoal: Goal = {
      id: `${userId}-${currentSprint}-${Date.now()}-carried-${idx}`,
      userId,
      text: old.text,
      status: "active",
      createdAt: now,
      completedAt: null,
      sprintNumber: currentSprint,
    };
    store.goals.push(newGoal);
    carriedOver.push(newGoal);
  });

  saveData(store);
  return carriedOver;
};

// Get sprint summary for a user
export const getSprintSummary = (
  store: GoalStore,
  userId: string,
  sprintNumber?: number
): { completed: Goal[]; active: Goal[]; carriedOver: Goal[] } => {
  const sprint = sprintNumber ?? getCurrentSprintNumber();
  const goals = store.goals.filter((g) => g.userId === userId && g.sprintNumber === sprint);

  return {
    completed: goals.filter((g) => g.status === "completed"),
    active: goals.filter((g) => g.status === "active"),
    carriedOver: goals.filter((g) => g.status === "carried_over"),
  };
};

// Get all users with active goals
export const getUsersWithActiveGoals = (store: GoalStore): string[] => {
  const users = new Set<string>();
  store.goals.filter((g) => g.status === "active").forEach((g) => users.add(g.userId));
  return Array.from(users);
};

// Get stats for a user
export const getUserStats = (
  store: GoalStore,
  userId: string
): {
  totalGoals: number;
  completedGoals: number;
  completionRate: number;
  currentStreak: number;
} => {
  const userGoals = store.goals.filter((g) => g.userId === userId);
  const total = userGoals.length;
  const completed = userGoals.filter((g) => g.status === "completed").length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Calculate streak (consecutive sprints with completions)
  const sprintsWithCompletions = [
    ...new Set(
      userGoals
        .filter((g) => g.status === "completed")
        .map((g) => g.sprintNumber)
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
