import express from "express";
import cors from "cors";
import { supabase } from "./supabase";
import { MOCK_CARDS } from "../src/lib/mocks";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// --- Routes ---

// GET /api/cards (Admin/All cards)
app.get("/api/cards", async (_req, res) => {
  const { activeOnly } = _req.query;
  const now = new Date().toISOString();

  let query = supabase
    .from("cards")
    .select("*")
    .order("last_used", { ascending: true, nullsFirst: true })
    .order("usage_count", { ascending: true });

  if (activeOnly === "true") {
    query = query
      .eq("active", true)
      .or(`excluded_until.is.null,excluded_until.lt.${now}`);
  }

  const { data, error } = await query;

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// GET /api/users/:id/cards
app.get("/api/users/:id/cards", async (req, res) => {
  const userId = req.params.id;
  const { activeOnly } = req.query;
  const now = new Date().toISOString();

  let query = supabase
    .from("cards")
    .select("*")
    .eq("created_by", userId)
    .order("last_used", { ascending: true, nullsFirst: true })
    .order("usage_count", { ascending: true });

  if (activeOnly === "true") {
    query = query
      .eq("active", true)
      .or(`excluded_until.is.null,excluded_until.lt.${now}`);
  }

  const { data, error } = await query;

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// POST /api/cards/create
app.post("/api/cards/create", async (req, res) => {
  const { userId } = req.body;

  const pan = Array(16)
    .fill(0)
    .map(() => Math.floor(Math.random() * 10))
    .join("");
  const last4 = pan.slice(-4);

  const newCard = {
    slash_card_id: `slash-${Date.now()}`,
    pan,
    last4,
    brand: ["Visa", "MasterCard", "Amex"][Math.floor(Math.random() * 3)],
    exp_month: Math.floor(Math.random() * 12) + 1,
    exp_year: new Date().getFullYear() + Math.floor(Math.random() * 5),
    created_by: userId,
    labels: ["New"],
    last_used: null,
    usage_count: 0,
    excluded_until: null,
    active: true,
  };

  const { data, error } = await supabase
    .from("cards")
    .insert(newCard)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/cards/:id/mark_used
app.post("/api/cards/:id/mark_used", async (req, res) => {
  const cardId = req.params.id;

  // Fetch global settings
  const { data: settings, error: settingsError } = await supabase
    .from("settings")
    .select("cooldown_interval")
    .maybeSingle();

  if (settingsError) {
    console.error("Error fetching settings:", settingsError);
    // Fallback to 30 if DB error, but log it
  }

  const cooldownInterval = settings?.cooldown_interval ?? 30;

  const now = new Date();
  const cooldownDate = new Date(now.getTime() + cooldownInterval * 60000);

  // Get current usage count
  const { data: card } = await supabase
    .from("cards")
    .select("usage_count")
    .eq("id", cardId)
    .single();
  const currentCount = card?.usage_count || 0;

  const { data, error } = await supabase
    .from("cards")
    .update({
      last_used: now.toISOString(),
      usage_count: currentCount + 1,
      excluded_until: cooldownDate.toISOString(),
    })
    .eq("id", cardId)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // Create Audit Log
  const { error: auditError } = await supabase.from("audit_logs").insert({
    card_id: cardId,
    action: "card_used",
    details: {
      new_usage_count: data.usage_count,
      triggered_at: now.toISOString(),
    },
  });

  if (auditError) {
    console.error("Error creating audit log:", auditError);
  }

  res.json(data);
});

// --- Settings API ---

app.get("/api/settings", async (_req, res) => {
  const { data, error } = await supabase.from("settings").select("*").single();
  if (error && error.code !== "PGRST116")
    return res.status(500).json({ error: error.message });

  // Default if not exists
  if (!data) return res.json({ cooldownInterval: 30 });

  res.json({ cooldownInterval: data.cooldown_interval });
});

app.post("/api/settings", async (req, res) => {
  const { cooldownInterval } = req.body;

  // Upsert settings (assuming single row for now, or use ID 1)
  const { data, error } = await supabase
    .from("settings")
    .upsert({ id: 1, cooldown_interval: cooldownInterval })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ cooldownInterval: data.cooldown_interval });
});

// --- Selector Profiles API ---

app.get("/api/selectorProfiles", async (req, res) => {
  const { domain, userId } = req.query;

  let query = supabase.from("selector_profiles").select("*");

  if (domain && userId) {
    const { data, error } = await query
      .eq("domain", domain)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });

    if (!data) return res.json(null);

    // Map DB (lowercase) to Frontend (camelCase)
    const profile = {
      id: data.id,
      domain: data.domain,
      user_id: data.user_id,
      cardNumberSelectors: data.cardnumberselectors || [],
      cardExpirySelectors: data.cardexpiryselectors || [],
      cvvSelectors: data.cvvselectors || [],
    };
    return res.json(profile);
  }

  // Admin: List all
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const profiles = (data || []).map((p: any) => ({
    id: p.id,
    domain: p.domain,
    user_id: p.user_id,
    cardNumberSelectors: p.cardnumberselectors || [],
    cardExpirySelectors: p.cardexpiryselectors || [],
    cvvSelectors: p.cvvselectors || [],
  }));
  res.json(profiles);
});

app.delete("/api/selectorProfiles/:id", async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase
    .from("selector_profiles")
    .delete()
    .eq("id", id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// POST /api/selectorProfiles
app.post("/api/selectorProfiles", async (req, res) => {
  const { domain, userId, fieldType, selector } = req.body;
  console.log(
    `[API] Saving selector for ${domain} (${fieldType}): ${selector}`
  );

  try {
    // 1. Check if profile exists
    let { data: profile, error: findError } = await supabase
      .from("selector_profiles")
      .select("*")
      .eq("domain", domain)
      .eq("user_id", userId)
      .maybeSingle();

    if (findError) {
      console.error("[API] Error finding profile:", findError);
      return res.status(500).json({ error: findError.message });
    }

    if (!profile) {
      console.log("[API] Profile not found, creating new one...");
      // Use lowercase keys for DB insert
      const newProfilePayload = {
        domain,
        user_id: userId,
        cardnumberselectors: [],
        cardexpiryselectors: [],
        cvvselectors: [],
      };

      const { data: newProfile, error: createError } = await supabase
        .from("selector_profiles")
        .insert(newProfilePayload)
        .select()
        .single();

      if (createError) {
        console.error("[API] Error creating profile:", createError);
        return res.status(500).json({ error: createError.message });
      }
      profile = newProfile;
    }

    // Update arrays
    const updates: any = {};
    // Use lowercase keys from DB profile
    const currentCardNumber = profile.cardnumberselectors || [];
    const currentCardExpiry = profile.cardexpiryselectors || [];
    const currentCvv = profile.cvvselectors || [];

    if (fieldType === "cardNumber") {
      updates.cardnumberselectors = [
        ...new Set([...currentCardNumber, selector]),
      ];
    } else if (fieldType === "cardExpiry") {
      updates.cardexpiryselectors = [
        ...new Set([...currentCardExpiry, selector]),
      ];
    } else if (fieldType === "cardCvv") {
      updates.cvvselectors = [...new Set([...currentCvv, selector])];
    }

    console.log("[API] Updating profile ID:", profile.id, "Updates:", updates);

    const { data: updated, error: updateError } = await supabase
      .from("selector_profiles")
      .update(updates)
      .eq("id", profile.id)
      .select()
      .single();

    if (updateError) {
      console.error("[API] Error updating profile:", updateError);
      return res.status(500).json({ error: updateError.message });
    }

    // Map back to camelCase for response
    const responseProfile = {
      id: updated.id,
      domain: updated.domain,
      user_id: updated.user_id,
      cardNumberSelectors: updated.cardnumberselectors || [],
      cardExpirySelectors: updated.cardexpiryselectors || [],
      cvvSelectors: updated.cvvselectors || [],
    };

    console.log("[API] Profile updated successfully.");
    res.json(responseProfile);
  } catch (e: any) {
    console.error("[API] Unexpected error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/debug/reset", async (_req, res) => {
  console.log("Resetting database (GET)...");
  // Copy-paste logic or extract function
  // 1. Delete all cards
  const { error: deleteError } = await supabase
    .from("cards")
    .delete()
    .neq("last4", "0000");
  if (deleteError) {
    console.error("Delete error:", deleteError);
    return res.status(500).json({ error: deleteError.message });
  }

  // 2. Seed initial cards
  const cardsToInsert = MOCK_CARDS.map((card) => ({
    slash_card_id: card.slash_card_id,
    pan: card.pan,
    last4: card.last4,
    brand: card.brand,
    exp_month: card.exp_month,
    exp_year: card.exp_year,
    created_by: card.created_by,
    labels: card.labels,
    last_used: card.last_used,
    usage_count: card.usage_count,
    excluded_until: card.excluded_until,
    active: card.active,
    created_at: card.created_at,
  }));

  const { data, error: insertError } = await supabase
    .from("cards")
    .insert(cardsToInsert)
    .select();
  if (insertError) {
    console.error("Insert error:", insertError);
    return res.status(500).json({ error: insertError.message });
  }

  console.log(`Reset complete. Seeded ${data.length} cards.`);
  res.json({ success: true, count: data.length });
});

app.post("/api/debug/reset", async (_req, res) => {
  console.log("Resetting database...");
  // 1. Delete all cards
  const { error: deleteError } = await supabase
    .from("cards")
    .delete()
    .neq("last4", "0000");
  if (deleteError) {
    console.error("Delete error:", deleteError);
    return res.status(500).json({ error: deleteError.message });
  }

  // 2. Seed initial cards
  const cardsToInsert = MOCK_CARDS.map((card) => ({
    slash_card_id: card.slash_card_id,
    pan: card.pan,
    last4: card.last4,
    brand: card.brand,
    exp_month: card.exp_month,
    exp_year: card.exp_year,
    created_by: card.created_by,
    labels: card.labels,
    last_used: card.last_used,
    usage_count: card.usage_count,
    excluded_until: card.excluded_until,
    active: card.active,
    created_at: card.created_at,
  }));

  const { data, error: insertError } = await supabase
    .from("cards")
    .insert(cardsToInsert)
    .select();
  if (insertError) {
    console.error("Insert error:", insertError);
    return res.status(500).json({ error: insertError.message });
  }

  console.log(`Reset complete. Seeded ${data.length} cards.`);
  res.json({ success: true, count: data.length });
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  console.log("Supabase URL:", process.env.SUPABASE_URL ? "Set" : "Not Set");

  // Keep process alive (required for some environments where event loop might drain)
  setInterval(() => {}, 1 << 30);
});
