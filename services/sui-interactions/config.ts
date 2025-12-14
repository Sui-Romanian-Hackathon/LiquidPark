import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import type { NetworkType, DeploymentInfo } from "./types.js";

// ============================================================================
// CONFIG TYPES
// ============================================================================

export interface NetworkConfig {
  packageId: string;
  reputationRegistryId: string;
  zoneRegistryId: string;
  escrowConfigId: string;
}

export interface Config {
  networks: {
    mainnet: NetworkConfig;
    testnet: NetworkConfig;
    devnet: NetworkConfig;
  };
  defaultNetwork: NetworkType;
}

// ============================================================================
// CONFIG LOADER
// ============================================================================

let cachedConfig: Config | null = null;

/**
 * Load config from config.json file.
 * Config is cached after first load.
 */
export function loadConfig(): Config {
  if (cachedConfig) {
    return cachedConfig;
  }

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const configPath = join(__dirname, "config.json");

  const configContent = readFileSync(configPath, "utf-8");
  cachedConfig = JSON.parse(configContent) as Config;

  return cachedConfig;
}

/**
 * Get deployment info for a specific network.
 */
export function getDeploymentInfo(network?: NetworkType): DeploymentInfo {
  const config = loadConfig();
  const targetNetwork = network ?? config.defaultNetwork;
  const networkConfig = config.networks[targetNetwork];

  return {
    packageId: networkConfig.packageId,
    reputationRegistryId: networkConfig.reputationRegistryId,
    zoneRegistryId: networkConfig.zoneRegistryId,
    escrowConfigId: networkConfig.escrowConfigId,
  };
}

/**
 * Get the default network from config.
 */
export function getDefaultNetwork(): NetworkType {
  return loadConfig().defaultNetwork;
}
