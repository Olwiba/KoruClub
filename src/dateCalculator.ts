// Calculate actual next post dates for scheduled jobs
import {
  isFirstOrThirdMonday,
  isSecondOrFourthFriday,
  isSecondOrFourthWednesday,
  isSecondSaturday,
  isLastDayOfMonth,
  getNZDate,
} from "./utils";

export type JobType = "monday" | "friday" | "demo" | "checkIn" | "monthEnd";

export interface NextPostDate {
  jobType: JobType;
  nextDate: Date;
  label: string;
}

const JOB_LABELS: Record<JobType, string> = {
  monday: "Sprint Kickoff",
  friday: "Sprint Review",
  demo: "Demo Day",
  checkIn: "Mid-Sprint Check-in",
  monthEnd: "Monthly Celebration",
};

const JOB_TIMES: Record<JobType, { hour: number; minute: number }> = {
  monday: { hour: 9, minute: 0 },
  friday: { hour: 15, minute: 30 },
  demo: { hour: 10, minute: 0 },
  checkIn: { hour: 9, minute: 0 },
  monthEnd: { hour: 9, minute: 0 },
};

function setTimeNZ(date: Date, hour: number, minute: number): Date {
  const result = new Date(date);
  result.setHours(hour, minute, 0, 0);
  return result;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function getNextFirstOrThirdMonday(from: Date): Date {
  let candidate = new Date(from);
  // Move to start of day
  candidate.setHours(0, 0, 0, 0);
  
  // If it's past 9am on a valid Monday, start from tomorrow
  const now = getNZDate();
  if (isFirstOrThirdMonday(candidate) && candidate.toDateString() === now.toDateString()) {
    if (now.getHours() >= 9) {
      candidate = addDays(candidate, 1);
    }
  }
  
  // Search up to 31 days ahead
  for (let i = 0; i < 31; i++) {
    if (isFirstOrThirdMonday(candidate)) {
      return setTimeNZ(candidate, 9, 0);
    }
    candidate = addDays(candidate, 1);
  }
  
  // Fallback (shouldn't happen)
  return setTimeNZ(from, 9, 0);
}

export function getNextSecondOrFourthFriday(from: Date): Date {
  let candidate = new Date(from);
  candidate.setHours(0, 0, 0, 0);
  
  const now = getNZDate();
  if (isSecondOrFourthFriday(candidate) && candidate.toDateString() === now.toDateString()) {
    if (now.getHours() >= 15 || (now.getHours() === 15 && now.getMinutes() >= 30)) {
      candidate = addDays(candidate, 1);
    }
  }
  
  for (let i = 0; i < 31; i++) {
    if (isSecondOrFourthFriday(candidate)) {
      return setTimeNZ(candidate, 15, 30);
    }
    candidate = addDays(candidate, 1);
  }
  
  return setTimeNZ(from, 15, 30);
}

export function getNextSecondOrFourthWednesday(from: Date): Date {
  let candidate = new Date(from);
  candidate.setHours(0, 0, 0, 0);
  
  const now = getNZDate();
  if (isSecondOrFourthWednesday(candidate) && candidate.toDateString() === now.toDateString()) {
    if (now.getHours() >= 9) {
      candidate = addDays(candidate, 1);
    }
  }
  
  for (let i = 0; i < 31; i++) {
    if (isSecondOrFourthWednesday(candidate)) {
      return setTimeNZ(candidate, 9, 0);
    }
    candidate = addDays(candidate, 1);
  }
  
  return setTimeNZ(from, 9, 0);
}

export function getNextSecondSaturday(from: Date): Date {
  let candidate = new Date(from);
  candidate.setHours(0, 0, 0, 0);
  
  const now = getNZDate();
  if (isSecondSaturday(candidate) && candidate.toDateString() === now.toDateString()) {
    if (now.getHours() >= 10) {
      candidate = addDays(candidate, 1);
    }
  }
  
  for (let i = 0; i < 45; i++) {
    if (isSecondSaturday(candidate)) {
      return setTimeNZ(candidate, 10, 0);
    }
    candidate = addDays(candidate, 1);
  }
  
  return setTimeNZ(from, 10, 0);
}

export function getNextMonthEnd(from: Date): Date {
  let candidate = new Date(from);
  candidate.setHours(0, 0, 0, 0);
  
  const now = getNZDate();
  if (isLastDayOfMonth(candidate) && candidate.toDateString() === now.toDateString()) {
    if (now.getHours() >= 9) {
      candidate = addDays(candidate, 1);
    }
  }
  
  for (let i = 0; i < 32; i++) {
    if (isLastDayOfMonth(candidate)) {
      return setTimeNZ(candidate, 9, 0);
    }
    candidate = addDays(candidate, 1);
  }
  
  return setTimeNZ(from, 9, 0);
}

export function getActualNextPostDates(): NextPostDate[] {
  const now = getNZDate();
  
  const dates: NextPostDate[] = [
    { jobType: "monday", nextDate: getNextFirstOrThirdMonday(now), label: JOB_LABELS.monday },
    { jobType: "friday", nextDate: getNextSecondOrFourthFriday(now), label: JOB_LABELS.friday },
    { jobType: "demo", nextDate: getNextSecondSaturday(now), label: JOB_LABELS.demo },
    { jobType: "checkIn", nextDate: getNextSecondOrFourthWednesday(now), label: JOB_LABELS.checkIn },
    { jobType: "monthEnd", nextDate: getNextMonthEnd(now), label: JOB_LABELS.monthEnd },
  ];
  
  // Sort by date
  dates.sort((a, b) => a.nextDate.getTime() - b.nextDate.getTime());
  
  return dates;
}

export function getMostRecentScheduledDate(jobType: JobType, before: Date): Date | null {
  // Go back up to 14 days to find the most recent scheduled date for this job type
  let candidate = new Date(before);
  candidate.setHours(0, 0, 0, 0);
  
  const checker = getCheckerForJobType(jobType);
  const time = JOB_TIMES[jobType];
  
  for (let i = 0; i < 14; i++) {
    candidate = addDays(candidate, -1);
    if (checker(candidate)) {
      return setTimeNZ(candidate, time.hour, time.minute);
    }
  }
  
  return null;
}

function getCheckerForJobType(jobType: JobType): (date: Date) => boolean {
  switch (jobType) {
    case "monday":
      return isFirstOrThirdMonday;
    case "friday":
      return isSecondOrFourthFriday;
    case "demo":
      return isSecondSaturday;
    case "checkIn":
      return isSecondOrFourthWednesday;
    case "monthEnd":
      return isLastDayOfMonth;
  }
}

export function getJobLabel(jobType: JobType): string {
  return JOB_LABELS[jobType];
}
