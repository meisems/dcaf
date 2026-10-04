import assert from "node:assert/strict";
import { test } from "node:test";
import { initConfig } from "../src/config.ts";

test("<placeholder> values count as not set", () => {
  const c = initConfig({
    TOKEN_CONTRACT: "<your-token-contract>",
    VAULT_ACCOUNT: "<your-vault-account>",
    REWARD_SHARE: "<0-to-1>",
    VAULT_PRIVATE_KEY: "<ed25519:vault-full-access-key>",
    LAVA_RPC_URL: "<lava-near-mainnet-https-url>",
    DRPC_RPC_URL: "https://drpc.example/KEY",
    PRIVATE_RPC_URLS: "<getblock-near-mainnet-url>, https://other.example/KEY",
    START_BLOCK: "<launch-block-height>",
  });
  assert.equal(c.test, true, "no real token yet → test mode");
  assert.equal(c.dryRun, true);
  assert.equal(c.vaultKey, "");
  assert.equal(c.startBlock, null);
  assert.deepEqual(c.rpcPrivate, ["https://drpc.example/KEY", "https://other.example/KEY"]);
});
