// Helper utility functions
import { sprintKickoffAnchorDate } from "./config";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_SPRINT_KICKOFF_ANCHOR_DATE = new Date(2025, 0, 6);

const parseDateOnly = (value: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
};

const sprintKickoffAnchor = (() => {
  const parsed = parseDateOnly(sprintKickoffAnchorDate);
  if (!parsed) {
    console.warn(
      `[Scheduler] Invalid SPRINT_KICKOFF_ANCHOR_DATE="${sprintKickoffAnchorDate}", falling back to 2025-01-06`
    );
    return DEFAULT_SPRINT_KICKOFF_ANCHOR_DATE;
  }

  if (parsed.getDay() !== 1) {
    console.warn(
      `[Scheduler] SPRINT_KICKOFF_ANCHOR_DATE="${sprintKickoffAnchorDate}" is not a Monday; biweekly cadence may be misaligned`
    );
  }

  return parsed;
})();

const getCalendarDayValue = (date: Date): number =>
  Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());

const diffInCalendarDays = (date: Date, anchor: Date): number =>
  Math.round((getCalendarDayValue(date) - getCalendarDayValue(anchor)) / MS_PER_DAY);

const isBiweeklyOccurrence = (date: Date, weekday: number, offsetFromKickoffDays: number): boolean => {
  if (date.getDay() !== weekday) {
    return false;
  }

  const diffDays = diffInCalendarDays(date, sprintKickoffAnchor);
  if (diffDays < 0) {
    return false;
  }

  return diffDays % 14 === offsetFromKickoffDays;
};

export const formatDate = (date: Date): string => {
  return date.toLocaleString("en-NZ", {
    timeZone: "Pacific/Auckland",
    dateStyle: "medium",
    timeStyle: "medium",
  });
};

export const isLastDayOfMonth = (date: Date): boolean => {
  const nextDay = new Date(date);
  nextDay.setDate(date.getDate() + 1);
  return nextDay.getDate() === 1;
};

export const getISOWeekNumber = (date: Date): number => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
};

export const isSprintWeek = (date: Date): boolean => {
  return getISOWeekNumber(date) % 2 === 1;
};

// Sprint kickoff repeats every 14 days from the configured kickoff anchor Monday.
export const isSprintKickoffMonday = (date: Date): boolean => isBiweeklyOccurrence(date, 1, 0);

// Mid-sprint check-in lands 7 days after each kickoff.
export const isMidSprintCheckInMonday = (date: Date): boolean => isBiweeklyOccurrence(date, 1, 7);

// Sprint review lands 11 days after kickoff, on the Friday of week two.
export const isSprintReviewFriday = (date: Date): boolean => isBiweeklyOccurrence(date, 5, 11);

// Check if date is the 2nd or 4th Wednesday of the month
export const isSecondOrFourthWednesday = (date: Date): boolean => {
  if (date.getDay() !== 3) return false; // Not Wednesday
  const dayOfMonth = date.getDate();
  // 2nd Wednesday: day 8-14, 4th Wednesday: day 22-28
  return (dayOfMonth >= 8 && dayOfMonth <= 14) || (dayOfMonth >= 22 && dayOfMonth <= 28);
};

export const isSecondSaturday = (date: Date): boolean => {
  if (date.getDay() !== 6) return false; // Not Saturday
  const dayOfMonth = date.getDate();
  return dayOfMonth >= 8 && dayOfMonth <= 14;
};

export const getNZDate = (): Date => {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Pacific/Auckland" }));
};
