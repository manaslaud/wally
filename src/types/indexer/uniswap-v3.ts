export type Swap = {
  id: string;
  timestamp: string;
  sender: string;
  recipient: string;

  amount0: string;
  amount1: string;

  token0: {
    id: string;
    symbol: string;
    name: string;
    decimals: number;
  };

  token1: {
    id: string;
    symbol: string;
    name: string;
    decimals: number;
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

export type GraphResponse = {
  data?: {
    swaps: Swap[];
  };

  errors?: {
    message: string;
  }[];
};
