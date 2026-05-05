/* Marginalia · Create Lemon Squeezy checkout session
   Auth-gated Cloud Function. Creates a checkout URL with custom_data: { uid }
   so the billing webhook can map purchases back to a Firebase user.

   POST /createCheckout
   Headers: Authorization: Bearer <Firebase ID token>
   Body:    { plan: 'pro_monthly' | 'pro_yearly' | 'lifetime' }
   Response: { url: string }
*/

import * as functions from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

// admin is initialized in ai-generate.ts — shared instance.

// Lemon Squeezy variant IDs per plan — set via Firebase secret manager, never hardcoded.
// LEMON_SQUEEZY_API_KEY              → LS API key
// LEMON_SQUEEZY_VARIANT_PRO_MONTHLY  → LS variant ID for Pro monthly
// LEMON_SQUEEZY_VARIANT_PRO_YEARLY   → LS variant ID for Pro yearly
// LEMON_SQUEEZY_VARIANT_LIFETIME     → LS variant ID for Lifetime
// LEMON_SQUEEZY_STORE_ID             → LS store ID

type Plan = "pro_monthly" | "pro_yearly" | "lifetime";

interface LSCheckoutPayload {
  data: {
    type: "checkouts";
    attributes: {
      checkout_data: {
        custom: { uid: string };
      };
      product_options?: {
        redirect_url?: string;
      };
    };
    relationships: {
      store: { data: { type: "stores"; id: string } };
      variant: { data: { type: "variants"; id: string } };
    };
  };
}

interface LSCheckoutResponse {
  data: {
    attributes: {
      url: string;
    };
  };
  errors?: Array<{ detail: string }>;
}

async function createLSCheckout(
  uid: string,
  variantId: string,
  storeId: string,
  apiKey: string,
  redirectUrl: string,
): Promise<string> {
  const payload: LSCheckoutPayload = {
    data: {
      type: "checkouts",
      attributes: {
        checkout_data: {
          custom: { uid },
        },
        product_options: {
          redirect_url: redirectUrl,
        },
      },
      relationships: {
        store: { data: { type: "stores", id: storeId } },
        variant: { data: { type: "variants", id: variantId } },
      },
    },
  };

  const res = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
    method: "POST",
    headers: {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Lemon Squeezy API error ${res.status}: ${text.slice(0, 200)}`,
    );
  }

  const json = (await res.json()) as LSCheckoutResponse;
  if (json.errors?.length) {
    throw new Error(`Lemon Squeezy error: ${json.errors[0].detail}`);
  }

  return json.data.attributes.url;
}

export const createCheckout = functions.onRequest(
  {
    secrets: [
      "LEMON_SQUEEZY_API_KEY",
      "LEMON_SQUEEZY_VARIANT_PRO_MONTHLY",
      "LEMON_SQUEEZY_VARIANT_PRO_YEARLY",
      "LEMON_SQUEEZY_VARIANT_LIFETIME",
      "LEMON_SQUEEZY_STORE_ID",
    ],
    cors: true,
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    // Verify Firebase auth.
    const authHeader = req.headers.authorization || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!idToken) {
      res.status(401).json({ error: "Missing authorization token" });
      return;
    }

    let uid: string;
    try {
      const decoded = await admin.auth().verifyIdToken(idToken);
      uid = decoded.uid;
    } catch {
      res.status(401).json({ error: "Invalid authorization token" });
      return;
    }

    const { plan } = req.body as { plan?: string };
    const validPlans: Plan[] = ["pro_monthly", "pro_yearly", "lifetime"];
    if (!plan || !validPlans.includes(plan as Plan)) {
      res.status(400).json({
        error: 'Invalid plan. Must be "pro_monthly", "pro_yearly", or "lifetime".',
      });
      return;
    }

    const apiKey = process.env.LEMON_SQUEEZY_API_KEY;
    const storeId = process.env.LEMON_SQUEEZY_STORE_ID;
    const variantMonthly = process.env.LEMON_SQUEEZY_VARIANT_PRO_MONTHLY;
    const variantYearly = process.env.LEMON_SQUEEZY_VARIANT_PRO_YEARLY;
    const variantLifetime = process.env.LEMON_SQUEEZY_VARIANT_LIFETIME;

    if (!apiKey || !storeId || !variantMonthly || !variantYearly || !variantLifetime) {
      res.status(500).json({ error: "Payments not configured" });
      return;
    }

    const variantMap: Record<Plan, string> = {
      pro_monthly: variantMonthly,
      pro_yearly: variantYearly,
      lifetime: variantLifetime,
    };
    const variantId = variantMap[plan as Plan];

    // Redirect back to the app after checkout.
    const origin = req.headers.origin || "https://marginalia.app";
    const redirectUrl = `${origin}/?checkout=success`;

    try {
      const url = await createLSCheckout(uid, variantId, storeId, apiKey, redirectUrl);
      res.status(200).json({ url });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[create-checkout] Error:", message);
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  },
);
