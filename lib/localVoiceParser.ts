import type { ExtractedInvoiceFields } from './types';

const SMALL_NUMBERS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const ORDINALS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  eleventh: 11,
  twelfth: 12,
  thirteenth: 13,
  fourteenth: 14,
  fifteenth: 15,
  sixteenth: 16,
  seventeenth: 17,
  eighteenth: 18,
  nineteenth: 19,
  twentieth: 20,
  thirtieth: 30,
};

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function toISO(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseNumberPhrase(value: string): number | null {
  const mixedFraction = value.match(/(\d+)\s+(?:and\s+)?1\s*\/\s*2/);
  if (mixedFraction) return Number(mixedFraction[1]) + 0.5;
  const numeric = value.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (numeric) return Number(numeric[0]);

  const tokens = value
    .toLowerCase()
    .replace(/-/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  let total = 0;
  let current = 0;
  let recognized = false;
  let half = false;

  for (const token of tokens) {
    if (token === 'and' || token === 'a') continue;
    if (token === 'half') {
      half = true;
      recognized = true;
      continue;
    }
    if (token in SMALL_NUMBERS) {
      current += SMALL_NUMBERS[token];
      recognized = true;
      continue;
    }
    if (token in TENS) {
      current += TENS[token];
      recognized = true;
      continue;
    }
    if (token in ORDINALS) {
      current += ORDINALS[token];
      recognized = true;
      continue;
    }
    if (token === 'hundred') {
      current = Math.max(1, current) * 100;
      recognized = true;
      continue;
    }
    if (token === 'thousand') {
      total += Math.max(1, current) * 1000;
      current = 0;
      recognized = true;
    }
  }

  if (!recognized) return null;
  return total + current + (half ? 0.5 : 0);
}

const NUMBER_WORDS = new Set<string>([
  ...Object.keys(SMALL_NUMBERS),
  ...Object.keys(TENS),
  ...Object.keys(ORDINALS),
  'hundred',
  'thousand',
  'half',
  'and',
  'a',
]);

function trailingNumberPhrase(group: string): string | null {
  const tokens = group.split(/\s+/).filter(Boolean);
  let i = tokens.length - 1;
  while (i >= 0 && NUMBER_WORDS.has(tokens[i])) i--;
  const phrase = tokens.slice(i + 1).join(' ');
  return phrase || null;
}

function parseDate(transcript: string, now: Date): string | null {
  const text = transcript.toLowerCase();
  if (/\byesterday\b/.test(text)) {
    const date = new Date(now);
    date.setDate(date.getDate() - 1);
    return toISO(date);
  }
  if (/\btoday\b|\bthis morning\b|\bthis afternoon\b/.test(text)) return toISO(now);

  const explicit = text.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+([a-z\d-]+)(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?/
  );
  if (explicit) {
    const day = parseNumberPhrase(explicit[2]);
    const month = MONTHS[explicit[1]];
    const year = explicit[3] ? Number(explicit[3]) : now.getFullYear();
    if (day && day <= 31) return toISO(new Date(year, month - 1, day));
  }

  const iso = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return toISO(new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));

  const lastWeekday = text.match(/\blast\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (lastWeekday) {
    const target = WEEKDAYS[lastWeekday[1]];
    const date = new Date(now);
    let difference = (date.getDay() - target + 7) % 7;
    if (difference === 0) difference = 7;
    date.setDate(date.getDate() - difference);
    return toISO(date);
  }
  return null;
}

function timePhraseToMinutes(phrase: string): number | null {
  const lower = phrase.toLowerCase();
  if (/\bnoon\b/.test(lower)) return 12 * 60;
  if (/\bmidnight\b/.test(lower)) return 0;
  const isPm = /\bp\.?m\.?\b|afternoon|evening|tonight/.test(lower);
  const isAm = /\ba\.?m\.?\b|morning/.test(lower);
  const cleaned = lower
    .replace(/\b(?:in the|at)\b/g, ' ')
    .replace(/\b(?:morning|afternoon|evening|tonight|a\.?m\.?|p\.?m\.?)\b/g, ' ')
    .trim();
  const numericTime = cleaned.match(/\b(\d{1,2})(?::(\d{2}))?\b/);
  let hour: number | null = null;
  let minute = 0;

  if (numericTime) {
    hour = Number(numericTime[1]);
    minute = Number(numericTime[2] || 0);
  } else {
    const tokens = cleaned.replace(/-/g, ' ').split(/\s+/).filter(Boolean);
    if (tokens.length > 0) {
      hour = parseNumberPhrase(tokens[0]);
      if (tokens.length > 1) minute = parseNumberPhrase(tokens.slice(1).join(' ')) || 0;
    }
  }

  if (hour === null || hour > 23 || minute > 59) return null;
  if (isPm && hour < 12) hour += 12;
  if (isAm && hour === 12) hour = 0;
  return hour * 60 + minute;
}

function parseHours(transcript: string): number | null {
  const text = transcript
    .toLowerCase()
    .replace(/a\s*\.\s*m\s*\.?/g, 'am')
    .replace(/p\s*\.\s*m\s*\.?/g, 'pm');

  const hoursAndMinutes = text.match(
    /(?:worked|took|spent)?\s*(?:for\s+)?([\w.-]+(?:\s+[\w.-]+){0,5})\s+hours?\s+(?:and\s+)?([\w.-]+(?:\s+[\w.-]+){0,3})\s+minutes?\b/
  );
  if (hoursAndMinutes) {
    const hours = parseNumberPhrase(hoursAndMinutes[1]);
    const minutes = parseNumberPhrase(hoursAndMinutes[2]);
    if (hours !== null && minutes !== null && minutes < 60) return hours + minutes / 60;
  }

  const words = text.replace(/[^a-z0-9\s.-]/g, ' ').split(/\s+/).filter(Boolean);
  const isNumberToken = (token: string) => NUMBER_WORDS.has(token) || /^\d+(?:\.\d+)?$/.test(token);
  const isRateUnit = (token: string) => /^(?:per|an|each)$/.test(token);

  for (let i = 0; i < words.length; i++) {
    if (!/^minutes?$/.test(words[i])) continue;
    let j = i - 1;
    const collected: string[] = [];
    while (j >= 0 && isNumberToken(words[j])) {
      collected.unshift(words[j]);
      j--;
    }
    if (collected.length === 0 || (j >= 0 && isRateUnit(words[j]))) continue;
    const minutes = parseNumberPhrase(collected.join(' '));
    if (minutes !== null && minutes > 0 && minutes < 60) return minutes / 60;
  }

  for (let i = 0; i < words.length; i++) {
    if (!/^hours?$/.test(words[i])) continue;
    let j = i - 1;
    const collected: string[] = [];
    while (j >= 0 && isNumberToken(words[j])) {
      collected.unshift(words[j]);
      j--;
    }
    if (collected.length === 0 || (j >= 0 && isRateUnit(words[j]))) continue;
    const hours = parseNumberPhrase(collected.join(' '));
    if (hours !== null && hours > 0 && hours <= 24) return hours;
  }

  const arrivedRange = text.match(
    /(?:arrived|started|began)(?:\s+work)?(?:\s+at)?\s+(.{1,55}?)\s+(?:and\s+)?(?:finished|ended|left|stopped)(?:\s+work)?(?:\s+at)?\s+(.{1,55}?)(?=\s+(?:my\s+)?(?:hourly\s+)?(?:rate|materials?|parts?|supplies|I\s+(?:replaced|repaired|installed|fixed|completed|cleaned|removed|tested|resealed))\b|[.!?]|$)/i
  );
  const simpleRange = text.match(
    /\bfrom\s+(.{1,40}?)\s+(?:to|until|through)\s+(.{1,75}?)(?=\s+(?:and\s+then|then|(?:I|we)\s+worked|(?:I(?:'m|\s+am)?\s+)?(?:charging|billing|charge)|(?:my\s+)?(?:hourly\s+)?(?:rate|materials?|parts?|supplies|client))\b|[.!?]|$)/i
  );
  const range = arrivedRange || simpleRange;
  if (range) {
    const start = timePhraseToMinutes(range[1]);
    const end = timePhraseToMinutes(range[2]);
    if (start !== null && end !== null) {
      const adjustedEnd = end <= start ? end + 12 * 60 : end;
      const duration = (adjustedEnd - start) / 60;
      if (duration > 0 && duration <= 24) return duration;
    }
  }
  return null;
}

function parseRate(transcript: string): number | null {
  const text = transcript.toLowerCase();
  const hourlyRateClause = text.match(/hourly\s+rate(?:\s+is|\s+was|\s+of)?\s+(.{1,60}?)(?=\s+(?:materials?|parts?|supplies|total)\b|[.!?]|$)/);
  if (hourlyRateClause) {
    const corrected = hourlyRateClause[1].split(/\b(?:no|sorry|rather|correction)\b/).pop() || hourlyRateClause[1];
    const amounts = moneyAmounts(corrected);
    if (amounts.length > 0) return amounts[amounts.length - 1];
    const value = parseNumberPhrase(corrected);
    if (value !== null) return value;
  }
  const rateClause = text.match(
    /(?:hourly\s+rate|rate|charging|charge|billing|bill)(.{0,100}?)(?:(?:dollars?|bucks?)\s+)?(?:an|per|each)\s+hour\b/
  );
  if (rateClause) {
    const corrected = rateClause[1].split(/\b(?:no|sorry|rather|correction)\b/).pop() || rateClause[1];
    const amounts = moneyAmounts(corrected);
    if (amounts.length > 0) return amounts[amounts.length - 1];
    const value = parseNumberPhrase(corrected);
    if (value !== null) return value;
  }

  const match = text.match(
    /(?:rate(?:\s+is|\s+was|\s+of)?\s+)?([\w.-]+(?:\s+[\w.-]+){0,5})\s+(?:dollars?|bucks?)\s+(?:an|per|each)\s+hour/
  );
  if (match) {
    const corrected = match[1].split(/\b(?:no|sorry|rather|correction)\b/).pop() || match[1];
    const amounts = moneyAmounts(corrected + ' dollars');
    if (amounts.length > 0) return amounts[amounts.length - 1];
    return parseNumberPhrase(corrected);
  }
  const symbol = text.match(/\$(\d+(?:\.\d+)?)\s*(?:an|per|\/)\s*hour/);
  return symbol ? Number(symbol[1]) : null;
}

function moneyAmounts(text: string): number[] {
  const amounts: number[] = [];
  const symbols = Array.from(text.matchAll(/\$\s*(\d+(?:\.\d+)?)/g), (match) => Number(match[1]));
  if (symbols.length > 0) return symbols;
  const trailingSymbols = Array.from(
    text.matchAll(/\b(\d+(?:\.\d+)?)\s*\$/g),
    (match) => Number(match[1])
  );
  if (trailingSymbols.length > 0) return trailingSymbols;
  const numericPattern = /(?:\$\s*)?(\d+(?:\.\d+)?)\s*(?:dollars?|bucks?)(?:\s+and\s+(\d+)\s*cents?)?/g;
  for (const match of text.matchAll(numericPattern)) {
    amounts.push(Number(match[1]) + Number(match[2] || 0) / 100);
  }

  const grandPattern = /([\w.-]+(?:\s+[\w.-]+){0,5})\s+grand\b/g;
  for (const match of text.matchAll(grandPattern)) {
    const value = match[1].trim() === 'a' ? 1 : parseNumberPhrase(match[1]);
    if (value !== null) amounts.push(value * 1000);
  }

  if (amounts.length > 0) return amounts;
  const wordPattern = /([a-z-]+(?:\s+[a-z-]+){0,5})\s+(?:dollars?|bucks?)(?:\s+and\s+([a-z-]+(?:\s+[a-z-]+){0,3})\s+cents?)?/g;
  for (const match of text.matchAll(wordPattern)) {
    const numberWords = trailingNumberPhrase(match[1]);
    const dollars = numberWords ? parseNumberPhrase(numberWords) : null;
    const cents = match[2] ? parseNumberPhrase(match[2]) : 0;
    if (dollars !== null) amounts.push(dollars + (cents || 0) / 100);
  }
  return amounts;
}

function parseMaterials(transcript: string): number | null {
  const text = transcript.toLowerCase();
  const materialStart = text.search(/\b(?:materials?|parts?|supplies)\b/);
  if (materialStart < 0) return null;
  const materialTail = text.slice(materialStart);
  const nextSection = materialTail.slice(1).search(
    /(?:[.!?]\s*|\s+)(?=(?:I|we)\s+(?:had|needed|arrived|started|began|worked|completed|replaced|repaired|installed|fixed|finished|ended|left)\b|(?:I(?:'m|\s+am)?\s+)?(?:charging|billing|charge|bill)\b|(?:my\s+)?(?:hourly\s+)?rate\b|(?:an|per)\s+hour\b|from\s+\d)/i
  );
  const section = nextSection >= 0 ? materialTail.slice(0, nextSection + 1) : materialTail;
  const amounts = moneyAmounts(section);
  const forPhrase = text.match(
    /([\w.-]+(?:\s+[\w.-]+){0,5})\s+(dollars?|bucks?|grand)\s+(?:for|in|on)\s+(?:materials?|parts?|supplies)\b/
  );
  if (forPhrase) {
    let value = parseNumberPhrase(forPhrase[1]);
    if (forPhrase[2].startsWith('grand') && value !== null) value *= 1000;
    if (value !== null) amounts.push(value);
  }
  if (amounts.length === 0) return null;
  return Math.round(amounts.reduce((sum, value) => sum + value, 0) * 100) / 100;
}

function descriptionFromTranscript(transcript: string): string | null {
  const sentences = transcript
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const workSentences = sentences.filter(
    (sentence) =>
      !/\b(?:dollars?|bucks?|grand|rate|materials?|parts?|supplies|hours?|arrived|started|began|finished|ended|worked)\b/i.test(
        sentence
      )
  );
  let selected = (workSentences.length > 0 ? workSentences : []).join(' ').trim();

  if (!selected) {
    const statedJob = transcript.match(
      /\b(?:I|we)\s+(?:had|needed)\s+to\s+(?:do|perform|complete)?\s*(?:an?|the)?\s*(.{3,100}?)(?=\s+(?:and\s+)?(?:did|worked|from|then|(?:I|we)\s+(?:arrived|started|finished)|(?:my\s+)?rate|(?:I(?:'m|\s+am)?\s+)?charging)\b|[.!?]|$)/i
    );
    const workedOn = transcript.match(
      /\b(?:I|we)\s+worked\s+on\s+(.{3,100}?)(?=\s+(?:and\s+then|then|(?:my\s+)?rate|materials?|parts?|supplies|(?:I(?:'m|\s+am)?\s+)?charging)\b|[.!?]|$)/i
    );
    const jobPhrase = statedJob || workedOn;
    if (jobPhrase) selected = jobPhrase[1].trim();
  }

  // Phone dictation often returns one long sentence without punctuation. In that
  // case, retain clauses describing completed work and discard billing details.
  if (!selected) {
    const actionPattern =
      /\b(?:I\s+)?(completed|replaced|repaired|installed|fixed|cleaned|removed|tested|resealed|painted|built|serviced|diagnosed|inspected|unclogged)\b/gi;
    const actions = Array.from(transcript.matchAll(actionPattern));
    // A speaker may begin with a generic "completed a repair" and provide the
    // useful itemized work after the time details. Prefer that detailed section.
    const chosenAction =
      actions.length > 1 && actions[0][1].toLowerCase() === 'completed' ? actions[1] : actions[0];
    if (chosenAction?.index !== undefined) {
      selected = transcript
        .slice(chosenAction.index)
        .split(
          /\b(?:my\s+)?(?:rate|materials?|parts?|supplies|total|I\s+(?:arrived|started|began|finished|ended|left)|from\s+\d|(?:for|at)\s+[\w.-]+(?:\s+[\w.-]+){0,4}\s+(?:dollars?|bucks?|grand))\b/i
        )[0]
        .trim();
    }
  }

  if (!selected) selected = sentences.slice(0, 1).join(' ').trim();
  if (!selected) return null;
  selected = selected
    .replace(/^I\s+(?=(?:completed|replaced|repaired|installed|fixed|cleaned|removed|tested|resealed)\b)/i, '')
    .replace(/\s+/g, ' ')
    .replace(/[\s,;]+$/, '');
  return selected.charAt(0).toUpperCase() + selected.slice(1);
}

export function extractInvoiceFieldsLocally(transcript: string, now = new Date()): ExtractedInvoiceFields {
  return {
    description: descriptionFromTranscript(transcript),
    serviceDate: parseDate(transcript, now),
    hoursWorked: parseHours(transcript),
    hourlyRate: parseRate(transcript),
    materialCost: parseMaterials(transcript),
  };
}
