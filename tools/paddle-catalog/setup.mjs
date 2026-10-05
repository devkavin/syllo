// Optional setup tool. Never imported into, or shipped with, the web application.
import { Paddle, Environment } from "@paddle/paddle-node-sdk";

const key = process.env.PADDLE_API_KEY || "";
if (!key.startsWith("pdl_sdbx_apikey_")) throw new Error("A sandbox API key is required. Live credentials are refused.");
const paddle = new Paddle(key, { environment: Environment.sandbox });
const create = process.argv.includes("--create");

async function all(collection) {
  const rows = [];
  do { rows.push(...await collection.next()); } while (collection.hasMore);
  return rows;
}

async function setup() {
  const products = await all(paddle.products.list({ status: ["active"] }));
  const prices = await all(paddle.prices.list({ status: ["active"] }));
  const result = {};
  const catalogProducts = [];
  for (const [plan, name, amount] of [["scholar", "Syllo Scholar", "899"], ["deans_list", "Syllo Dean's List", "1399"]]) {
    let product = products.find(p => p.customData?.sylloPlan === plan || p.name === name);
    if (!product) {
      if (!create) throw new Error(`${name} is missing. Run again with --create to create sandbox catalog entries.`);
      product = await paddle.products.create({ name, taxCategory: "saas", customData: { sylloPlan: plan } });
    }
    if (product.taxCategory !== "saas") throw new Error(`${name} must use SaaS tax category. No catalog was changed for this mismatch.`);
    catalogProducts.push({ name, id: product.id });
    let price = prices.find(p => p.productId === product.id && p.unitPrice?.amount === amount && p.unitPrice?.currencyCode === "USD" && p.billingCycle?.interval === "month" && p.billingCycle?.frequency === 1 && !p.trialPeriod);
    if (!price) {
      if (!create) throw new Error(`${name} monthly USD price is missing. Run with --create.`);
      price = await paddle.prices.create({ productId: product.id, description: `${name} monthly USD`, billingCycle: { interval: "month", frequency: 1 }, unitPrice: { amount, currencyCode: "USD" }, taxMode: "external" });
    }
    // Verify returned IDs and the persisted price, not just the creation response.
    const saved = await paddle.prices.get(price.id);
    if (saved.productId !== product.id || saved.unitPrice.amount !== amount || saved.unitPrice.currencyCode !== "USD") throw new Error("Price verification failed");
    result[plan === "scholar" ? "PADDLE_PRICE_SCHOLAR" : "PADDLE_PRICE_DEANS_LIST"] = saved.id;
  }
  const ids = Object.values(result);
  const discounts = await all(paddle.discounts.list({ status: ["active"] }));
  let discount = discounts.find(d => d.description === "Syllo introductory price: first three months" && d.type === "flat" && d.amount === "200" && d.currencyCode === "USD" && d.recur && d.maximumRecurringIntervals === 3 && ids.every(id => d.restrictTo?.includes(id)) && !d.expiresAt && !d.enabledForCheckout);
  if (!discount) {
    if (!create) throw new Error("The $2 introductory discount is missing. Run with --create.");
    discount = await paddle.discounts.create({ description: "Syllo introductory price: first three months", type: "flat", amount: "200", currencyCode: "USD", recur: true, maximumRecurringIntervals: 3, restrictTo: ids, enabledForCheckout: false });
  }
  result.PADDLE_INTRO_DISCOUNT_ID = (await paddle.discounts.get(discount.id)).id;
  console.log("Sandbox catalog verified. Tax category: saas; prices exclude applicable tax.");
  for (const product of catalogProducts) console.log(`${product.name}: ${product.id}`);
  for (const [name, value] of Object.entries(result)) console.log(`${name}=${value}`);
}

setup().catch(error => { console.error(`Sandbox setup failed: ${error.code || error.message || "Request failed"}`); process.exitCode = 1; });
