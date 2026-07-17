/**
 * Maps every username-quality flag the backend can return
 * (backend/validators/score_calculator.py -> analyze_username_quality)
 * into a human-friendly title, icon, and explanation.
 *
 * This list mirrors ALL flags the backend currently supports — not just
 * a couple of examples. If the backend adds a new flag later, add one
 * entry here and it will automatically show up (see UNKNOWN_FLAG_FALLBACK
 * for flags this file doesn't yet know about, so nothing silently
 * disappears).
 */
import {
  Hash,
  Repeat,
  Keyboard,
  Type,
  Waves,
  AlignJustify,
  Sparkles,
  HelpCircle,
} from 'lucide-react';

export const FLAG_DEFINITIONS = {
  all_digits: {
    title: 'All Numbers',
    icon: Hash,
    description:
      'The username is made up entirely of digits, which is unusual for a personal mailbox and often seen in auto-generated accounts.',
  },
  char_repetition: {
    title: 'Repeated Characters',
    icon: Repeat,
    description:
      'The same character repeats several times in a row — a pattern common in randomly generated usernames.',
  },
  keyboard_walk: {
    title: 'Keyboard Pattern',
    icon: Keyboard,
    description:
      'The username appears to follow adjacent keyboard keys, which is common in randomly generated usernames.',
  },
  no_vowels: {
    title: 'No Vowels',
    icon: Type,
    description:
      'The username contains no vowels, making it look less like a natural word or name.',
  },
  low_vowel_ratio: {
    title: 'Low Vowel Ratio',
    icon: Type,
    description:
      'The username has very few vowels relative to its length, which is uncommon in real names or words.',
  },
  grouped_vowels: {
    title: 'Vowel Cluster',
    icon: Waves,
    description:
      'Several vowels appear together in a row — a pattern rarely seen in natural names.',
  },
  consonant_cluster: {
    title: 'Excessive Consonants',
    icon: AlignJustify,
    description:
      'The username contains an unusually long run of consonants, which may indicate an auto-generated username.',
  },
  high_entropy: {
    title: 'High Randomness',
    icon: Sparkles,
    description:
      'The character pattern in this username looks highly random rather than a recognizable word or name.',
  },
};

// Used only if the backend ever returns a flag this file doesn't know
// about yet — keeps it visible (raw name) instead of silently dropping it.
const UNKNOWN_FLAG_FALLBACK = (flagName) => ({
  title: flagName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
  icon: HelpCircle,
  description: 'This username pattern was flagged by our analysis.',
});

export function getFlagInfo(flagName) {
  return FLAG_DEFINITIONS[flagName] || UNKNOWN_FLAG_FALLBACK(flagName);
}

// ── Verdict (username_quality) -> presentation ──────────────────────────────
export const VERDICT_DEFINITIONS = {
  clean: {
    title: 'Professional username',
    color: 'success',
    description:
      'No suspicious patterns detected — this looks like a genuine, well-formed personal or business mailbox.',
  },
  suspicious: {
    title: 'Slightly unusual username',
    color: 'warning',
    description:
      'A minor pattern was detected that sometimes appears in auto-generated addresses, though this alone is not a strong signal.',
  },
  likely_fake: {
    title: 'Possibly auto-generated username',
    color: 'warning',
    description: 'Multiple patterns typical of randomly generated usernames were detected.',
  },
  random: {
    title: 'Highly random username',
    color: 'error',
    description:
      'This username shows strong signs of being randomly generated rather than chosen by a person.',
  },
};

const DEFAULT_VERDICT = {
  title: 'Username analyzed',
  color: 'neutral',
  description: 'Quality analysis for this username.',
};

export function getVerdictInfo(verdict) {
  return VERDICT_DEFINITIONS[verdict] || DEFAULT_VERDICT;
}

// Generic reassurance bullets shown only when the backend returned zero
// flags — i.e. we genuinely have nothing negative to report, so we
// restate (in plain English) the absence of the flags we know how to
// detect, rather than inventing new claims.
export const CLEAN_USERNAME_HIGHLIGHTS = [
  'No suspicious character patterns',
  'No random-looking number sequences',
  'No repeated or keyboard-walk patterns',
  'Looks like a naturally chosen name',
];

/**
 * Builds a plain-English summary sentence from the actual flags + verdict
 * the backend returned. Never invents flags that weren't present.
 */
export function buildUsernameSummary(verdict, flags = []) {
  const verdictInfo = getVerdictInfo(verdict);

  if (!flags || flags.length === 0) {
    return `${verdictInfo.title}. ${verdictInfo.description}`;
  }

  const flagTitles = flags.map((f) => getFlagInfo(f).title);
  const flagList =
    flagTitles.length === 1
      ? flagTitles[0]
      : `${flagTitles.slice(0, -1).join(', ')} and ${flagTitles[flagTitles.length - 1]}`;

  return `Classified as "${verdictInfo.title}" because of: ${flagList}.`;
}
