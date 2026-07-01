
export interface NetworkContext {
    networkType: "private" | "public";
    networkName: "private" | "mainnet" | "hoodi" | "sepolia" ;
    privacy: boolean;
    otel: boolean;
    chainlens: boolean;
    outputPath: string;
}
