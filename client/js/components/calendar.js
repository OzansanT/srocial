function validDate(value, name) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError(`${name} must be a valid date`);
  return date;
}

function localMidnight(value) {
  const date = validDate(value, 'date');
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addLocalDays(value, days) {
  const date = localMidnight(value);
  date.setDate(date.getDate() + days);
  return date;
}

export function localDateKey(value) {
  const date = validDate(value, 'date');
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getCalendarDays(mode, anchor = new Date()) {
  const normalizedMode = String(mode ?? '').trim().toLowerCase();
  const date = localMidnight(anchor);

  if (normalizedMode === 'day') return [date];

  const startOfWeek = addLocalDays(date, -date.getDay());
  if (normalizedMode === 'week') {
    return Array.from({ length: 7 }, (_, index) => addLocalDays(startOfWeek, index));
  }

  if (normalizedMode !== 'month') throw new TypeError('mode must be month, week, or day');

  const firstOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  const lastOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const gridStart = addLocalDays(firstOfMonth, -firstOfMonth.getDay());
  const gridEnd = addLocalDays(lastOfMonth, 6 - lastOfMonth.getDay());
  const days = [];
  for (let cursor = gridStart; cursor <= gridEnd; cursor = addLocalDays(cursor, 1)) days.push(cursor);
  return days;
}

export function moveCalendarAnchor(mode, anchor, direction) {
  const date = validDate(anchor, 'anchor');
  const delta = Number(direction);
  if (!Number.isInteger(delta) || delta === 0) throw new TypeError('direction must be a non-zero integer');
  const normalizedMode = String(mode ?? '').trim().toLowerCase();
  if (normalizedMode === 'month') return new Date(date.getFullYear(), date.getMonth() + delta, 1);
  if (normalizedMode === 'week') return addLocalDays(date, delta * 7);
  if (normalizedMode === 'day') return addLocalDays(date, delta);
  throw new TypeError('mode must be month, week, or day');
}

export function rescheduleIsoForDrop(originalIso, targetLocalDate) {
  const original = validDate(originalIso, 'originalIso');
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(targetLocalDate ?? '').trim());
  if (!match) throw new TypeError('targetLocalDate must use YYYY-MM-DD');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const result = new Date(
    year,
    month - 1,
    day,
    original.getHours(),
    original.getMinutes(),
    original.getSeconds(),
    original.getMilliseconds()
  );
  if (result.getFullYear() !== year || result.getMonth() !== month - 1 || result.getDate() !== day) {
    throw new TypeError('targetLocalDate is invalid');
  }
  return result.toISOString();
}
