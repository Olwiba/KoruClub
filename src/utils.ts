// Helper utility functions

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

// Check if date is the 1st or 3rd Monday of the month (sprint kickoff days)
export const isFirstOrThirdMonday = (date: Date): boolean => {
  if (date.getDay() !== 1) return false; // Not Monday
  const dayOfMonth = date.getDate();
  // 1st Monday: day 1-7, 3rd Monday: day 15-21
  return (dayOfMonth >= 1 && dayOfMonth <= 7) || (dayOfMonth >= 15 && dayOfMonth <= 21);
};

// Check if date is the 2nd or 4th Friday of the month (sprint review days)
export const isSecondOrFourthFriday = (date: Date): boolean => {
  if (date.getDay() !== 5) return false; // Not Friday
  const dayOfMonth = date.getDate();
  // 2nd Friday: day 8-14, 4th Friday: day 22-28
  return (dayOfMonth >= 8 && dayOfMonth <= 14) || (dayOfMonth >= 22 && dayOfMonth <= 28);
};

// Check if date is the 2nd or 4th Wednesday of the month (mid-sprint check-in days)
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
