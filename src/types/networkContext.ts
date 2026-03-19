
export interface NetworkContext {
    networkType: "private" | "public";
    nodeCount: number;
    monitoring: "grafana" | "splunk";
    chainlens: boolean;
    outputPath: string;
}
