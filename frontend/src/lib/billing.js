import { http } from "./api";

export async function createCheckout(planId) {
  const { data } = await http.post("/billing/checkout", { plan_id: planId });
  return data;
}

export async function createBillingPortal() {
  const { data } = await http.post("/billing/portal", {});
  return data;
}
