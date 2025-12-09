import express from "express";
import cors from "cors";
import { supabase } from "./supabase";
import { Card, SelectorProfile, Address, NetworkProfile } from "../src/lib/types";

// Slash API configuration
const SLASH_API_BASE_URL = process.env.SLASH_API_BASE_URL || "https://api.joinslash.com";
const SLASH_API_KEY = process.env.SLASH_API_KEY || "";
const SLASH_ACCOUNT_ID = process.env.SLASH_ACCOUNT_ID || "";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// --- Auth Routes ---

// GET /api/auth/user - Get current user info
app.get("/api/auth/user/:userId", async (req, res) => {
  const { userId } = req.params;
  
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) return res.status(404).json({ error: "User not found" });
  res.json(data);
});

// --- Routes ---

// GET /api/cards - Get cards based on user role and group
app.get("/api/cards", async (req, res) => {
  const { activeOnly, userId: _userId, role, groupId } = req.query;
  const now = new Date().toISOString();

  let query = supabase
    .from("cards")
    .select("*")
    .order("last_used", { ascending: true, nullsFirst: true })
    .order("usage_count", { ascending: true });

  // Role-based filtering
  if (role === "user" && groupId) {
    // Regular users can only see cards from their group
    query = query.eq("slash_group_id", groupId);
  }
  // Admins see all cards (no filter needed)

  if (activeOnly === "true") {
    query = query
      .eq("active", true)
      .or(`excluded_until.is.null,excluded_until.lt.${now}`);
  }

  const { data, error } = await query;

  if (error) return res.status(500).json({ error: error.message });

  const sanitized = ((data as Card[]) || []).map(({ pan: _pan, cvv: _cvv, ...rest }) => rest);
  res.json(sanitized);
});

// POST /api/cards/create
app.post("/api/cards/create", async (req, res) => {
  try {
    const { userId, groupId } = req.body || {};

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    if (!SLASH_API_KEY || !SLASH_ACCOUNT_ID) {
      console.error("[/api/cards/create] Missing Slash configuration: SLASH_API_KEY or SLASH_ACCOUNT_ID");
      return res.status(500).json({ error: "Slash API is not configured on the server" });
    }

    const slashRequestBody: any = {
      type: "virtual",
      name: `Vault card ${groupId ? `(${groupId})` : ""}`.trim(),
      accountId: SLASH_ACCOUNT_ID,
      userData: {
        slashGroupId: groupId || null,
        createdByUserId: userId,
      },
    };

    const slashResponse = await fetch(`${SLASH_API_BASE_URL}/card?include_pan=true`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": SLASH_API_KEY,
      },
      body: JSON.stringify(slashRequestBody),
    });

    if (!slashResponse.ok) {
      const errorText = await slashResponse.text().catch(() => "");
      console.error(
        "[/api/cards/create] Slash API error:",
        slashResponse.status,
        slashResponse.statusText,
        errorText
      );
      return res.status(502).json({
        error: "Failed to create card with Slash",
        status: slashResponse.status,
      });
    }

    const slashCard = await slashResponse.json();

    const expMonth = parseInt(slashCard.expiryMonth, 10);
    const expYear = parseInt(slashCard.expiryYear, 10);

    const newCard = {
      slash_card_id: slashCard.id,
      pan: slashCard.pan || null,
      cvv: slashCard.cvv || null,
      last4: slashCard.last4,
      exp_month: Number.isNaN(expMonth) ? null : expMonth,
      exp_year: Number.isNaN(expYear) ? null : expYear,
      created_by: userId,
      slash_group_id: groupId || null,
      labels: [],
      last_used: null,
      usage_count: 0,
      excluded_until: null,
      active: slashCard.status === "active",
      created_at: slashCard.createdAt || undefined,
    };

    const { data, error } = await supabase
      .from("cards")
      .insert(newCard)
      .select()
      .single();

    if (error) {
      console.error("[/api/cards/create] Supabase insert error:", error);
      return res.status(500).json({ error: error.message });
    }
    if (!data) return res.status(500).json({ error: "No card returned after creation" });

    const { pan: _pan, cvv: _cvv, ...safeCard } = data as Card & { cvv?: string };
    res.json(safeCard);
  } catch (e: any) {
    console.error("[/api/cards/create] Unexpected error:", e);
    res.status(500).json({ error: e?.message || "Unexpected error" });
  }
});

// GET /api/cards/:id/full - returns sensitive fields (pan, cvv) for autofill
app.get("/api/cards/:id/full", async (req, res) => {
  const { id } = req.params;
  const { role, groupId } = req.query;

  if (role === "user" && !groupId) {
    return res.status(400).json({ error: "groupId is required for user role" });
  }

  let query = supabase.from("cards").select("*").eq("id", id);

  if (role === "user" && groupId) {
    query = query.eq("slash_group_id", groupId as string);
  }

  const { data, error } = await query.single();

  if (error || !data) {
    return res.status(404).json({ error: "Card not found" });
  }

  res.json(data as Card);
});

// POST /api/autofill/mark_used - unified usage tracking for cards and addresses
app.post("/api/autofill/mark_used", async (req, res) => {
  const { cardId, addressId, context } = req.body || {};

  try {
    // Fetch global settings (cooldown interval in minutes)
    const { data: settings } = await supabase
      .from("settings")
      .select("cooldown_interval")
      .maybeSingle();

    const cooldownInterval = settings?.cooldown_interval ?? 30;
    const now = new Date();
    const cooldownDate = new Date(now.getTime() + cooldownInterval * 60000).toISOString();
    const nowIso = now.toISOString();

    let updatedCard: Card | null = null;
    let updatedAddress: Address | null = null;

    if (cardId) {
      const { data: card } = await supabase
        .from("cards")
        .select("usage_count")
        .eq("id", cardId)
        .maybeSingle();
      const currentCount = card?.usage_count || 0;

      const { data, error } = await supabase
        .from("cards")
        .update({
          last_used: nowIso,
          usage_count: currentCount + 1,
          excluded_until: cooldownDate,
        })
        .eq("id", cardId)
        .select()
        .maybeSingle();

      if (error) return res.status(500).json({ error: error.message });
      updatedCard = data as Card | null;
    }

    if (addressId) {
      const { data: addressRow } = await supabase
        .from("addresses")
        .select("usage_count")
        .eq("id", addressId)
        .maybeSingle();
      const currentAddressCount = addressRow?.usage_count || 0;

      const { data, error } = await supabase
        .from("addresses")
        .update({
          last_used: nowIso,
          usage_count: currentAddressCount + 1,
          excluded_until: cooldownDate,
        })
        .eq("id", addressId)
        .select()
        .maybeSingle();

      if (error) return res.status(500).json({ error: error.message });
      updatedAddress = data as Address | null;
    }

    // Record audit log with both card and address references when provided
    const { error: auditError } = await supabase.from("audit_logs").insert({
      card_id: cardId || null,
      address_id: addressId || null,
      action: "autofill",
      details: {
        card_filled: !!cardId,
        address_filled: !!addressId,
        context: context || null,
        cooldown_interval_minutes: cooldownInterval,
        triggered_at: nowIso,
      },
    });

    if (auditError) {
      console.error("Error creating audit log:", auditError);
    }

    res.json({ card: updatedCard, address: updatedAddress });
  } catch (e: any) {
    console.error("[/api/autofill/mark_used] Unexpected error:", e);
    res.status(500).json({ error: e?.message || "Unexpected error" });
  }
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
  const { domain } = req.query;

  let query = supabase.from("selector_profiles").select("*");

  if (domain) {
    const { data, error } = await query
      .eq("domain", domain)
      .order("created_at", { ascending: false })
      .limit(1)
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
      address1Selectors: data.address1selectors || [],
      address2Selectors: data.address2selectors || [],
      citySelectors: data.cityselectors || [],
      stateSelectors: data.stateselectors || [],
      zipSelectors: data.zipselectors || [],
      phoneSelectors: data.phoneselectors || [],
      nameSelectors: data.nameselectors || [],
    };
    return res.json(profile);
  }

  // List all profiles when no domain is provided
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const profiles: SelectorProfile[] = (data || []).map((p: any) => ({
    id: p.id,
    domain: p.domain,
    user_id: p.user_id,
    cardNumberSelectors: p.cardnumberselectors || [],
    cardExpirySelectors: p.cardexpiryselectors || [],
    cvvSelectors: p.cvvselectors || [],
    address1Selectors: p.address1selectors || [],
    address2Selectors: p.address2selectors || [],
    citySelectors: p.cityselectors || [],
    stateSelectors: p.stateselectors || [],
    zipSelectors: p.zipselectors || [],
    phoneSelectors: p.phoneselectors || [],
    nameSelectors: p.nameselectors || [],
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
        address1selectors: [],
        address2selectors: [],
        cityselectors: [],
        stateselectors: [],
        zipselectors: [],
        phoneselectors: [],
        nameselectors: [],
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
    const currentAddress1 = profile.address1selectors || [];
    const currentAddress2 = profile.address2selectors || [];
    const currentCity = profile.cityselectors || [];
    const currentState = profile.stateselectors || [];
    const currentZip = profile.zipselectors || [];
    const currentPhone = profile.phoneselectors || [];
    const currentName = profile.nameselectors || [];

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
    } else if (fieldType === "address1") {
      updates.address1selectors = [...new Set([...currentAddress1, selector])];
    } else if (fieldType === "address2") {
      updates.address2selectors = [...new Set([...currentAddress2, selector])];
    } else if (fieldType === "city") {
      updates.cityselectors = [...new Set([...currentCity, selector])];
    } else if (fieldType === "state") {
      updates.stateselectors = [...new Set([...currentState, selector])];
    } else if (fieldType === "zip") {
      updates.zipselectors = [...new Set([...currentZip, selector])];
    } else if (fieldType === "phone") {
      updates.phoneselectors = [...new Set([...currentPhone, selector])];
    } else if (fieldType === "name") {
      updates.nameselectors = [...new Set([...currentName, selector])];
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
      address1Selectors: updated.address1selectors || [],
      address2Selectors: updated.address2selectors || [],
      citySelectors: updated.cityselectors || [],
      stateSelectors: updated.stateselectors || [],
      zipSelectors: updated.zipselectors || [],
      phoneSelectors: updated.phoneselectors || [],
      nameSelectors: updated.nameselectors || [],
    };

    console.log("[API] Profile updated successfully.");
    res.json(responseProfile);
  } catch (e: any) {
    console.error("[API] Unexpected error:", e);
    res.status(500).json({ error: e.message });
  }
});

// --- Network Profiles API (name detection) ---

const formatNetworkProfile = (row: any): NetworkProfile => ({
  id: row.id,
  domain: row.domain,
  user_id: row.user_id,
  rules: row.rules || [],
  created_at: row.created_at,
});

app.get("/api/networkProfiles", async (req, res) => {
  const { domain } = req.query;
  let query = supabase.from("network_profiles").select("*");

  if (domain) {
    const { data, error } = await query
      .eq("domain", domain)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      return res.status(500).json({ error: error.message });
    }

    if (!data) return res.json(null);
    return res.json(formatNetworkProfile(data));
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const profiles = (data || []).map(formatNetworkProfile);
  res.json(profiles);
});

app.post("/api/networkProfiles", async (req, res) => {
  const { domain, userId, rules } = req.body || {};

  if (!domain || !Array.isArray(rules)) {
    return res.status(400).json({ error: "domain and rules are required" });
  }

  try {
    const { data: existing, error: findError } = await supabase
      .from("network_profiles")
      .select("*")
      .eq("domain", domain)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (findError && findError.code !== "PGRST116") {
      return res.status(500).json({ error: findError.message });
    }

    if (!existing) {
      const { data, error } = await supabase
        .from("network_profiles")
        .insert({
          domain,
          user_id: userId,
          rules,
        })
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      return res.json(formatNetworkProfile(data));
    }

    const { data: updated, error: updateError } = await supabase
      .from("network_profiles")
      .update({ rules, user_id: userId || existing.user_id })
      .eq("id", existing.id)
      .select()
      .single();

    if (updateError) return res.status(500).json({ error: updateError.message });
    return res.json(formatNetworkProfile(updated));
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Unexpected error" });
  }
});

app.delete("/api/networkProfiles/:id", async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from("network_profiles").delete().eq("id", id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// --- Addresses API ---

// GET /api/addresses - list all addresses (shared)
app.get("/api/addresses", async (req, res) => {
  const { activeOnly } = req.query;
  const now = new Date().toISOString();

  let query = supabase
    .from("addresses")
    .select("*")
    .order("last_used", { ascending: true, nullsFirst: true })
    .order("usage_count", { ascending: true });

  if (activeOnly === "true") {
    query = query.or(`excluded_until.is.null,excluded_until.lt.${now}`);
  }

  const { data, error } = await query;

  if (error) return res.status(500).json({ error: error.message });
  res.json(data as Address[]);
});

// GET /api/addresses/:id - fetch a single address by ID
app.get("/api/addresses/:id", async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from("addresses")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return res.status(404).json({ error: "Address not found" });
  }

  res.json(data as Address);
});

// POST /api/addresses/import - bulk insert addresses
app.post("/api/addresses/import", async (req, res) => {
  const { addresses, userId } = req.body || {};

  if (!Array.isArray(addresses) || addresses.length === 0) {
    return res.status(400).json({ error: "addresses array is required" });
  }

  // Basic validation
  const sanitized = addresses
    .map((a: any) => ({
      address1: (a.address1 || "").trim(),
      address2: (a.address2 || "").trim() || null,
      city: (a.city || "").trim(),
      state: (a.state || "").trim(),
      zip: (a.zip || "").trim() || null,
      phone: (a.phone || "").trim() || null,
      name: (a.name || "").trim(),
      created_by: userId || null,
    }))
    .filter(
      (a: any) =>
        a.address1 &&
        a.city &&
        a.state &&
        a.name
    );

  if (sanitized.length === 0) {
    return res.status(400).json({ error: "no valid addresses to import" });
  }

  // Respond immediately; process in background
  res.status(202).json({
    accepted: sanitized.length,
    message: "Accepted for background import",
  });

  const chunkSize = 500;
  (async () => {
    for (let i = 0; i < sanitized.length; i += chunkSize) {
      const chunk = sanitized.slice(i, i + chunkSize);
      const { error } = await supabase.from("addresses").insert(chunk);
      if (error) {
        console.error("[addresses/import] chunk insert error:", error);
        // Continue with remaining chunks to avoid partial blocking
      }
    }
  })().catch((err) => {
    console.error("[addresses/import] unexpected error:", err);
  });
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  console.log("Supabase URL:", process.env.SUPABASE_URL ? "Set" : "Not Set");

  // Keep process alive (required for some environments where event loop might drain)
  setInterval(() => {}, 1 << 30);
});
