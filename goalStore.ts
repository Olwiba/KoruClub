import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";

export interface Goal {
  id: string;
  userId: string;
  text: string;
  status: "active" | "completed" | "carried_over";
  createdAt: string;
  completedAt: string | null;
  sprintNumber: number;
}

// GoalStore is now just a marker type - DB is managed internally
export type GoalStore = Record<string, never>;

const DATA_DIR = "./data";
const DB_FILE = `${DATA_DIR}/goals.db`;

let db: Database.Database | null = null;

// Ensure data directory exists and initialize DB
const ensureDb = (): Database.Database => {
  if (db) return db;

  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  db = new Database(DB_FILE);
  
  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      completed_at TEXT,
      sprint_number INTEGER NOT NULL
    );
    
    CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id);
    CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);
    CREATE INDEX IF NOT EXISTS idx_goals_sprint ON goals(sprint_number);
  `);

  console.log("SQLite database initialized");
  return db;
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

// Initialize the database and return empty store for compatibility
export const loadGoals = (): GoalStore => {
  ensureDb();
  return {};
};

// Add goals for a user
export const addGoals = (
  _store: GoalStore,
  userId: string,
  goalTexts: string[]
): Goal[] => {
  const database = ensureDb();
  const sprintNum = getCurrentSprintNumber();
  const now = new Date().toISOString();

  const insert = database.prepare(`
    INSERT INTO goals (id, user_id, text, status, created_at, sprint_number)
    VALUES (?, ?, ?, 'active', ?, ?)
  `);

  const newGoals: Goal[] = [];

  const insertMany = database.transaction(() => {
    goalTexts.forEach((text, idx) => {
      const id = `${userId}-${sprintNum}-${Date.now()}-${idx}`;
      insert.run(id, userId, text, now, sprintNum);
      newGoals.push({
        id,
        userId,
        text,
        status: "active",
        createdAt: now,
        completedAt: null,
        sprintNumber: sprintNum,
      });
    });
  });

  insertMany();
  return newGoals;
};

// Get active goals for a user
export const getActiveGoals = (_store: GoalStore, userId: string): Goal[] => {
  const database = ensureDb();
  const rows = database.prepare(`
    SELECT id, user_id as userId, text, status, created_at as createdAt, 
           completed_at as completedAt, sprint_number as sprintNumber
    FROM goals 
    WHERE user_id = ? AND status = 'active'
    ORDER BY created_at DESC
  `).all(userId) as Goal[];
  
  return rows;
};

// Get goals for current sprint
export const getCurrentSprintGoals = (_store: GoalStore, userId: string): Goal[] => {
  const database = ensureDb();
  const currentSprint = getCurrentSprintNumber();
  
  const rows = database.prepare(`
    SELECT id, user_id as userId, text, status, created_at as createdAt,
           completed_at as completedAt, sprint_number as sprintNumber
    FROM goals 
    WHERE user_id = ? AND sprint_number = ? AND status = 'active'
    ORDER BY created_at DESC
  `).all(userId, currentSprint) as Goal[];
  
  return rows;
};

// Mark a goal as completed
export const completeGoal = (_store: GoalStore, userId: string, goalId: string): Goal | null => {
  const database = ensureDb();
  const now = new Date().toISOString();
  
  const result = database.prepare(`
    UPDATE goals 
    SET status = 'completed', completed_at = ?
    WHERE id = ? AND user_id = ?
  `).run(now, goalId, userId);

  if (result.changes === 0) return null;

  const goal = database.prepare(`
    SELECT id, user_id as userId, text, status, created_at as createdAt,
           completed_at as completedAt, sprint_number as sprintNumber
    FROM goals WHERE id = ?
  `).get(goalId) as Goal | undefined;

  return goal || null;
};

// Carry over incomplete goals to next sprint
export const carryOverGoals = (_store: GoalStore, userId: string): Goal[] => {
  const database = ensureDb();
  const currentSprint = getCurrentSprintNumber();
  const now = new Date().toISOString();

  // Get goals to carry over
  const oldGoals = database.prepare(`
    SELECT id, text FROM goals 
    WHERE user_id = ? AND status = 'active' AND sprint_number < ?
  `).all(userId, currentSprint) as { id: string; text: string }[];

  if (oldGoals.length === 0) return [];

  const carriedOver: Goal[] = [];

  const carryOver = database.transaction(() => {
    // Mark old goals as carried over
    database.prepare(`
      UPDATE goals SET status = 'carried_over'
      WHERE user_id = ? AND status = 'active' AND sprint_number < ?
    `).run(userId, currentSprint);

    // Create new goals for current sprint
    const insert = database.prepare(`
      INSERT INTO goals (id, user_id, text, status, created_at, sprint_number)
      VALUES (?, ?, ?, 'active', ?, ?)
    `);

    oldGoals.forEach((old, idx) => {
      const id = `${userId}-${currentSprint}-${Date.now()}-carried-${idx}`;
      insert.run(id, userId, old.text, now, currentSprint);
      carriedOver.push({
        id,
        userId,
        text: old.text,
        status: "active",
        createdAt: now,
        completedAt: null,
        sprintNumber: currentSprint,
      });
    });
  });

  carryOver();
  return carriedOver;
};

// Get sprint summary for a user
export const getSprintSummary = (
  _store: GoalStore,
  userId: string,
  sprintNumber?: number
): { completed: Goal[]; active: Goal[]; carriedOver: Goal[] } => {
  const database = ensureDb();
  const sprint = sprintNumber ?? getCurrentSprintNumber();

  const goals = database.prepare(`
    SELECT id, user_id as userId, text, status, created_at as createdAt,
           completed_at as completedAt, sprint_number as sprintNumber
    FROM goals 
    WHERE user_id = ? AND sprint_number = ?
  `).all(userId, sprint) as Goal[];

  return {
    completed: goals.filter((g) => g.status === "completed"),
    active: goals.filter((g) => g.status === "active"),
    carriedOver: goals.filter((g) => g.status === "carried_over"),
  };
};

// Get all users with active goals
export const getUsersWithActiveGoals = (_store: GoalStore): string[] => {
  const database = ensureDb();
  const rows = database.prepare(`
    SELECT DISTINCT user_id FROM goals WHERE status = 'active'
  `).all() as { user_id: string }[];
  
  return rows.map((r) => r.user_id);
};

// Get stats for a user
export const getUserStats = (_store: GoalStore, userId: string): {
  totalGoals: number;
  completedGoals: number;
  completionRate: number;
  currentStreak: number;
} => {
  const database = ensureDb();
  
  const total = database.prepare(`
    SELECT COUNT(*) as count FROM goals WHERE user_id = ?
  `).get(userId) as { count: number };

  const completed = database.prepare(`
    SELECT COUNT(*) as count FROM goals WHERE user_id = ? AND status = 'completed'
  `).get(userId) as { count: number };

  const completionRate = total.count > 0 
    ? Math.round((completed.count / total.count) * 100) 
    : 0;

  // Calculate streak (consecutive sprints with completions)
  const sprintsWithCompletions = database.prepare(`
    SELECT DISTINCT sprint_number FROM goals 
    WHERE user_id = ? AND status = 'completed'
    ORDER BY sprint_number DESC
  `).all(userId) as { sprint_number: number }[];

  let streak = 0;
  const currentSprint = getCurrentSprintNumber();
  for (let i = 0; i < sprintsWithCompletions.length; i++) {
    if (sprintsWithCompletions[i].sprint_number === currentSprint - i) {
      streak++;
    } else {
      break;
    }
  }

  return {
    totalGoals: total.count,
    completedGoals: completed.count,
    completionRate,
    currentStreak: streak,
  };
};
