import express from "express";
import cors from "cors";
import { supabase } from "./supabase";
import { Card, SelectorProfile, Address, NetworkProfile } from "../src/lib/types";

// Slash API configuration
const SLASH_API_BASE_URL = process.env.SLASH_API_BASE_URL || "https://api.joinslash.com";
const SLASH_API_VAULT_URL = process.env.SLASH_API_VAULT_URL || "https://vault.joinslash.com";
const SLASH_API_KEY = process.env.SLASH_API_KEY || "";
const SLASH_ACCOUNT_ID = process.env.SLASH_ACCOUNT_ID || "";
const SLASH_VIRTUAL_ACCOUNT_ID = process.env.SLASH_VIRTUAL_ACCOUNT_ID || "";

type SlashCard = {
  id: string;
  last4: string;
  expiryMonth?: string | number;
  expiryYear?: string | number;
  status?: string;
  cardGroupId?: string;
  createdAt?: string;
  pan?: string;
  cvv?: string;
  userData?: Record<string, any>;
};

const parseNumber = (value: any): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = parseInt(String(value ?? ""), 10);
  return Number.isNaN(n) ? null : n;
};

const mapSlashCardToAppCard = (slashCard: SlashCard): Card => {
  const userData = slashCard.userData || {};
  const expMonth = parseNumber(slashCard.expiryMonth);
  const expYear = parseNumber(slashCard.expiryYear);
  const usageCount = parseNumber(userData.usageCount) ?? 0;

  return {
    id: slashCard.id,
    last4: slashCard.last4,
    exp_month: expMonth,
    exp_year: expYear,
    created_by: userData.createdByUserId ?? null,
    slash_group_id: slashCard.cardGroupId ?? null,
    labels: Array.isArray(userData.labels) ? userData.labels : [],
    last_used: userData.lastUsed ?? null,
    usage_count: usageCount,
    excluded_until: userData.excludedUntil ?? null,
    active: (slashCard.status || "").toLowerCase() === "active",
    created_at: slashCard.createdAt || new Date().toISOString(),
  };
};

const attachCreatorEmails = async (cards: Card[]): Promise<Card[]> => {
  const ownerIds = Array.from(
    new Set(cards.map((card) => card.created_by).filter(Boolean))
  ) as string[];

  if (ownerIds.length === 0) return cards;

  const { data, error } = await supabase
    .from("users")
    .select("id, email")
    .in("id", ownerIds);

  if (error || !data) {
    console.warn(
      "[attachCreatorEmails] Failed to load creator emails:",
      error?.message || error
    );
    return cards;
  }

  const emailMap = new Map<string, string>(
    data.map((row: any) => [row.id, row.email])
  );

  return cards.map((card) => ({
    ...card,
    created_by_email: card.created_by
      ? emailMap.get(card.created_by) || null
      : null,
  }));
};

const sortCardsByUsage = (cards: Card[]) => {
  return [...cards].sort((a, b) => {
    // last_used: nulls first, oldest first
    if (!a.last_used && b.last_used) return -1;
    if (a.last_used && !b.last_used) return 1;
    if (a.last_used && b.last_used) {
      const diff = new Date(a.last_used).getTime() - new Date(b.last_used).getTime();
      if (diff !== 0) return diff;
    }
    // then usage_count ascending
    return (a.usage_count || 0) - (b.usage_count || 0);
  });
};

type SelectorFieldKey =
  | "cardNumberSelectors"
  | "cardExpirySelectors"
  | "cvvSelectors"
  | "address1Selectors"
  | "address2Selectors"
  | "citySelectors"
  | "stateSelectors"
  | "zipSelectors"
  | "phoneSelectors"
  | "nameSelectors";

const SELECTOR_DB_FIELDS: Record<SelectorFieldKey, string> = {
  cardNumberSelectors: "cardnumberselectors",
  cardExpirySelectors: "cardexpiryselectors",
  cvvSelectors: "cvvselectors",
  address1Selectors: "address1selectors",
  address2Selectors: "address2selectors",
  citySelectors: "cityselectors",
  stateSelectors: "stateselectors",
  zipSelectors: "zipselectors",
  phoneSelectors: "phoneselectors",
  nameSelectors: "nameselectors",
};

const mapDbRowToSelectorProfile = (row: any): SelectorProfile => ({
  id: row.id,
  domain: row.domain,
  user_id: row.user_id,
  cardNumberSelectors: row.cardnumberselectors || [],
  cardExpirySelectors: row.cardexpiryselectors || [],
  cvvSelectors: row.cvvselectors || [],
  address1Selectors: row.address1selectors || [],
  address2Selectors: row.address2selectors || [],
  citySelectors: row.cityselectors || [],
  stateSelectors: row.stateselectors || [],
  zipSelectors: row.zipselectors || [],
  phoneSelectors: row.phoneselectors || [],
  nameSelectors: row.nameselectors || [],
});

const normalizeSelectorList = (value: any): string[] => {
  const asArray = Array.isArray(value) ? value : [value].filter((v) => v !== undefined);
  const cleaned = asArray
    .map((v) => (v == null ? "" : String(v).trim()))
    .filter((v) => v.length > 0);
  return Array.from(new Set(cleaned));
};

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

// POST /api/slash/card-groups - Create a Slash card group for new users
app.post("/api/slash/card-groups", async (req, res) => {
  try {
    const { name, virtualAccountId } = req.body || {};

    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    if (!SLASH_API_KEY) {
      console.error("[/api/slash/card-groups] Missing Slash configuration: SLASH_API_KEY");
      return res.status(500).json({ error: "Slash API is not configured on the server" });
    }

    const requestBody: Record<string, any> = { name };
    const resolvedVirtualAccountId = virtualAccountId || SLASH_VIRTUAL_ACCOUNT_ID;
    if (resolvedVirtualAccountId) {
      requestBody.virtualAccountId = resolvedVirtualAccountId;
    }

    const slashResponse = await fetch(`${SLASH_API_BASE_URL}/card-group`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": SLASH_API_KEY,
      },
      body: JSON.stringify(requestBody),
    });

    if (!slashResponse.ok) {
      const errorText = await slashResponse.text().catch(() => "");
      console.error(
        "[/api/slash/card-groups] Slash API error:",
        slashResponse.status,
        slashResponse.statusText,
        errorText
      );
      return res.status(502).json({
        error: "Failed to create Slash card group",
        status: slashResponse.status,
      });
    }

    const slashGroup = await slashResponse.json();
    res.json({
      id: slashGroup.id,
      name: slashGroup.name,
      virtualAccountId: slashGroup.virtualAccountId || resolvedVirtualAccountId || null,
    });
  } catch (e: any) {
    console.error("[/api/slash/card-groups] Unexpected error:", e);
    res.status(500).json({ error: e?.message || "Unexpected error" });
  }
});

// --- Routes ---

// GET /api/cards - Get cards based on user role and group
app.get("/api/cards", async (req, res) => {
  try {
    const { activeOnly, role, groupId } = req.query;

    if (!SLASH_API_KEY) {
      console.error("[/api/cards] Missing Slash configuration: SLASH_API_KEY");
      return res.status(500).json({ error: "Slash API is not configured on the server" });
    }

    if (role === "user" && !groupId) {
      return res.status(400).json({ error: "groupId is required for user role" });
    }

    const params = new URLSearchParams();
    if (groupId) params.append("filter:cardGroupId", String(groupId));

    const slashResponse = await fetch(`${SLASH_API_BASE_URL}/card?${params.toString()}`, {
      headers: {
        "X-API-Key": SLASH_API_KEY,
      },
    });

    if (!slashResponse.ok) {
      const errorText = await slashResponse.text().catch(() => "");
      console.error("[/api/cards] Slash API error:", slashResponse.status, slashResponse.statusText, errorText);
      return res.status(502).json({ error: "Failed to fetch cards from Slash", status: slashResponse.status });
    }

    const body = await slashResponse.json();
    const items = Array.isArray(body?.items) ? body.items : [];
    const now = new Date();

    let cards: Card[] = items.map(mapSlashCardToAppCard);

    if (role === "user" && groupId) {
      cards = cards.filter((c) => c.slash_group_id === groupId);
    }

    if (activeOnly === "true") {
      cards = cards.filter((c) => {
        const isActive = c.active;
        const cooldownOk = !c.excluded_until || new Date(c.excluded_until) < now;
        return isActive && cooldownOk;
      });
    }

    cards = sortCardsByUsage(cards);
    const withOwners = await attachCreatorEmails(cards);
    res.json(withOwners);
  } catch (e: any) {
    console.error("[/api/cards] Unexpected error:", e);
    res.status(500).json({ error: e?.message || "Unexpected error" });
  }
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
      cardGroupId: groupId || undefined,
      userData: {
        createdByUserId: userId,
        labels: [],
        lastUsed: null,
        usageCount: 0,
        excludedUntil: null,
      },
    };

    const slashResponse = await fetch(`${SLASH_API_BASE_URL}/card`, {
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

    const appCard = mapSlashCardToAppCard(slashCard as SlashCard);
    // Do not return pan/cvv to the client in this endpoint
    const { pan: _pan, cvv: _cvv, ...safeCard } = appCard as Card & { pan?: string; cvv?: string };
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

  if (!SLASH_API_KEY) {
    return res.status(500).json({ error: "Slash API is not configured on the server" });
  }

  if (role === "user" && !groupId) {
    return res.status(400).json({ error: "groupId is required for user role" });
  }

  try {
    const slashResponse = await fetch(
      `${SLASH_API_VAULT_URL}/card/${encodeURIComponent(id)}?include_pan=true&include_cvv=true`,
      {
        headers: { "X-API-Key": SLASH_API_KEY },
      }
    );

    if (!slashResponse.ok) {
      const errorText = await slashResponse.text().catch(() => "");
      console.error(
        "[/api/cards/:id/full] Slash API error:",
        slashResponse.status,
        slashResponse.statusText,
        errorText
      );
      return res
        .status(slashResponse.status === 404 ? 404 : 502)
        .json({ error: "Failed to fetch card from Slash" });
    }

    const slashCard = await slashResponse.json();
    const appCard = mapSlashCardToAppCard(slashCard as SlashCard);

    if (role === "user" && groupId && appCard.slash_group_id !== groupId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const [appCardWithOwner] = await attachCreatorEmails([appCard]);

    res.json({
      ...(appCardWithOwner || appCard),
      pan: slashCard.pan || null,
      cvv: slashCard.cvv || null,
    });
  } catch (e: any) {
    console.error("[/api/cards/:id/full] Unexpected error:", e);
    res.status(500).json({ error: e?.message || "Unexpected error" });
  }
});

// POST /api/autofill/mark_used - unified usage tracking for cards and addresses
app.post("/api/autofill/mark_used", async (req, res) => {
  const { cardId, addressId, context, userId } = req.body || {};

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
      if (!SLASH_API_KEY) {
        return res.status(500).json({ error: "Slash API is not configured on the server" });
      }

      const slashGet = await fetch(`${SLASH_API_BASE_URL}/card/${encodeURIComponent(cardId)}`, {
        headers: { "X-API-Key": SLASH_API_KEY },
      });

      if (!slashGet.ok) {
        const errorText = await slashGet.text().catch(() => "");
        console.error("[/api/autofill/mark_used] Slash get card error:", slashGet.status, errorText);
        return res.status(slashGet.status === 404 ? 404 : 502).json({ error: "Failed to fetch card from Slash" });
      }

      const slashCard = await slashGet.json();
      const userData = slashCard?.userData || {};
      const currentCount = parseNumber(userData.usageCount) ?? 0;

      const updatedUserData = {
        ...userData,
        lastUsed: nowIso,
        usageCount: currentCount + 1,
        excludedUntil: cooldownDate,
      };

      const patchResp = await fetch(`${SLASH_API_BASE_URL}/card/${encodeURIComponent(cardId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": SLASH_API_KEY,
        },
        body: JSON.stringify({ userData: updatedUserData }),
      });

      if (!patchResp.ok) {
        const errorText = await patchResp.text().catch(() => "");
        console.error("[/api/autofill/mark_used] Slash patch card error:", patchResp.status, errorText);
        return res.status(502).json({ error: "Failed to update card usage on Slash" });
      }

      const patched = await patchResp.json();
      const mergedCard: SlashCard = { ...(patched as SlashCard), userData: updatedUserData };
      updatedCard = mapSlashCardToAppCard(mergedCard);
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
      user_id: userId || null,
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

    return res.json(mapDbRowToSelectorProfile(data));
  }

  // List all profiles when no domain is provided
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const profiles: SelectorProfile[] = (data || []).map(mapDbRowToSelectorProfile);
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

app.patch("/api/selectorProfiles/:id", async (req, res) => {
  const { id } = req.params;
  const { selectors } = req.body || {};

  if (!selectors || typeof selectors !== "object") {
    return res.status(400).json({ error: "selectors object is required" });
  }

  try {
    const updates: Record<string, any> = {};

    (Object.keys(SELECTOR_DB_FIELDS) as SelectorFieldKey[]).forEach((key) => {
      if (selectors[key] !== undefined) {
        updates[SELECTOR_DB_FIELDS[key]] = normalizeSelectorList(selectors[key]);
      }
    });

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No selectors to update" });
    }

    const { data, error } = await supabase
      .from("selector_profiles")
      .update(updates)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "Profile not found" });

    res.json(mapDbRowToSelectorProfile(data));
  } catch (e: any) {
    console.error("[API] Error updating selectors:", e);
    res.status(500).json({ error: e?.message || "Unexpected error" });
  }
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
    .map((a: any) => {
      const cleanId = typeof a.id === "string" ? a.id.trim() : "";
      const record: Record<string, any> = {
        address1: (a.address1 || "").trim(),
        address2: (a.address2 || "").trim() || null,
        city: (a.city || "").trim(),
        state: (a.state || "").trim(),
        zip: (a.zip || "").trim() || null,
        phone: (a.phone || "").trim() || null,
        name: (a.name || "").trim(),
        created_by: userId || null,
      };

      if (cleanId) {
        record.id = cleanId;
      }

      return record;
    })
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
      const { error } = await supabase
        .from("addresses")
        .upsert(chunk, { onConflict: "id" });
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
