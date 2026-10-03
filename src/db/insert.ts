export type InsertManyOptions = {
  chunkSize?: number;
  retries?: number;
};

const TRANSIENT_PRISMA_CODES = new Set([
  "P1001",
  "P1002",
  "P1008",
  "P1017",
  "P2024",
  "P2034",
]);

function isTransientPrismaError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const code =
    "code" in error && error.code !== undefined ? String(error.code) : "";

  if (TRANSIENT_PRISMA_CODES.has(code)) {
    return true;
  }

  const message =
    "message" in error && error.message !== undefined
      ? String(error.message)
      : "";

  return /ECONNRESET|ECONNREFUSED|ETIMEDOUT|connection terminated|too many clients/i.test(
    message,
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function insertManyWithRetry<T>(
  rows: T[],
  insertFn: (chunk: T[]) => Promise<unknown>,
  options: InsertManyOptions = {},
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  const chunkSize = options.chunkSize ?? 500;
  const retries = options.retries ?? 3;
  const totalChunks = Math.ceil(rows.length / chunkSize);

  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize);
    const chunkNumber = Math.floor(offset / chunkSize) + 1;

    let attempt = 0;

    while (true) {
      try {
        await insertFn(chunk);
        console.log(
          `  inserted chunk ${chunkNumber}/${totalChunks} (${chunk.length} rows)`,
        );
        break;
      } catch (error) {
        attempt += 1;

        if (attempt > retries || !isTransientPrismaError(error)) {
          console.error(`  failed chunk ${chunkNumber}/${totalChunks}:`, error);
          throw error;
        }

        const delay = 250 * 2 ** (attempt - 1);

        console.warn(
          `  retry ${attempt}/${retries} for chunk ${chunkNumber}/${totalChunks} after ${delay}ms`,
        );

        await sleep(delay);
      }
    }
  }
}
