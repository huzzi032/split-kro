import Groq from "groq-sdk";

// ─── Types ───
export interface ParsedExpense {
  recognized: boolean;
  amount: number | null;
  currency: string;
  category: string;
  description: string;
  date: string;
  paidBy: string;
  splitType: "equal" | "custom" | "percentage";
  participants: string[];
  splits: Record<string, number>;
  confidence: number;
}

export interface ParsedQuery {
  type: "balance" | "who_owes" | "settle" | "export" | "stats" | "summary" | "unknown";
  targetUser?: string;
  timeRange?: string;
}

export interface AIResult {
  recognized: boolean;
  type: "expense" | "query" | "settlement" | "info";
  expense: ParsedExpense | null;
  query: ParsedQuery | null;
  message: string;
  action: string;
}

// ─── Currency & Category Keywords ───
const CURRENCY_MAP: Record<string, string> = {
  rupees: "PKR", rupaye: "PKR", rs: "PKR", pkr: "PKR",
  dollars: "USD", usd: "USD", "\u0024": "USD",
  euros: "EUR", eur: "EUR", "\u20AC": "EUR",
  pounds: "GBP", gbp: "GBP", "\u00A3": "GBP",
};

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Food: ["food", "lunch", "dinner", "breakfast", "groceries", "grocery", "restaurant", "cafe", "coffee", "snack", "meal", "biryani", "pizza", "burger", "khana", "roti", "chai"],
  Rent: ["rent", "lease", "apartment", "house", "flat", "kiraya", "makan"],
  Utilities: ["utilities", "electric", "electricity", "bill", "gas", "water", "internet", "wifi", "phone", "mobile", "bijli", "bill"],
  Entertainment: ["entertainment", "movie", "cinema", "concert", "game", "netflix", "subscription", "spotify", "fun", "trip", "tour"],
  Transport: ["transport", "uber", "taxi", "cab", "bus", "train", "flight", "fuel", "petrol", "diesel", "car", "bike", "rickshaw"],
  Shopping: ["shopping", "clothes", "shoes", "electronics", "gadget", "amazon", "daraz", "market", "bazaar"],
  Health: ["health", "medical", "doctor", "hospital", "medicine", "pharmacy", "dawai"],
  Travel: ["travel", "hotel", "vacation", "holiday", "flight", "ticket"],
  Education: ["education", "course", "book", "tuition", "school", "college", "university", "fee"],
};

const DATE_KEYWORDS: Record<string, () => string> = {
  today: () => formatDate(new Date()),
  aj: () => formatDate(new Date()),
  aaj: () => formatDate(new Date()),
  yesterday: () => formatDate(new Date(Date.now() - 86400000)),
  kal: () => formatDate(new Date(Date.now() - 86400000)),
};

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

// ─── Built-in NLP Parser ───
export function parseNaturalLanguage(
  message: string,
  groupMembers: { id: number; name: string }[],
  currentUserName: string,
): AIResult {
  const lower = message.toLowerCase();

  // Try to detect if this is a query
  const queryType = detectQueryType(lower);
  if (queryType && !hasExpenseIndicators(lower)) {
    return {
      recognized: true,
      type: "query",
      expense: null,
      query: queryType,
      message: generateQueryResponse(queryType),
      action: "query",
    };
  }

  // Extract amount
  const amount = extractAmount(message);
  if (!amount) {
    return {
      recognized: false,
      type: "info",
      expense: null,
      query: null,
      message: "I couldn't find an amount in your message. Please include the expense amount (e.g., '5000 rupees').",
      action: "unknown",
    };
  }

  // Extract currency
  const currency = extractCurrency(lower) ?? "PKR";

  // Extract category
  const category = extractCategory(lower) ?? "Other";

  // Extract date
  const date = extractDate(lower) ?? formatDate(new Date());

  // Extract participants
  const participants = extractParticipants(lower, groupMembers, currentUserName);
  if (participants.length === 0) {
    // Default to current user only
    participants.push({ id: groupMembers.find(m => m.name === currentUserName)?.id ?? 0, name: currentUserName });
  }

  // Detect split type
  const splitType = detectSplitType(lower);

  // Calculate splits
  const splits: Record<string, number> = {};
  if (splitType === "equal") {
    const perPerson = Math.round((amount / participants.length) * 100) / 100;
    for (const p of participants) {
      splits[p.name] = perPerson;
    }
  } else if (splitType === "percentage") {
    const percentages = extractPercentages(message);
    for (const p of participants) {
      const pct = percentages[p.name.toLowerCase()] ?? (100 / participants.length);
      splits[p.name] = Math.round((amount * pct / 100) * 100) / 100;
    }
  } else {
    // Custom amounts
    const customAmounts = extractCustomAmounts(message);
    for (const p of participants) {
      splits[p.name] = customAmounts[p.name.toLowerCase()] ?? Math.round((amount / participants.length) * 100) / 100;
    }
  }

  // Determine payer
  const paidBy = detectPayer(lower, currentUserName, participants.map(p => p.name));

  // Generate description
  const description = generateDescription(message, category);

  const expense: ParsedExpense = {
    recognized: true,
    amount,
    currency,
    category,
    description,
    date,
    paidBy,
    splitType,
    participants: participants.map(p => p.name),
    splits,
    confidence: 0.85,
  };

  return {
    recognized: true,
    type: "expense",
    expense,
    query: null,
    message: `I understood: ${description} for ${amount} ${currency}, paid by ${paidBy}, split ${splitType} among ${participants.map(p => p.name).join(", ")}. Confirm to add?`,
    action: "expense_created",
  };
}

function extractAmount(text: string): number | null {
  // Match patterns like "5000", "5,000", "5,000.50"
  const matches = text.match(/(?:rs\.?|rupees?|rupaye|₹|\$|€|£)?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:rs\.?|rupees?|rupaye|₹|\$|€|£)?/gi);
  if (!matches) return null;

  // Get the largest number (usually the amount)
  let maxAmount = 0;
  for (const match of matches) {
    const clean = match.replace(/[^\d.]/g, "");
    const num = parseFloat(clean);
    if (!isNaN(num) && num > maxAmount) maxAmount = num;
  }
  return maxAmount > 0 ? maxAmount : null;
}

function extractCurrency(text: string): string | null {
  for (const [key, val] of Object.entries(CURRENCY_MAP)) {
    if (text.includes(key)) return val;
  }
  if (text.includes("\u0024")) return "USD";
  if (text.includes("\u20AC")) return "EUR";
  if (text.includes("\u00A3")) return "GBP";
  return null;
}

function extractCategory(text: string): string | null {
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (text.includes(kw)) return cat;
    }
  }
  return null;
}

function extractDate(text: string): string | null {
  for (const [key, fn] of Object.entries(DATE_KEYWORDS)) {
    if (text.includes(key)) return fn();
  }
  // Try to match YYYY-MM-DD
  const dateMatch = text.match(/(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) return dateMatch[1];
  return null;
}

function extractParticipants(
  text: string,
  groupMembers: { id: number; name: string }[],
  currentUserName: string,
): { id: number; name: string }[] {
  const found: { id: number; name: string }[] = [];
  const lower = text.toLowerCase();

  for (const member of groupMembers) {
    const memberLower = member.name.toLowerCase();
    if (lower.includes(memberLower) && !found.find(f => f.id === member.id)) {
      found.push(member);
    }
  }

  // Check for "me", "my", "I" and add current user
  const selfIndicators = [" me ", " i ", "myself", "me and", "and me", "mein", "main", "mujhe"];
  const hasSelf = selfIndicators.some(ind => lower.includes(ind));
  if (hasSelf && !found.find(f => f.name === currentUserName)) {
    const currentUser = groupMembers.find(m => m.name === currentUserName);
    if (currentUser) found.push(currentUser);
  }

  // Check for number of people: "3 log", "4 people", "hum 5"
  const peopleMatch = text.match(/(?:hum|we|there)\s+(?:were\s+)?(\d+)\s*(?:log|people|persons|members)/i);
  if (peopleMatch && found.length === 0) {
    // Can't identify who, but we know how many
    // Add current user as placeholder
    const currentUser = groupMembers.find(m => m.name === currentUserName);
    if (currentUser) found.push(currentUser);
  }

  return found;
}

function detectSplitType(text: string): "equal" | "custom" | "percentage" {
  const lower = text.toLowerCase();
  if (lower.includes("percent") || lower.includes("%") || lower.includes("percentag")) return "percentage";
  if (lower.includes("equal") || lower.includes("same") || lower.includes("barabar") || lower.includes("divide") || lower.includes("split equal")) return "equal";
  return "custom";
}

function extractPercentages(text: string): Record<string, number> {
  const result: Record<string, number> = {};
  // Match patterns like "ali 40%", "me 30%", etc.
  const regex = /(\w+)\s+(\d+)%/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    result[match[1].toLowerCase()] = parseInt(match[2]);
  }
  return result;
}

function extractCustomAmounts(text: string): Record<string, number> {
  const result: Record<string, number> = {};
  // Match patterns like "ali 2000", "sara 1500" but exclude the main amount
  const allNumbers = text.match(/(\w+)\s+(\d+(?:\.\d{1,2})?)/g);
  if (allNumbers) {
    for (const n of allNumbers) {
      const parts = n.match(/(\w+)\s+(\d+(?:\.\d{1,2})?)/);
      if (parts) {
        result[parts[1].toLowerCase()] = parseFloat(parts[2]);
      }
    }
  }
  return result;
}

function detectPayer(text: string, currentUserName: string, participantNames: string[]): string {
  const lower = text.toLowerCase();
  if (lower.includes("paid by") || lower.includes("pay kiya") || lower.includes("paid for")) {
    for (const name of participantNames) {
      if (lower.includes(`paid by ${name.toLowerCase()}`) || lower.includes(`${name.toLowerCase()} ne pay`)) {
        return name;
      }
    }
  }
  if (lower.includes("i paid") || lower.includes("main ne") || lower.includes("meine")) return currentUserName;
  return currentUserName; // Default to current user
}

function generateDescription(text: string, category: string): string {
  let cleaned = text
    .replace(/\d+/g, "")
    .replace(/rs\.?|rupees?|rupaye|\u20B9|\u0024|\u20AC|\u00A3/gi, "")
    .replace(/equal|split|divide|among|between|me|and|i|my|we|hum|aaj|aj|kal|today|yesterday/gi, "")
    .replace(/%/g, "")
    .trim();

  if (cleaned.length < 3) return category;
  return cleaned.substring(0, 50) || category;
}

function detectQueryType(text: string): ParsedQuery | null {
  const lower = text.toLowerCase();

  if (lower.includes("balance") || lower.includes("kitna") || lower.includes("how much")) {
    return { type: "balance" };
  }
  if (lower.includes("who owes") || lower.includes("owe me") || lower.includes("debt") || lower.includes("mujhe kitne")) {
    const targetMatch = lower.match(/who owes (\w+)/);
    return { type: "who_owes", targetUser: targetMatch ? targetMatch[1] : undefined };
  }
  if (lower.includes("settle") || lower.includes("payment") || lower.includes("pay") || lower.includes("clear")) {
    return { type: "settle" };
  }
  if (lower.includes("summary") || lower.includes("report") || lower.includes("stats") || lower.includes("overview")) {
    const timeMatch = lower.match(/(this month|last month|this week|last week|today|yesterday)/);
    return { type: "summary", timeRange: timeMatch ? timeMatch[1] : "this month" };
  }
  if (lower.includes("export") || lower.includes("csv") || lower.includes("download")) {
    return { type: "export" };
  }

  return null;
}

function hasExpenseIndicators(text: string): boolean {
  const amount = extractAmount(text);
  if (amount && amount > 0) return true;
  const expenseWords = ["spent", "cost", "price", "buy", "purchase", "bill", "paid", "expense", "kharcha", "khareeda", "daam"];
  return expenseWords.some(w => text.includes(w));
}

function generateQueryResponse(query: ParsedQuery): string {
  switch (query.type) {
    case "balance":
      return `I'll check your balance now. You can also see it on the dashboard.`;
    case "who_owes":
      return `Let me check who owes money in this group.`;
    case "settle":
      return `I can help you settle up. Who would you like to settle with?`;
    case "summary":
      return `I'll prepare a summary for ${query.timeRange ?? "this month"}.`;
    case "export":
      return `You can export your expenses from the Analytics page.`;
    default:
      return `I'm here to help! Try saying something like "Lunch 5000 rupees, split equal" or "Show my balance".`;
  }
}

// ─── Groq Integration (Optional Enhancement) ───
export async function parseWithGroq(
  message: string,
  groupMembers: { id: number; name: string }[],
  currentUserName: string,
  apiKey?: string,
): Promise<AIResult | null> {
  if (!apiKey) return null;

  try {
    const groq = new Groq({ apiKey });

    const memberList = groupMembers.map(m => ({ name: m.name, id: m.id }));
    const today = new Date().toISOString().split("T")[0];

    const prompt = `You are an expense tracking assistant.

Current Group Members: ${JSON.stringify(memberList)}
Current User: ${currentUserName}
Current Date: ${today}

User Message: "${message}"

Extract and return ONLY valid JSON:
{
  "recognized": true/false,
  "type": "expense|query|settlement|info",
  "expense": {
    "amount": number,
    "currency": "PKR|USD|etc",
    "category": "Food|Rent|Utilities|Entertainment|Transport|Shopping|Health|Travel|Education|Other",
    "description": "string",
    "date": "YYYY-MM-DD",
    "paid_by": "current_user|other_member_name",
    "split_type": "equal|custom|percentage",
    "participants": ["member1", "member2"],
    "splits": {"member1": amount_or_percentage, "member2": amount_or_percentage},
    "confidence": 0.0-1.0
  },
  "query": {
    "type": "balance|who_owes|settle|export|stats|summary|unknown",
    "target_user": "optional",
    "time_range": "optional"
  },
  "message": "Natural helpful response"
}

Rules:
- Extract amounts as numbers only
- Match member names exactly (case-insensitive)
- For equal split, calculate automatically
- For percentage split, ensure total = 100
- If confidence < 0.7, ask for clarification
- Respond in same language user used (Urdu/English)
- Default currency PKR if not mentioned
- Default date today if not mentioned`;

    const completion = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "llama3-70b-8192",
      temperature: 0.2,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);

    return {
      recognized: parsed.recognized ?? true,
      type: parsed.type ?? "info",
      expense: parsed.expense ?? null,
      query: parsed.query ?? null,
      message: parsed.message ?? "I understood your message.",
      action: parsed.type === "expense" ? "expense_created" : parsed.type ?? "info",
    };
  } catch (error) {
    console.error("Groq parsing error:", error);
    return null;
  }
}
