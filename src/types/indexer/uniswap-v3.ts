export type Swap = {
  id: string;
  timestamp: string;
  logIndex: string;
  sender: string;
  recipient: string;
  origin: string;

  amount0: string;
  amount1: string;

  token0: {
    id: string;
    symbol: string;
    name: string;
    decimals: string;
  };

  token1: {
    id: string;
    symbol: string;
    name: string;
    decimals: string;
  };

  pool: {
    id: string;
    feeTier: string;
  };

  transaction: {
    id: string;
    blockNumber: string;
  };
};

export type WalletData = {
  wallet: string;
  swaps: Swap[];
};

export type GraphResponse = {
  data?: {
    swaps: Swap[];
  };

  errors?: {
    message: string;
  }[];
};
