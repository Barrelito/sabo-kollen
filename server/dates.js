const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function localParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
}

function localMidnightUtc(dateText, timeZone = 'Europe/Stockholm') {
  if (!DATE_RE.test(dateText)) throw new Error('Ogiltigt datum.');
  const [year, month, day] = dateText.split('-').map(Number);
  const target = Date.UTC(year, month - 1, day);
  const normalized = new Date(target);
  if (normalized.getUTCFullYear() !== year || normalized.getUTCMonth() !== month - 1 || normalized.getUTCDate() !== day) {
    throw new Error('Ogiltigt datum.');
  }
  let candidate = target;
  for (let i = 0; i < 3; i += 1) {
    const parts = localParts(new Date(candidate), timeZone);
    const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    candidate += target - represented;
  }
  return new Date(candidate);
}

function nextDate(dateText) {
  const [year, month, day] = dateText.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

export function stockholmRange(from, to) {
  return {
    from: from ? localMidnightUtc(from) : null,
    toExclusive: to ? localMidnightUtc(nextDate(to)) : null
  };
}
