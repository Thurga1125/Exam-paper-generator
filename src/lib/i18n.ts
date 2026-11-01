import type { ExamConfig } from "./schemas";

export type Lang = ExamConfig["language"];

/** Canonical exam types (stored as these English strings, shown in the paper's language). */
export const EXAM_TYPES = ["Assignment", "1st Term Test", "2nd Term Test", "3rd Term Test", "Other"] as const;

interface Labels {
  timeAllowed: string;
  maxMarks: string;
  instructions: string;
  endOfPaper: string;
  marks: string;
  page: string;
  name: string;
  indexNo: string;
  section: string;
  question: string;
  markingScheme: string;
  confidential: string;
  examinerGuidelines: string;
  expected: string;
  modelAnswer: string;
  rubric: string;
  allocation: string;
  part: string;
  examinerNotes: string;
  hour: [string, string]; // singular, plural
  minutes: string;
  examTypes: Record<string, string>;
}

const LABELS: Record<Lang, Labels> = {
  English: {
    timeAllowed: "Time allowed", maxMarks: "Maximum marks", instructions: "INSTRUCTIONS TO CANDIDATES",
    endOfPaper: "END OF QUESTION PAPER", marks: "marks", page: "Page", name: "Name", indexNo: "Index No.",
    section: "Section", question: "Question", markingScheme: "MARKING SCHEME", confidential: "CONFIDENTIAL — FOR EXAMINERS ONLY",
    examinerGuidelines: "EXAMINER GUIDELINES", expected: "Expected", modelAnswer: "Model answer", rubric: "Rubric",
    allocation: "Allocation", part: "Part", examinerNotes: "Examiner notes",
    hour: ["hour", "hours"], minutes: "minutes",
    examTypes: {},
  },
  Tamil: {
    timeAllowed: "நேரம்", maxMarks: "மொத்தப் புள்ளிகள்", instructions: "அறிவுறுத்தல்கள்",
    endOfPaper: "வினாத்தாள் முடிவு", marks: "புள்ளிகள்", page: "பக்கம்", name: "பெயர்", indexNo: "சுட்டெண்",
    section: "பகுதி", question: "வினா", markingScheme: "புள்ளி வழங்கும் திட்டம்", confidential: "இரகசியம் — பரீட்சகர்களுக்கு மட்டும்",
    examinerGuidelines: "பரீட்சகர் வழிகாட்டல்கள்", expected: "எதிர்பார்க்கும் விடை", modelAnswer: "மாதிரி விடை", rubric: "மதிப்பீட்டு வழிகாட்டி",
    allocation: "புள்ளி ஒதுக்கீடு", part: "பகுதி", examinerNotes: "பரீட்சகர் குறிப்புகள்",
    hour: ["மணித்தியாலம்", "மணித்தியாலங்கள்"], minutes: "நிமிடங்கள்",
    examTypes: {
      Assignment: "ஒப்படை",
      "1st Term Test": "முதலாம் தவணைப் பரீட்சை",
      "2nd Term Test": "இரண்டாம் தவணைப் பரீட்சை",
      "3rd Term Test": "மூன்றாம் தவணைப் பரீட்சை",
    },
  },
  Sinhala: {
    timeAllowed: "කාලය", maxMarks: "මුළු ලකුණු", instructions: "උපදෙස්",
    endOfPaper: "ප්‍රශ්න පත්‍රය අවසන්", marks: "ලකුණු", page: "පිටුව", name: "නම", indexNo: "විභාග අංකය",
    section: "කොටස", question: "ප්‍රශ්නය", markingScheme: "ලකුණු දීමේ පටිපාටිය", confidential: "රහසිගතයි — විභාගකරුවන් සඳහා පමණි",
    examinerGuidelines: "විභාගකරුවන් සඳහා මාර්ගෝපදේශ", expected: "අපේක්ෂිත පිළිතුර", modelAnswer: "ආදර්ශ පිළිතුර", rubric: "ඇගයීම් මාර්ගෝපදේශය",
    allocation: "ලකුණු ඒකාබද්ධතාව", part: "කොටස", examinerNotes: "විභාගකරු සටහන්",
    hour: ["පැය", "පැය"], minutes: "මිනිත්තු",
    examTypes: {
      Assignment: "පැවරුම",
      "1st Term Test": "පළමු වාර පරීක්ෂණය",
      "2nd Term Test": "දෙවන වාර පරීක්ෂණය",
      "3rd Term Test": "තෙවන වාර පරීක්ෂණය",
    },
  },
};

export const labels = (lang: Lang): Labels => LABELS[lang] ?? LABELS.English;

/** "2 hours", "1 மணித்தியாலம் 30 நிமிடங்கள்", "45 minutes", "පැය 2" */
export function formatDuration(minutes: number, lang: Lang): string {
  const L = labels(lang);
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes - h * 60);
  const hourWord = h === 1 ? L.hour[0] : L.hour[1];
  const hPart = lang === "Sinhala" ? `${L.hour[0]} ${h}` : `${h} ${hourWord}`;
  const mPart = lang === "Sinhala" ? `${L.minutes} ${m}` : `${m} ${L.minutes}`;
  if (h > 0 && m > 0) return `${hPart} ${mPart}`;
  if (h > 0) return hPart;
  return mPart;
}

export function examTypeLabel(type: string, lang: Lang): string {
  return labels(lang).examTypes[type] ?? type;
}

/** "Section A" → "பகுதி A"; leaves other titles alone. */
export function sectionTitle(title: string, lang: Lang): string {
  if (lang === "English") return title;
  return title.replace(/^section\b/i, labels(lang).section);
}

/** "Question 3" → "வினா 3"; "Q3" and "3" are unchanged. */
export function questionNumber(n: string, lang: Lang): string {
  if (lang === "English") return n;
  return n.replace(/^question\b/i, labels(lang).question);
}

export function answerAll(lang: Lang): string {
  return lang === "Tamil" ? "எல்லா வினாக்களுக்கும் விடை எழுதுக." : lang === "Sinhala" ? "සියලුම ප්‍රශ්නවලට පිළිතුරු සපයන්න." : "Answer ALL questions.";
}
export function answerAny(n: number, of: number, lang: Lang): string {
  return lang === "Tamil"
    ? `${of} வினாக்களில் ஏதேனும் ${n} வினாக்களுக்கு விடை எழுதுக.`
    : lang === "Sinhala"
      ? `ප්‍රශ්න ${of} න් ඕනෑම ප්‍රශ්න ${n} කට පිළිතුරු සපයන්න.`
      : `Answer any ${n} of the ${of} questions.`;
}

export function marksText(n: number, lang: Lang): string {
  const v = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return `[${v} ${labels(lang).marks}]`;
}
