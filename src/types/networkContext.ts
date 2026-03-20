
export interface NetworkContext {
    networkType: "private" | "public";
    networkName: "private" | "mainnet" | "hoodi" | "sepolia" ;
    nodeCount: number;
    otel: boolean;
    chainlens: boolean;
    outputPath: string;
}
