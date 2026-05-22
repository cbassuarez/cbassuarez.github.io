// this person — fragment classification.
// Maps an extracted value to a FragmentKind via keyword dictionaries. Pure
// module. Order is significant: specific domains are tested before generic
// ones so "home loan" classifies as real_estate, not finance.

import type { FragmentKind } from "../types";
import { foldCase } from "./normalizeText";

interface KindRule {
  kind: FragmentKind;
  terms: string[];
}

const RULES: KindRule[] = [
  {
    kind: "real_estate",
    terms: [
      "mortgage", "zillow", "redfin", "realtor", "trulia", "home loan",
      "down payment", "house hunting", "open house", "first-time home",
      "home buying", "homeownership", "real estate",
    ],
  },
  {
    kind: "restaurant",
    terms: [
      "starbucks", "mcdonald", "chipotle", "taco bell", "burger king",
      "wendy", "dunkin", "subway", "kfc", "popeyes", "in-n-out", "chick-fil-a",
      "chick fil a", "panera", "domino", "pizza hut", "sonic", "arby",
      "five guys", "shake shack", "olive garden", "denny", "ihop",
      "restaurants", "fast food", "coffee shops", "drive-thru", "drive thru",
    ],
  },
  {
    kind: "travel",
    terms: [
      "cabo", "cancun", "hawaii", "maui", "tulum", "expedia", "booking.com",
      "airbnb", "vrbo", "beach hotel", "beach resort", "all-inclusive",
      "all inclusive", "flight", "flights", "cheap flights", "delta air",
      "united airlines", "southwest", "jetblue", "marriott", "hilton",
      "hyatt", "vacation", "cruise", "travel deals", "passport", "hotels",
      "airlines", "getaway",
    ],
  },
  {
    kind: "vehicle",
    terms: [
      "used car", "auto insurance", "carvana", "carmax", "car dealership",
      "new car", "toyota", "honda", "chevrolet", "tesla", "car loan",
      "auto loan", "test drive", "pickup truck", "used sedan", "car shopping",
    ],
  },
  {
    kind: "home",
    terms: [
      "ikea", "wayfair", "west elm", "crate & barrel", "pottery barn",
      "ashley furniture", "home depot", "lowe's", "furniture", "home decor",
      "home goods", "mattress", "area rug", "patio furniture", "appliances",
      "home improvement", "interior design",
    ],
  },
  {
    kind: "finance",
    terms: [
      "credit card", "personal loan", "refinance", "401k", "robinhood",
      "credit score", "capital one", "balance transfer", "payday", "investing",
      "retirement", "coinbase", "rewards account", "cash back", "loan",
      "debt", "life insurance", "crypto",
    ],
  },
  {
    kind: "education",
    terms: [
      "graduate program", "online degree", "master's", "mba", "coursera",
      "udemy", "university", "student loan", "certificate program",
      "bootcamp", "phd", "community college", "online courses",
    ],
  },
  {
    kind: "literature",
    terms: [
      "leftist literature", "marxist", "radical books", "poetry", "book club",
      "goodreads", "literary fiction", "novels", "used books", "the new yorker",
      "verso books", "left book", "literature", "books",
    ],
  },
  {
    kind: "political",
    terms: [
      "democrat", "republican", "progressive", "conservative", "campaign",
      "politics", "leftist", "socialism", "activism", "voter", "political",
      "climate action", "labor union", "advocacy",
    ],
  },
  {
    kind: "religious",
    terms: ["church", "bible", "faith-based", "catholic", "christian", "mosque", "synagogue", "prayer", "religious"],
  },
  {
    kind: "family",
    terms: [
      "baby registry", "diapers", "wedding venue", "parenting", "daycare",
      "baby products", "stroller", "toddler", "pregnancy", "nursery",
      "wedding planning", "kids' ", "children's",
    ],
  },
  {
    kind: "health",
    terms: [
      "weight loss", "peloton", "gym membership", "supplements", "fitness",
      "therapy", "skincare", "wellness", "vitamins", "ozempic",
      "mental health", "diet", "workout",
    ],
  },
  {
    kind: "entertainment",
    terms: [
      "netflix", "hulu", "spotify", "disney+", "hbo", "max ", "video games",
      "playstation", "xbox", "nintendo", "streaming", "concert tickets",
      "twitch", "movies", "music",
    ],
  },
  {
    kind: "food",
    terms: [
      "groceries", "meal kit", "hellofresh", "blue apron", "instacart",
      "doordash", "uber eats", "grubhub", "snacks", "grocery delivery",
      "organic food",
    ],
  },
  {
    kind: "retail",
    terms: [
      "target", "walmart", "costco", "best buy", "amazon", "etsy", "nordstrom",
      "macy's", "tj maxx", "marshalls", "kohl's", "sephora", "ulta", "old navy",
      "h&m", "zara", "shein", "temu", "dollar general", "apparel", "clothing",
      "shopping", "shoes", "accessories",
    ],
  },
  {
    kind: "technology",
    terms: [
      "apple", "iphone", "samsung", "galaxy", "laptop", "smartphone",
      "microsoft", "macbook", "ipad", "headphones", "smart home", "gadgets",
      "dell", "lenovo", "nvidia", "electronics",
    ],
  },
  {
    kind: "work",
    terms: ["linkedin", "job search", "remote work", "resume", "hiring", "career", "freelance", "job openings"],
  },
];

export function classifyFragment(value: string): FragmentKind {
  const haystack = foldCase(value);
  if (!haystack) return "unknown";
  for (const rule of RULES) {
    for (const term of rule.terms) {
      if (haystack.includes(term)) return rule.kind;
    }
  }
  return "unknown";
}
