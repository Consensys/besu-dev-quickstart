
export interface NetworkContext {
    networkType: "private" | "public";
    nodeCount: number;
    otel: boolean;
    chainlens: boolean;
    outputPath: string;
}
