import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

export interface Goal {
  id: string;
  text: string;
  status: "active" | "completed" | "carried_over";
  createdAt: string;
  completedAt?: string;
  sprintNumber: number;
}

export interface UserGoals {
  goals: Goal[];
  currentSprint: number;
}

export interface GoalStore {
  [userId: string]: UserGoals;
}

const DATA_DIR = "./data";
const GOALS_FILE = `${DATA_DIR}/goals.json`;

// Ensure data directory exists
const ensureDataDir = () => {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
};

// Load goals from file
export const loadGoals = (): GoalStore => {
  ensureDataDir();
  if (!existsSync(GOALS_FILE)) {
    return {};
  }
  try {
    const data = readFileSync(GOALS_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    console.error("Error loading goals, starting fresh");
    return {};
  }
};

// Save goals to file
export const saveGoals = (store: GoalStore): void => {
  ensureDataDir();
  writeFileSync(GOALS_FILE, JSON.stringify(store, null, 2));
};

// Get current sprint number based on ISO week
export const getCurrentSprintNumber = (): number => {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  // Sprint number = ceil(weekNum / 2) since sprints are bi-weekly
  return Math.ceil(weekNum / 2);
};

// Initialize user if not exists
export const ensureUser = (store: GoalStore, userId: string): void => {
  if (!store[userId]) {
    store[userId] = {
      goals: [],
      currentSprint: getCurrentSprintNumber(),
    };
  }
};

// Add goals for a user
export const addGoals = (
  store: GoalStore,
  userId: string,
  goalTexts: string[]
): Goal[] => {
  ensureUser(store, userId);
  const sprintNum = getCurrentSprintNumber();
  
  const newGoals: Goal[] = goalTexts.map((text, idx) => ({
    id: `${userId}-${sprintNum}-${Date.now()}-${idx}`,
    text,
    status: "active",
    createdAt: new Date().toISOString(),
    sprintNumber: sprintNum,
  }));

  store[userId].goals.push(...newGoals);
  store[userId].currentSprint = sprintNum;
  saveGoals(store);
  
  return newGoals;
};

// Get active goals for a user
export const getActiveGoals = (store: GoalStore, userId: string): Goal[] => {
  if (!store[userId]) return [];
  return store[userId].goals.filter((g) => g.status === "active");
};

// Get goals for current sprint
export const getCurrentSprintGoals = (store: GoalStore, userId: string): Goal[] => {
  if (!store[userId]) return [];
  const currentSprint = getCurrentSprintNumber();
  return store[userId].goals.filter(
    (g) => g.sprintNumber === currentSprint && g.status === "active"
  );
};

// Mark a goal as completed
export const completeGoal = (store: GoalStore, userId: string, goalId: string): Goal | null => {
  if (!store[userId]) return null;
  
  const goal = store[userId].goals.find((g) => g.id === goalId);
  if (goal) {
    goal.status = "completed";
    goal.completedAt = new Date().toISOString();
    saveGoals(store);
    return goal;
  }
  return null;
};

// Carry over incomplete goals to next sprint
export const carryOverGoals = (store: GoalStore, userId: string): Goal[] => {
  if (!store[userId]) return [];
  
  const currentSprint = getCurrentSprintNumber();
  const carriedOver: Goal[] = [];
  
  store[userId].goals.forEach((goal) => {
    if (goal.status === "active" && goal.sprintNumber < currentSprint) {
      goal.status = "carried_over";
      // Create new goal for current sprint
      const newGoal: Goal = {
        id: `${userId}-${currentSprint}-${Date.now()}-carried`,
        text: goal.text,
        status: "active",
        createdAt: new Date().toISOString(),
        sprintNumber: currentSprint,
      };
      store[userId].goals.push(newGoal);
      carriedOver.push(newGoal);
    }
  });
  
  if (carriedOver.length > 0) {
    saveGoals(store);
  }
  
  return carriedOver;
};

// Get sprint summary for a user
export const getSprintSummary = (
  store: GoalStore,
  userId: string,
  sprintNumber?: number
): { completed: Goal[]; active: Goal[]; carriedOver: Goal[] } => {
  if (!store[userId]) {
    return { completed: [], active: [], carriedOver: [] };
  }
  
  const sprint = sprintNumber ?? getCurrentSprintNumber();
  const goals = store[userId].goals.filter((g) => g.sprintNumber === sprint);
  
  return {
    completed: goals.filter((g) => g.status === "completed"),
    active: goals.filter((g) => g.status === "active"),
    carriedOver: goals.filter((g) => g.status === "carried_over"),
  };
};

// Get all users with active goals
export const getUsersWithActiveGoals = (store: GoalStore): string[] => {
  return Object.keys(store).filter((userId) => 
    store[userId].goals.some((g) => g.status === "active")
  );
};
