import {
  GRAPH_URL,
  SKIPPED_ORIGINS,
  TRAINING_DATASET,
} from "../config/indexer";
import { persistWalletData } from "../db/uniswap-v3";
import { GraphResponse, Swap, WalletData } from "../types/indexer/uniswap-v3";

export type { WalletData };

export interface IndexerOptions {
  maxSwaps?: number;
  minSwapsPerWallet?: number;
  maxSwapsPerWallet?: number;
  walletCandidates?: number;
  concurrency?: number;
}

type DiscoverSwap = {
  id: string;
  origin: string;
};

export class UniswapV3Indexer {
  private readonly pageSize = 1000;
  private readonly maxSwaps: number;
  private readonly minSwapsPerWallet: number;
  private readonly maxSwapsPerWallet: number;
  private readonly walletCandidates: number;
  private readonly concurrency: number;

  constructor(options: IndexerOptions = {}) {
    this.maxSwaps = options.maxSwaps ?? TRAINING_DATASET.maxSwaps;
    this.minSwapsPerWallet =
      options.minSwapsPerWallet ?? TRAINING_DATASET.minSwapsPerWallet;
    this.maxSwapsPerWallet =
      options.maxSwapsPerWallet ?? TRAINING_DATASET.maxSwapsPerWallet;
    this.walletCandidates =
      options.walletCandidates ?? TRAINING_DATASET.walletCandidates;
    this.concurrency = options.concurrency ?? TRAINING_DATASET.concurrency;

    if (this.maxSwaps <= 0) {
      throw new Error("maxSwaps must be greater than 0");
    }

    if (this.minSwapsPerWallet <= 0) {
      throw new Error("minSwapsPerWallet must be greater than 0");
    }

    if (this.maxSwapsPerWallet < this.minSwapsPerWallet) {
      throw new Error("maxSwapsPerWallet must be >= minSwapsPerWallet");
    }
  }

  private async query<T>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<T> {
    const response = await fetch(GRAPH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Graph request failed: ${response.status} ${response.statusText}`,
      );
    }

    const result = (await response.json()) as GraphResponse;

    if (result.errors?.length) {
      throw new Error(result.errors.map((error) => error.message).join("\n"));
    }

    return result.data as T;
  }

  /**
   * Collect unique swap origins, skipping routers and the zero address.
   *
   * Origin is the EOA that initiated the swap, which is the right unit
   * for wallet-level training data.
   */
  async discoverWallets(targetCount: number): Promise<string[]> {
    const wallets = new Set<string>();
    let lastId = "";
    let pages = 0;
    let scanned = 0;
    let skipped = 0;

    const query = `
      query DiscoverWallets(
        $first: Int!,
        $lastId: ID!
      ) {
        swaps(
          first: $first
          where: {
            id_gt: $lastId
          }
          orderBy: id
          orderDirection: asc
        ) {
          id
          origin
        }
      }
    `;

    console.log(
      `Discovering up to ${targetCount} unique origins ` +
        `(skipping ${SKIPPED_ORIGINS.size} known routers)...`,
    );

    while (wallets.size < targetCount) {
      const data = await this.query<{
        swaps: DiscoverSwap[];
      }>(query, {
        first: this.pageSize,
        lastId,
      });

      const swaps = data.swaps;

      if (swaps.length === 0) {
        console.log("  discovery stopped: no more swaps");
        break;
      }

      pages += 1;
      scanned += swaps.length;

      for (const swap of swaps) {
        const origin = swap.origin?.toLowerCase();

        if (!origin || SKIPPED_ORIGINS.has(origin)) {
          skipped += 1;
          continue;
        }

        wallets.add(origin);

        if (wallets.size >= targetCount) {
          break;
        }
      }

      lastId = swaps[swaps.length - 1].id;

      console.log(
        `  page ${pages}: scanned ${scanned} swaps, ` +
          `${wallets.size}/${targetCount} origins, skipped ${skipped}`,
      );

      if (swaps.length < this.pageSize) {
        break;
      }
    }

    const result = [...wallets].slice(0, targetCount);

    console.log(
      `Finished wallet discovery: ${result.length} origins ` +
        `(scanned ${scanned} swaps across ${pages} pages, skipped ${skipped})`,
    );

    return result;
  }

  /**
   * Fetch a bounded recent history for a wallet, newest first.
   */
  async fetchWalletSwaps(wallet: string, limit: number): Promise<Swap[]> {
    const query = `
      query WalletSwaps(
        $wallet: Bytes!,
        $first: Int!,
        $skip: Int!
      ) {
        swaps(
          first: $first
          skip: $skip
          where: {
            origin: $wallet
          }
          orderBy: timestamp
          orderDirection: desc
        ) {
          id
          timestamp
          logIndex
          sender
          recipient
          origin
          amount0
          amount1
          amountUSD

          token0 {
            id
            symbol
            name
            decimals
          }

          token1 {
            id
            symbol
            name
            decimals
          }

          pool {
            id
            feeTier
          }

          transaction {
            id
            blockNumber
          }
        }
      }
    `;

    const swaps: Swap[] = [];
    let skip = 0;
    let page = 0;

    while (swaps.length < limit) {
      const remaining = limit - swaps.length;
      const first = Math.min(this.pageSize, remaining);

      page += 1;

      const data = await this.query<{
        swaps: Swap[];
      }>(query, {
        wallet: wallet.toLowerCase(),
        first,
        skip,
      });

      const batch = data.swaps;

      console.log(
        `    ${wallet} page ${page}: fetched ${batch.length} ` +
          `(wallet total ${swaps.length + batch.length}/${limit})`,
      );

      if (batch.length === 0) {
        break;
      }

      swaps.push(...batch);
      skip += batch.length;

      if (batch.length < first) {
        break;
      }
    }

    return swaps.slice(0, limit);
  }

  async fetchWalletData(wallets: string[]): Promise<WalletData[]> {
    const results: WalletData[] = [];
    let nextIndex = 0;
    let remainingSwaps = this.maxSwaps;
    let persistedSwaps = 0;
    let skippedShort = 0;
    let skippedBudget = 0;
    let failed = 0;

    const takeBudget = (count: number): number => {
      if (remainingSwaps < this.minSwapsPerWallet) {
        return 0;
      }

      const allowed = Math.min(count, remainingSwaps);
      remainingSwaps -= allowed;
      return allowed;
    };

    const worker = async (): Promise<void> => {
      while (true) {
        if (remainingSwaps < this.minSwapsPerWallet) {
          return;
        }

        const index = nextIndex++;

        if (index >= wallets.length) {
          return;
        }

        const wallet = wallets[index];
        const walletLimit = Math.min(this.maxSwapsPerWallet, remainingSwaps);

        if (walletLimit < this.minSwapsPerWallet) {
          skippedBudget += 1;
          console.log(
            `[${index + 1}/${wallets.length}] skip ${wallet}: ` +
              `budget ${remainingSwaps} below min ${this.minSwapsPerWallet}`,
          );
          return;
        }

        console.log(
          `[${index + 1}/${wallets.length}] ${wallet} ` +
            `(limit ${walletLimit}, budget ${remainingSwaps})`,
        );

        let swaps: Swap[] = [];

        try {
          swaps = await this.fetchWalletSwaps(wallet, walletLimit);
        } catch (error) {
          failed += 1;
          console.error(`  failed to fetch ${wallet}:`, error);
          continue;
        }

        if (swaps.length < this.minSwapsPerWallet) {
          skippedShort += 1;
          console.log(
            `  skip ${wallet}: ${swaps.length} swaps < min ${this.minSwapsPerWallet}`,
          );
          continue;
        }

        const allowed = takeBudget(swaps.length);

        if (allowed < this.minSwapsPerWallet) {
          remainingSwaps += allowed;
          skippedBudget += 1;
          console.log(
            `  skip ${wallet}: not enough remaining budget for a useful sequence`,
          );
          return;
        }

        const data: WalletData = {
          wallet,
          swaps: swaps.slice(0, allowed),
        };

        try {
          await persistWalletData(data);
          persistedSwaps += data.swaps.length;
          results.push(data);

          console.log(
            `  persisted ${wallet}: ${data.swaps.length} swaps ` +
              `(run ${persistedSwaps}/${this.maxSwaps}, budget ${remainingSwaps})`,
          );
        } catch (error) {
          remainingSwaps += allowed;
          failed += 1;
          console.error(`  failed to persist ${wallet}:`, error);
        }
      }
    };

    const workers = Array.from(
      { length: Math.min(this.concurrency, wallets.length) },
      () => worker(),
    );

    await Promise.all(workers);

    console.log(
      `Fetch complete: ${results.length} wallets, ${persistedSwaps} swaps ` +
        `(skipped short=${skippedShort}, budget=${skippedBudget}, failed=${failed})`,
    );

    return results;
  }

  async index(): Promise<WalletData[]> {
    console.log(
      `Training indexer: max ${this.maxSwaps} swaps, ` +
        `${this.minSwapsPerWallet}-${this.maxSwapsPerWallet} per wallet, ` +
        `${this.concurrency} workers`,
    );

    const wallets = await this.discoverWallets(this.walletCandidates);

    return this.fetchWalletData(wallets);
  }
}
