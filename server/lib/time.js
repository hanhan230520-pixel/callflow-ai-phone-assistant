export function pad(value) {
  return String(value).padStart(2, '0');
}

export function localDateString(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function localDateTime(date = new Date()) {
  return `${localDateString(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function addDays(dateString, amount) {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + amount);
  return localDateString(date);
}

export function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime()) && localDateString(date) === value;
}

export function isValidTimeString(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''));
}

export function timeToMinutes(value) {
  const [hour, minute] = String(value).split(':').map(Number);
  return hour * 60 + minute;
}

export function minutesToTime(value) {
  const normalized = Math.max(0, Math.min(23 * 60 + 59, value));
  return `${pad(Math.floor(normalized / 60))}:${pad(normalized % 60)}`;
}

export function minutesBetween(a, b) {
  return Math.abs(timeToMinutes(a) - timeToMinutes(b));
}

export function dateRange(days, endDate = localDateString()) {
  const result = [];
  for (let index = days - 1; index >= 0; index -= 1) result.push(addDays(endDate, -index));
  return result;
}

export function parseTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
