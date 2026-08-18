import type { ExtractedInvoiceFields } from './types';

const FR_SMALL: Record<string, number> = {
  zero: 0,
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  sept: 7,
  huit: 8,
  neuf: 9,
  dix: 10,
  onze: 11,
  douze: 12,
  treize: 13,
  quatorze: 14,
  quinze: 15,
  seize: 16,
};

const FR_TENS: Record<string, number> = {
  vingt: 20,
  vingts: 20,
  trente: 30,
  quarante: 40,
  cinquante: 50,
  soixante: 60,
};

const FR_MONTHS: Record<string, number> = {
  janvier: 1,
  fevrier: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  aout: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  decembre: 12,
};

const FR_WEEKDAYS: Record<string, number> = {
  dimanche: 0,
  lundi: 1,
  mardi: 2,
  mercredi: 3,
  jeudi: 4,
  vendredi: 5,
  samedi: 6,
};

const ACCENTS: Array<[RegExp, string]> = [
  [/[àâä]/g, 'a'],
  [/[éèêë]/g, 'e'],
  [/[îï]/g, 'i'],
  [/[ôö]/g, 'o'],
  [/[ùûü]/g, 'u'],
  [/ÿ/g, 'y'],
  [/ç/g, 'c'],
  [/œ/g, 'o'],
  [/æ/g, 'a'],
];

/** Lowercases, normalizes apostrophes, and strips diacritics (1:1 chars, so indices stay aligned). */
function fr(text: string): string {
  let out = text.toLowerCase().replace(/['’]/g, "'");
  for (const [re, replacement] of ACCENTS) out = out.replace(re, replacement);
  return out;
}

function toISO(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function num(value: string): number {
  return Number(value.replace(',', '.'));
}

function parseFrenchNumberPhrase(value: string): number | null {
  const mixedFraction = value.match(/(\d+)\s+(?:et\s+)?1\s*\/\s*2/);
  if (mixedFraction) return Number(mixedFraction[1]) + 0.5;
  const numeric = value.match(/-?\d+(?:[.,]\d+)?/);
  if (numeric) return num(numeric[0]);

  const tokens = value
    .toLowerCase()
    .replace(/['’]/g, "'")
    .replace(/-/g, ' ')
    .replace(/[^a-zàâçéèêëîïôùûüÿ\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  let total = 0;
  let current = 0;
  let recognized = false;
  let half = false;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === 'et') continue;
    if (token === 'demi' || token === 'demie') {
      half = true;
      recognized = true;
      continue;
    }
    if (token === 'quatre' && (tokens[i + 1] === 'vingt' || tokens[i + 1] === 'vingts')) {
      current = 80;
      i++;
      recognized = true;
      continue;
    }
    if (token === 'cent' || token === 'cents') {
      current = Math.max(1, current) * 100;
      recognized = true;
      continue;
    }
    if (token === 'mille') {
      total += Math.max(1, current) * 1000;
      current = 0;
      recognized = true;
      continue;
    }
    if (token in FR_SMALL) {
      current += FR_SMALL[token];
      recognized = true;
      continue;
    }
    if (token in FR_TENS) {
      current += FR_TENS[token];
      recognized = true;
    }
  }

  if (!recognized) return null;
  if (half && current === 1 && total === 0) return 0.5; // "une demi-heure"
  return total + current + (half ? 0.5 : 0);
}

const NUMBER_WORDS_FR = new Set<string>([
  ...Object.keys(FR_SMALL),
  ...Object.keys(FR_TENS),
  'cent',
  'cents',
  'mille',
  'demi',
  'demie',
  'et',
]);

function trailingNumberPhrase(group: string): string | null {
  const tokens = group.split(/\s+/).filter(Boolean);
  let i = tokens.length - 1;
  while (i >= 0 && NUMBER_WORDS_FR.has(tokens[i])) i--;
  const phrase = tokens.slice(i + 1).join(' ');
  return phrase || null;
}

function parseDate(transcript: string, now: Date): string | null {
  const text = fr(transcript);
  if (/\bhier\b/.test(text)) {
    const date = new Date(now);
    date.setDate(date.getDate() - 1);
    return toISO(date);
  }
  if (/\baujourd'h\w*i\b|\bce\s+matin\b|\bcet\s+apres-midi\b|\bcet\s+apres\s+midi\b|\bce\s+soir\b/.test(text)) return toISO(now);

  const explicit = text.match(
    /\b(?:le\s+)?([a-zàâçéèêëîïôùûüÿ\d-]+(?:\s+[a-zàâçéèêëîïôùûüÿ\d-]+)?)\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b(?:\s+(20\d{2}))?/
  );
  if (explicit) {
    const dayPhrase = fr(explicit[1]);
    const day = dayPhrase === 'premier' ? 1 : parseFrenchNumberPhrase(dayPhrase);
    const month = FR_MONTHS[explicit[2]];
    const year = explicit[3] ? Number(explicit[3]) : now.getFullYear();
    if (day !== null && day >= 1 && day <= 31) return toISO(new Date(year, month - 1, Math.floor(day)));
  }

  const iso = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return toISO(new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));

  const lastWeekday = text.match(
    /\b(?:derni(?:er|ere)\s+)?(dimanche|lundi|mardi|mercredi|jeudi|vendredi|samedi)\s+derni(?:er|ere)\b|\bderni(?:er|ere)\s+(dimanche|lundi|mardi|mercredi|jeudi|vendredi|samedi)\b/
  );
  if (lastWeekday) {
    const target = FR_WEEKDAYS[lastWeekday[1] || lastWeekday[2]];
    const date = new Date(now);
    let difference = (date.getDay() - target + 7) % 7;
    if (difference === 0) difference = 7;
    date.setDate(date.getDate() - difference);
    return toISO(date);
  }
  return null;
}

function timePhraseToMinutes(phrase: string): number | null {
  const lower = fr(phrase);
  if (/(?:^|\s)midi\b/.test(lower)) {
    if (/\bet\s+(?:demi|demie)\b/.test(lower)) return 12 * 60 + 30;
    if (/\bet\s+quart\b/.test(lower)) return 12 * 60 + 15;
    return 12 * 60;
  }
  if (/(?:^|\s)minuit\b/.test(lower)) {
    if (/\bet\s+(?:demi|demie)\b/.test(lower)) return 30;
    if (/\bet\s+quart\b/.test(lower)) return 15;
    return 0;
  }
  const isPm = /\bp\.?m\.?\b|apres-midi|apres\s+midi|du\s+soir|de\s+la\s+soiree|de\s+la\s+nuit/.test(lower);
  const isAm = /\ba\.?m\.?\b|du\s+matin/.test(lower);
  const cleaned = lower
    .replace(/\b(?:de|a|du|en|le|la)\b/g, ' ')
    .replace(/\b(?:du\s+matin|de\s+l'apres-midi|de\s+l'apres\s+midi|du\s+soir|de\s+la\s+soiree|de\s+la\s+nuit|a\.?m\.?|p\.?m\.?)\b/g, ' ')
    .replace(/(\d)\s*([h:])\s*(\d{1,2})?\b/g, '$1$2$3')
    .trim();

  let hour: number | null = null;
  let minute = 0;

  const numericTime = cleaned.match(/\b(\d{1,2})(?:(?:h|:)(\d{1,2}))?\b/);
  if (numericTime) {
    hour = Number(numericTime[1]);
    minute = Number(numericTime[2] || 0);
  } else {
    const tokens = cleaned.replace(/-/g, ' ').split(/\s+/).filter(Boolean);
    if (tokens.length > 0) {
      hour = parseFrenchNumberPhrase(tokens[0]);
      const rest = tokens.slice(1).join(' ');
      if (/\bet\s+(?:demi|demie)\b/.test(rest)) minute = 30;
      else if (/\bet\s+quart\b/.test(rest)) minute = 15;
      else if (rest) minute = parseFrenchNumberPhrase(rest) || 0;
    }
  }

  if (hour === null || hour > 23 || minute > 59) return null;
  if (isPm && hour < 12) hour += 12;
  if (isAm && hour === 12) hour = 0;
  return hour * 60 + minute;
}

function parseHours(transcript: string): number | null {
  const text = fr(transcript);

  const hoursAndMinutes = text.match(
    /(?:travaille|pris|passe)?\s*(?:pendant\s+|pour\s+)?([\w.-]+(?:\s+[\w.-]+){0,5})\s+heures?\s+(?:et\s+)?([\w.-]+(?:\s+[\w.-]+){0,3})\s+minutes?\b/
  );
  if (hoursAndMinutes) {
    const hours = parseFrenchNumberPhrase(hoursAndMinutes[1]);
    const minutes = parseFrenchNumberPhrase(hoursAndMinutes[2]);
    if (hours !== null && minutes !== null && minutes < 60) return hours + minutes / 60;
  }

  const words = text
    .replace(/[^a-zàâçéèêëîïôùûüÿ0-9\s.,-]/g, ' ')
    .replace(/-/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const isNumberToken = (token: string) => NUMBER_WORDS_FR.has(token) || /^\d+(?:[.,]\d+)?$/.test(token);
  const isRateUnit = (token: string) => /^(?:par)$/.test(token);
  const isTimeContext = (token: string | undefined) =>
    token !== undefined &&
    (/^(?:a|de|du|des|au|aux)$/.test(token) ||
      /^(?:arrive|arrivee|commence|commencee|debute|debutee|fini|finie|termine|terminee)$/.test(token));

  // Compact duration forms: "3h30", "9h", "3 h 30", "3h 30", "3 h30".
  for (let i = 0; i < words.length; i++) {
    const compact = words[i].match(/^(\d+)[hH](\d{1,2})?$/);
    if (compact) {
      if (isTimeContext(words[i - 1]) || words[i + 1] === 'du' || words[i + 1] === 'de') continue;
      const hours = Number(compact[1]) + Number(compact[2] || 0) / 60;
      if (hours > 0 && hours <= 24) return hours;
    }
    if (/^[hH]\d{0,2}$/.test(words[i])) {
      const prev = words[i - 1];
      if (prev && /^\d+$/.test(prev) && !isTimeContext(words[i - 2])) {
        let minutes = words[i].slice(1);
        const nextToken = words[i + 1];
        if (minutes === '' && nextToken && /^\d{1,2}$/.test(nextToken) && Number(nextToken) < 60) {
          minutes = nextToken;
        }
        const hours = Number(prev) + (minutes ? Number(minutes) : 0) / 60;
        if (hours > 0 && hours <= 24 && Number(minutes || 0) < 60) return hours;
      }
    }
  }

  for (let i = 0; i < words.length; i++) {
    if (!/^minute(s)?$/.test(words[i])) continue;
    let j = i - 1;
    const collected: string[] = [];
    while (j >= 0 && isNumberToken(words[j])) {
      collected.unshift(words[j]);
      j--;
    }
    if (collected.length === 0 || (j >= 0 && isRateUnit(words[j])) || isTimeContext(words[j])) continue;
    const minutes = parseFrenchNumberPhrase(collected.join(' '));
    if (minutes !== null && minutes > 0 && minutes < 60) return minutes / 60;
  }

  for (let i = 0; i < words.length; i++) {
    if (!/^heure(s)?$/.test(words[i])) continue;
    let j = i - 1;
    const collected: string[] = [];
    while (j >= 0 && isNumberToken(words[j])) {
      collected.unshift(words[j]);
      j--;
    }
    if (collected.length === 0 || (j >= 0 && isRateUnit(words[j])) || isTimeContext(words[j])) continue;
    const after = words[i + 1];
    const afterAfter = words[i + 2];
    if (after === 'du' || (after === 'de' && (afterAfter === "l'apres" || afterAfter === 'la'))) {
      continue;
    }
    let hours = parseFrenchNumberPhrase(collected.join(' '));
    if (hours !== null && hours > 0 && hours <= 24) {
      if (after === 'et' && /^(?:demi|demie)$/.test(afterAfter || '')) hours += 0.5;
      else if (after === 'et' && afterAfter === 'quart') hours += 0.25;
      else if (after && isNumberToken(after) && !/^(?:dollars?|piastres?|piasses?|mille)$/.test(afterAfter || '')) {
        const minutes = parseFrenchNumberPhrase(after);
        if (minutes !== null && minutes > 0 && minutes < 60) hours += minutes / 60;
      }
      return hours;
    }
  }

  const arrivedRange = text.match(
    /(?:arrive|arrivee|commence|commencee|debute|debutee)(?:\s+a)?\s+(.{1,45}?)\s+(?:et|puis)\s+(?:fini|finie|termine|terminee|finit)(?:\s+a)?\s*(.{1,45}?)(?=\s+(?:et\s+puis|puis|(?:j'|je\s+)?(?:ai\s+)?(?:travaille|fait)|(?:mon|ma|mes)?\s*(?:taux|tarif)\s+horaire|materiaux|materiel|pieces|fournitures|je\s+(?:remplace|installe|repare))|[.!?]|$)/i
  );
  const simpleRange = text.match(
    /\bde\s+(.{1,40}?)\s+(?:a|jusqu'a|jusqu')\s+(.{1,75}?)(?=\s+(?:et\s+puis|puis|(?:j'|je\s+)?(?:ai\s+)?travaille|(?:j'|je\s+)?(?:charge|facture)|(?:mon|ma|mes)?\s*(?:taux|tarif)\s+horaire|materiaux|materiel|pieces|fournitures|client)|[.!?]|$)/i
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

function moneyAmounts(text: string): number[] {
  const amounts: number[] = [];
  const symbols = Array.from(text.matchAll(/\$\s*(\d+(?:[.,]\d+)?)/g), (match) => num(match[1]));
  if (symbols.length > 0) return symbols;
  const trailingSymbols = Array.from(text.matchAll(/\b(\d+(?:[.,]\d+)?)\s*\$/g), (match) => num(match[1]));
  if (trailingSymbols.length > 0) return trailingSymbols;
  const numericPattern = /(?:\$\s*)?(\d+(?:[.,]\d+)?)\s*(?:dollars?|piastres?|piasses?)(?:\s+et\s+(\d+(?:[.,]\d+)?)\s+cents?)?/g;
  for (const match of text.matchAll(numericPattern)) {
    amounts.push(num(match[1]) + num(match[2] || '0') / 100);
  }

  if (amounts.length > 0) return amounts;
  const wordPattern = /([a-z-]+(?:\s+[a-z-]+){0,5})\s+(?:dollars?|piastres?|piasses?)(?:\s+et\s+([a-z-]+(?:\s+[a-z-]+){0,3})\s+cents?)?/g;
  for (const match of text.matchAll(wordPattern)) {
    const numberWords = trailingNumberPhrase(match[1]);
    const dollars = numberWords ? parseFrenchNumberPhrase(numberWords) : null;
    const cents = match[2] ? parseFrenchNumberPhrase(match[2]) : 0;
    if (dollars !== null) amounts.push(dollars + (cents || 0) / 100);
  }
  return amounts;
}

function parseRate(transcript: string): number | null {
  const text = fr(transcript);
  const hourlyRateClause = text.match(
    /(?:taux|tarif)\s+horaire(?:\s+(?:est|etait|de|a))?\s+(.{1,60}?)(?=\s+(?:materiaux|materiel|pieces|fournitures|total)\b|[.!?]|$)/
  );
  if (hourlyRateClause) {
    const corrected = hourlyRateClause[1].split(/\b(?:non|desole|plutot|correction)\b/).pop() || hourlyRateClause[1];
    const amounts = moneyAmounts(corrected);
    if (amounts.length > 0) return amounts[amounts.length - 1];
    const value = parseFrenchNumberPhrase(corrected);
    if (value !== null) return value;
  }
  const rateClause = text.match(
    /(?:taux\s+horaire|taux|tarif|je\s+charge|je\s+facture|charge|facture|paye|payee|payait|paie)(.{0,100}?)(?:(?:dollars?|piastres?|piasses?|pieces?)\s+)?(?:de\s+l'heure|a\s+l'heure|par\s+heure)\b/
  );
  if (rateClause) {
    const corrected = rateClause[1].split(/\b(?:non|desole|plutot|correction)\b/).pop() || rateClause[1];
    const amounts = moneyAmounts(corrected);
    if (amounts.length > 0) return amounts[amounts.length - 1];
    const value = parseFrenchNumberPhrase(corrected);
    if (value !== null) return value;
  }

  const match = text.match(
    /(?:taux(?:\s+(?:est|etait|de))?\s+)?([\w.-]+(?:\s+[\w.-]+){0,5})\s+(?:dollars?|piastres?|piasses?)\s+(?:par\s+heure|de\s+l'heure|a\s+l'heure)/
  );
  if (match) {
    const corrected = match[1].split(/\b(?:non|desole|plutot|correction)\b/).pop() || match[1];
    const amounts = moneyAmounts(corrected + ' dollars');
    if (amounts.length > 0) return amounts[amounts.length - 1];
    return parseFrenchNumberPhrase(corrected);
  }
  const symbol = text.match(/\$\s*(\d+(?:[.,]\d+)?)\s*(?:par\s+heure|de\s+l'heure|a\s+l'heure|\/)/);
  return symbol ? num(symbol[1]) : null;
}

function parseMaterials(transcript: string): number | null {
  const text = fr(transcript);
  const materialStart = text.search(
    /\b(?:materiaux|materiel|fournitures|pieces(?!\s+de\s+l'heure|\s+par\s+heure|\s+a\s+l'heure))\b/
  );
  if (materialStart < 0) return null;
  const materialTail = text.slice(materialStart);
  const nextSection = materialTail.slice(1).search(
    /(?:[.!?]\s*|\s+)(?=(?:j'|je\s+)(?:ai\s+)?(?:eu\s+besoin|suis\s+arrive|suis\s+arrivee|ai\s+commence|ai\s+commencee|ai\s+travaille|ai\s+termine|ai\s+terminee|ai\s+fini)|(?:j'|je\s+)(?:charge|facture)|(?:mon|ma|mes)?\s*(?:taux|tarif)\s+horaire|(?:par\s+heure|de\s+l'heure|a\s+l'heure)|de\s+\d{1,2}\s*(?:h\b|heures?\b|:))/i
  );
  const section = nextSection >= 0 ? materialTail.slice(0, nextSection + 1) : materialTail;
  const amounts = moneyAmounts(section);
  const forPhrase = text.match(
    /([\w.,-]+(?:\s+[\w.,-]+){0,5})\s*(?:\$|(dollars?|piastres?|piasses?|mille))\s+(?:pour|en|sur|de)\s+(?:materiaux|materiel|pieces|fournitures)\b/
  );
  if (forPhrase) {
    let value = parseFrenchNumberPhrase(forPhrase[1]);
    if (forPhrase[2] === 'mille' && value !== null) value *= 1000;
    if (value !== null) amounts.push(value);
  }
  if (amounts.length === 0) return null;
  return Math.round(amounts.reduce((sum, value) => sum + value, 0) * 100) / 100;
}

function groupFromOriginal(match: RegExpMatchArray, groupIndex: number, original: string): string {
  const group = match[groupIndex];
  const offset = match[0].indexOf(group);
  const start = (match.index ?? 0) + offset;
  return original.slice(start, start + group.length);
}

function descriptionFromTranscript(transcript: string): string | null {
  const original = transcript.trim();
  const norm = fr(original);

  const originalSentences = original
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const normSentences = norm
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const keepIndices: number[] = [];
  normSentences.forEach((sentence, index) => {
    if (
      !/\b(?:dollars?|piastres?|piasses?|mille|taux|tarif|materiaux|materiel|pieces|fournitures|heures?|minutes?|arrive|arrivee|commence|commencee|termine|terminee|fini|finie|travaille)\b/.test(
        sentence
      )
    ) {
      keepIndices.push(index);
    }
  });
  let selected = keepIndices.map((index) => originalSentences[index]).join(' ').trim();

  if (!selected) {
    const statedJob = norm.match(
      /\b(?:j'|je\s+|on\s+a|nous\s+avons)\s+(?:ai|avais|avons)\s+eu\s+(?:besoin|a)\s+de\s+(?:faire|effectuer|completer)?\s*(?:un|une|le|la|les|des)?\s*(.{3,100}?)(?=\s+(?:et\s+)?(?:j'|je\s+|on\s+|nous\s+)?(?:ai|suis|avons)\s+(?:travaille|fait|commence|commencee|arrive|arrivee|termine|terminee|fini)|(?:j'|je\s+)?(?:charge|facture)|(?:mon|ma|mes)?\s*(?:taux|tarif)\s+horaire|[.!?]|$)/i
    );
    const workedOn = norm.match(
      /\b(?:j'|je\s+|on\s+a|nous\s+avons)\s+(?:ai|suis|avons)\s+travaille\s+(?:sur|a|au|aux)\s+(.{3,100}?)(?=\s+(?:et\s+puis|puis|(?:mon|ma|mes)?\s*(?:taux|tarif)\s+horaire|materiaux|materiel|pieces|fournitures|(?:j'|je\s+)?(?:charge|facture))|[.!?]|$)/i
    );
    const jobPhrase = statedJob || workedOn;
    if (jobPhrase) selected = groupFromOriginal(jobPhrase, 1, original).trim();
  }

  if (!selected) {
    const actionPattern =
      /\b(?:j'|je\s+)?(complete|completee|remplace|remplacee|repare|reparee|installe|installee|fixe|fixee|nettoye|nettoyee|enleve|enlevee|retire|retiree|teste|testee|rescele|rescelee|peint|peinte|construit|construite|entretenu|entretenue|diagnostique|diagnostiquee|inspecte|inspectee|verifie|verifiee|debouche|debouchee|fait|faite|depense|depensee)\b/gi;
    const actions = Array.from(norm.matchAll(actionPattern));
    const chosenAction =
      actions.length > 1 && /^complete/i.test(actions[0][1]) ? actions[1] : actions[0];
    if (chosenAction?.index !== undefined) {
      const start = chosenAction.index;
      const normSlice = norm.slice(start);
      const cut = normSlice.split(
        /\b(?:mon|ma|mes)?\s*(?:taux|tarif)\s+horaire|materiaux|materiel|pieces|fournitures|total|(?:j'|je\s+)(?:suis\s+arrive|suis\s+arrivee|ai\s+commence|ai\s+commencee|ai\s+fini|ai\s+termine|ai\s+terminee)|de\s+\d{1,2}\s*(?:h\b|heures?\b|:)|(?:pour|a)\s+[\w.-]+(?:\s+[\w.-]+){0,4}\s+(?:dollars?|piastres?|piasses?|mille)/i
      )[0];
      selected = original.slice(start, start + cut.length).trim();
    }
  }

  if (!selected) {
    selected = originalSentences.slice(0, 1).join(' ').trim();
    // Trim billing / money clauses from the fallback (accent-stripped text maps 1:1 back to original).
    const firstNorm = normSentences[0] ?? '';
    const cutIndex = firstNorm.search(
      /\b(?:le\s+)?(?:cout|prix|frais|coup)\s+des?\s+(?:materiaux|materiel|pieces|fournitures)\b|\b(?:mon|ma|mes)?\s*(?:taux|tarif)\s+horaire\b|\b(?:je\s+)?(?:t'|te\s+)?(?:ai\s+)?(?:paye|payee|paie)\s+[\w.,-]+\s+(?:pieces?|dollars?|piastres?|piasses?)\s+(?:de\s+l'heure|par\s+heure)\b|\b(?:pour|a)\s+[\w.-]+(?:\s+[\w.-]+){0,4}\s+(?:dollars?|piastres?|piasses?|mille)\b|\$\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s*\$/
    );
    if (cutIndex > 0) selected = originalSentences[0].slice(0, cutIndex).trim();
  }

  if (!selected) return null;
  const selNorm = fr(selected);
  const fillerMatch = selNorm.match(
    /^(?:bah|bon|eh|ben|alors|donc|bonjour|dis|attends)\s+ecoute\s+|^(?:alors|bon|donc|ecoute|ben|bah|bonjour)\s+/i
  );
  if (fillerMatch) selected = selected.slice(fillerMatch[0].length);
  selected = selected
    .replace(/^j'ai\s+|^jai\s+|^j'avais\s+|^je\s+/i, '')
    .replace(/\s+/g, ' ')
    .replace(/\b(?:et|puis)\s*$/, '')
    .replace(/[\s,;]+$/, '');;
  return selected.charAt(0).toUpperCase() + selected.slice(1);
}

export function extractInvoiceFieldsLocallyFr(transcript: string, now = new Date()): ExtractedInvoiceFields {
  return {
    description: descriptionFromTranscript(transcript),
    serviceDate: parseDate(transcript, now),
    hoursWorked: parseHours(transcript),
    hourlyRate: parseRate(transcript),
    materialCost: parseMaterials(transcript),
  };
}