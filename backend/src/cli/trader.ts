import { createInterface } from "node:readline/promises";

const rl = createInterface({ input: process.stdin, output: process.stdout });

const Input = {
  async prompt(options: { message: string; default?: string }): Promise<string> {
    const suffix = options.default === undefined ? "" : ` (${options.default})`;
    const answer = (await rl.question(`${options.message}${suffix}: `)).trim();
    return answer === "" ? (options.default ?? "") : answer;
  },
};

const Select = {
  async prompt(options: {
    message: string;
    options: { name: string; value: string }[];
  }): Promise<string> {
    console.log(options.message);
    options.options.forEach((option, index) => console.log(`  ${index + 1}) ${option.name}`));
    while (true) {
      const choice = Number((await rl.question("Choice: ")).trim());
      const selected = options.options[choice - 1];
      if (selected) return selected.value;
      console.log("Invalid choice.");
    }
  },
};
import type { Trade } from "#veta/types/trade";

const DEFAULT_OMS_URL = process.env.OMS_URL || "http://localhost:5002";
const DEFAULT_TWAP_URL = process.env.TWAP_ALGO_URL || "http://localhost:5004";
const DEFAULT_POV_URL = process.env.POV_ALGO_URL || "http://localhost:5005";

async function placeTrade() {
  console.log("🚀 Welcome to the Trading CLI! 🎉");

  const strategy = await Select.prompt({
    message: "Choose strategy:",
    options: [
      { name: "Limit Order", value: "LIMIT" },
      { name: "TWAP (Time-Weighted Average Price)", value: "TWAP" },
      { name: "POV (Percentage of Volume)", value: "POV" },
    ],
  });

  const asset = await Input.prompt({ message: "Enter asset", default: "AAPL" });

  const side = await Select.prompt({
    message: "Enter trade side:",
    options: [
      { name: "BUY", value: "BUY" },
      { name: "SELL", value: "SELL" },
    ],
  });

  const quantity = Number(await Input.prompt({ message: "Enter quantity", default: "10" }));
  if (Number.isNaN(quantity) || quantity <= 0) {
    console.log("❌ Invalid quantity. Please enter a positive number.");
    return;
  }

  const limitPrice = Number(await Input.prompt({ message: "Enter limit price", default: "150" }));
  if (Number.isNaN(limitPrice) || limitPrice <= 0) {
    console.log("❌ Invalid limit price. Please enter a valid number.");
    return;
  }

  const expiresAt = Number(
    await Input.prompt({
      message: "Enter expiry time in seconds",
      default: "300",
    })
  );
  if (Number.isNaN(expiresAt) || expiresAt <= 0) {
    console.log("❌ Invalid expiry time. Please enter a positive number.");
    return;
  }

  const trade: Trade = {
    asset,
    side: side as "BUY" | "SELL",
    quantity,
    limitPrice,
    expiresAt,
  };

  let algoUrl = DEFAULT_OMS_URL;
  if (strategy === "TWAP") algoUrl = DEFAULT_TWAP_URL;
  if (strategy === "POV") algoUrl = DEFAULT_POV_URL;

  console.log("📡 Sending trade request to:", algoUrl, trade);

  try {
    const response = await fetch(algoUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(trade),
    });

    if (!response.ok) {
      console.log(`❌ OMS/Algo responded with an error: ${response.status} ${response.statusText}`);
      return;
    }

    const result = await response.json();
    console.log("✅ Trade Result:", result);
  } catch (error) {
    console.log("❌ Failed to execute trade:", error);
  }
}

placeTrade().finally(() => rl.close());
