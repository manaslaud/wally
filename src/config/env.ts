import "dotenv/config";

const SUBGRAPH_API_KEY = process.env.SUBGRAPH_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

if (!SUBGRAPH_API_KEY) {
  throw new Error("Missing SUBGRAPH_API_KEY in .env");
}

if (!DATABASE_URL) {
  throw new Error("Missing DATABASE_URL in .env");
}

export const env = {
  SUBGRAPH_API_KEY,
  DATABASE_URL,
} as const;
