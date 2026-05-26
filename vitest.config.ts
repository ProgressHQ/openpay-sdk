import { defineConfig } from "vitest/config";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const dir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@openpay/core": resolve(dir, "packages/core/src/index.ts"),
      "@openpay/provider-mock": resolve(dir, "packages/provider-mock/src/index.ts"),
      "@openpay/provider-taler": resolve(dir, "packages/provider-taler/src/index.ts"),
      "@openpay/provider-stripe": resolve(dir, "packages/provider-stripe/src/index.ts"),
      "@openpay/provider-mollie": resolve(dir, "packages/provider-mollie/src/index.ts"),
      "@openpay/provider-paypal": resolve(dir, "packages/provider-paypal/src/index.ts"),
      "@openpay/webhooks": resolve(dir, "packages/webhooks/src/index.ts"),
      "@openpay/express": resolve(dir, "packages/express/src/index.ts"),
    },
  },
  test: {
    include: ["packages/*/src/**/*.test.ts", "packages/*/src/**/*.test.tsx"],
  },
});
