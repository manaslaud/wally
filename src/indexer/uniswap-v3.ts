import "dotenv/config";

import { GraphResponse, Swap } from "../types/indexer/uniswap-v3";

import { GRAPH_URL } from "../config/indexer";

export interface WalletData {
  wallet: string;
  swaps: Swap[];
}

export interface IndexerOptions {
  walletCount: number;
  concurrency?: number;
}

export class UniswapV3Indexer {
  private readonly pageSize = 1000;
  private readonly concurrency: number;
  private readonly walletCount: number;

  constructor(options: IndexerOptions) {
    if (options.walletCount <= 0) {
      throw new Error("walletCount must be greater than 0");
    }

    this.walletCount = options.walletCount;
    this.concurrency = options.concurrency ?? 10;
  }

  /**
   * Query the Uniswap V3 subgraph.
   */
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
   * Discover unique wallets by walking through swaps.
   *
   * Sender addresses are the wallet identifier.
   */
  async discoverWallets(targetCount: number): Promise<string[]> {
    const wallets = new Set<string>();
    let lastId = "";

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
          sender
        }
      }
    `;

    console.log(`Discovering ${targetCount} unique wallets...`);

    while (wallets.size < targetCount) {
      const data = await this.query<{
        swaps: Pick<Swap, "id" | "sender">[];
      }>(query, {
        first: this.pageSize,
        lastId,
      });

      const swaps = data.swaps;

      if (swaps.length === 0) {
        break;
      }

      for (const swap of swaps) {
        wallets.add(swap.sender.toLowerCase());

        if (wallets.size >= targetCount) {
          break;
        }
      }

      lastId = swaps[swaps.length - 1].id;

      console.log(`  discovered ${wallets.size}/${targetCount} wallets`);

      if (swaps.length < this.pageSize) {
        break;
      }
    }

    const result = [...wallets].slice(0, targetCount);

    console.log(`Finished wallet discovery: ${result.length} wallets`);

    return result;
  }

  /**
   * Fetch every swap made by a wallet.
   */
  async fetchWalletSwaps(wallet: string): Promise<Swap[]> {
    const query = `
      query WalletSwaps(
        $wallet: Bytes!,
        $first: Int!,
        $lastId: ID!
      ) {
        swaps(
          first: $first
          where: {
            sender: $wallet
            id_gt: $lastId
          }
          orderBy: id
          orderDirection: asc
        ) {
          id
          timestamp
          sender
          recipient
          amount0
          amount1

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
    let lastId = "";

    while (true) {
      const data = await this.query<{
        swaps: Swap[];
      }>(query, {
        wallet: wallet.toLowerCase(),
        first: this.pageSize,
        lastId,
      });

      const batch = data.swaps;

      if (batch.length === 0) {
        break;
      }

      swaps.push(...batch);

      lastId = batch[batch.length - 1].id;

      if (batch.length < this.pageSize) {
        break;
      }
    }

    return swaps;
  }

  /**
   * Fetch swaps for multiple wallets with limited concurrency.
   */
  async fetchWalletData(wallets: string[]): Promise<WalletData[]> {
    const results: WalletData[] = new Array(wallets.length);
    let nextIndex = 0;

    const worker = async (): Promise<void> => {
      while (true) {
        const index = nextIndex++;

        if (index >= wallets.length) {
          return;
        }

        const wallet = wallets[index];

        try {
          console.log(`[${index + 1}/${wallets.length}] ${wallet}`);

          const swaps = await this.fetchWalletSwaps(wallet);

          results[index] = {
            wallet,
            swaps,
          };

          console.log(`[${index + 1}/${wallets.length}] ${swaps.length} swaps`);
        } catch (error) {
          console.error(`Failed to fetch ${wallet}:`, error);

          results[index] = {
            wallet,
            swaps: [],
          };
        }
      }
    };

    const workers = Array.from(
      { length: Math.min(this.concurrency, wallets.length) },
      () => worker(),
    );

    await Promise.all(workers);

    return results;
  }

  /**
   * Discover wallets, then fetch each wallet's swaps.
   */
  async index(): Promise<WalletData[]> {
    const wallets = await this.discoverWallets(this.walletCount);

    return this.fetchWalletData(wallets);
  }
}
