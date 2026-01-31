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

export const isSecondSaturday = (date: Date): boolean => {
  if (date.getDay() !== 6) return false; // Not Saturday
  const dayOfMonth = date.getDate();
  return dayOfMonth >= 8 && dayOfMonth <= 14;
};

export const getNZDate = (): Date => {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Pacific/Auckland" }));
};
