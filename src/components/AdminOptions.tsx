import { useState, useEffect, useRef } from "react";
import { User, SelectorProfile, NetworkProfile } from "../lib/types";
import { Trash2, Clock, Globe, Plus } from "lucide-react";

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

const SELECTOR_FIELDS: { key: SelectorFieldKey; label: string }[] = [
  { key: "cardNumberSelectors", label: "Card Number" },
  { key: "cardExpirySelectors", label: "Expiry" },
  { key: "cvvSelectors", label: "CVV" },
  { key: "nameSelectors", label: "Full Name" },
  { key: "address1Selectors", label: "Address 1" },
  { key: "address2Selectors", label: "Address 2" },
  { key: "citySelectors", label: "City" },
  { key: "stateSelectors", label: "State / Province" },
  { key: "zipSelectors", label: "ZIP / Postal" },
  { key: "phoneSelectors", label: "Phone" },
];

const selectorsToText = (selectors?: string[]) =>
  Array.isArray(selectors) ? selectors.join("\n") : "";

const textToSelectors = (text: string) =>
  text
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean);

interface AdminOptionsProps {
  user: User;
}

export function AdminOptions({ user }: AdminOptionsProps) {
  const [profiles, setProfiles] = useState<SelectorProfile[]>([]);
  const [cooldown, setCooldown] = useState(30);
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const saveTimeoutRef = useRef<number | null>(null);
  const [importText, setImportText] = useState("");
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importCount, setImportCount] = useState<number | null>(null);
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [networkProfiles, setNetworkProfiles] = useState<NetworkProfile[]>([]);
  const [networkStatus, setNetworkStatus] = useState<string | null>(null);
  const [networkForm, setNetworkForm] = useState({
    domain: "",
    urlPattern: "",
    method: "GET",
    namePath: "",
    firstNamePath: "",
    lastNamePath: "",
  });
  const [selectorEdits, setSelectorEdits] = useState<
    Record<string, Record<SelectorFieldKey, string>>
  >({});
  const [selectorSaving, setSelectorSaving] = useState<Record<string, boolean>>({});
  const [selectorSaveStatus, setSelectorSaveStatus] = useState<Record<string, string | null>>({});
  const [editingProfiles, setEditingProfiles] = useState<Record<string, boolean>>({});

  const buildEditState = (profile: SelectorProfile): Record<SelectorFieldKey, string> =>
    SELECTOR_FIELDS.reduce((acc, field) => {
      acc[field.key] = selectorsToText(profile[field.key] as string[]);
      return acc;
    }, {} as Record<SelectorFieldKey, string>);

  const getSelectorList = (profile: SelectorProfile, key: SelectorFieldKey) =>
    (profile[key] as string[]) || [];

  useEffect(() => {
    loadData();
    return () => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    setSelectorEdits((prev) => {
      const next = { ...prev };
      profiles.forEach((profile) => {
        if (!next[profile.id]) {
          next[profile.id] = buildEditState(profile);
        }
      });
      return next;
    });
  }, [profiles]);

  const loadData = () => {
    setLoading(true);
    // Fetch Profiles
    fetch("http://localhost:3000/api/selectorProfiles")
      .then((res) => res.json())
      .then((data) => {
          if (Array.isArray(data)) setProfiles(data);
      })
      .catch((err) => console.error(err));

    // Fetch Settings
    fetch("http://localhost:3000/api/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.cooldownInterval !== undefined) setCooldown(data.cooldownInterval);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));

    fetch("http://localhost:3000/api/networkProfiles")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setNetworkProfiles(data);
        else if (data) setNetworkProfiles([data]);
      })
      .catch((err) => console.error(err));
  };

  const handleDeleteProfile = async (id: string) => {
    if (!confirm("Are you sure you want to delete this selector profile?")) return;
    
    try {
      const res = await fetch(`http://localhost:3000/api/selectorProfiles/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setProfiles((prev) => prev.filter((p) => p.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const [visibleFields, setVisibleFields] = useState<Record<string, SelectorFieldKey[]>>({});

  useEffect(() => {
    setVisibleFields((prev) => {
      const next = { ...prev };
      profiles.forEach((profile) => {
        if (!next[profile.id]) {
          const mapped = SELECTOR_FIELDS.filter(
            (f) => getSelectorList(profile, f.key).length > 0
          ).map((f) => f.key);
          next[profile.id] = mapped;
        }
      });
      return next;
    });
  }, [profiles]);

  const handleAddField = (profileId: string, fieldKey: SelectorFieldKey) => {
    setVisibleFields((prev) => ({
      ...prev,
      [profileId]: [...(prev[profileId] || []), fieldKey],
    }));
  };

  const handleSelectorChange = (
    profileId: string,
    fieldKey: SelectorFieldKey,
    value: string
  ) => {
    const profile = profiles.find((p) => p.id === profileId);
    const base = profile ? buildEditState(profile) : ({} as Record<SelectorFieldKey, string>);
    setSelectorEdits((prev) => ({
      ...prev,
      [profileId]: { ...(prev[profileId] || base), [fieldKey]: value },
    }));
  };

  const handleSaveSelectors = async (profileId: string) => {
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile) return;

    const editState = selectorEdits[profileId] || buildEditState(profile);
    const selectorsPayload = SELECTOR_FIELDS.reduce(
      (acc, field) => ({
        ...acc,
        [field.key]: textToSelectors(editState[field.key] || ""),
      }),
      {} as Record<SelectorFieldKey, string[]>
    );

    setSelectorSaving((prev) => ({ ...prev, [profileId]: true }));
    setSelectorSaveStatus((prev) => ({ ...prev, [profileId]: null }));

    try {
      const res = await fetch(`http://localhost:3000/api/selectorProfiles/${profileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectors: selectorsPayload }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || data?.error) {
        const errorMessage = data?.error || "Save failed";
        setSelectorSaveStatus((prev) => ({ ...prev, [profileId]: errorMessage }));
        return;
      }

      setProfiles((prev) =>
        prev.map((p) => (p.id === profileId ? (data as SelectorProfile) : p))
      );
      setSelectorEdits((prev) => ({
        ...prev,
        [profileId]: buildEditState(data as SelectorProfile),
      }));
      setSelectorSaveStatus((prev) => ({ ...prev, [profileId]: "Saved" }));
      setEditingProfiles((prev) => ({ ...prev, [profileId]: false }));
    } catch (err: any) {
      setSelectorSaveStatus((prev) => ({
        ...prev,
        [profileId]: err?.message || "Save failed",
      }));
    } finally {
      setSelectorSaving((prev) => ({ ...prev, [profileId]: false }));
      setTimeout(() => {
        setSelectorSaveStatus((prev) => ({ ...prev, [profileId]: null }));
      }, 2000);
    }
  };

  const toggleEditProfile = (profileId: string) => {
    setEditingProfiles((prev) => ({ ...prev, [profileId]: !prev[profileId] }));
    // Reset edits when cancelling
    if (editingProfiles[profileId]) {
      const profile = profiles.find((p) => p.id === profileId);
      if (profile) {
        setSelectorEdits((prev) => ({
          ...prev,
          [profileId]: buildEditState(profile),
        }));
        // Reset visible fields to only those with values
        const mapped = SELECTOR_FIELDS.filter(
          (f) => getSelectorList(profile, f.key).length > 0
        ).map((f) => f.key);
        setVisibleFields((prev) => ({ ...prev, [profileId]: mapped }));
      }
    }
  };

  const handleCooldownChange = (val: number) => {
    setCooldown(val);
    
    if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
        try {
            const res = await fetch("http://localhost:3000/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ cooldownInterval: val }),
            });
            
            if (res.ok) {
                setSaveStatus("Saved!");
                setTimeout(() => setSaveStatus(null), 2000);
            } else {
                setSaveStatus("Error saving");
            }
        } catch (err) {
            console.error(err);
            setSaveStatus("Error saving");
        }
    }, 800);
  };

  const normalizeHeader = (header: string) => header.trim().replace(/"/g, "").toLowerCase();

  const parseAddressRows = (text: string) => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l);
    if (lines.length === 0) return { rows: [], error: "No data provided" };

    const delimiter = lines[0].includes("\t") ? "\t" : ",";
    const headers = lines[0].split(delimiter).map(normalizeHeader);

    const idx = (names: string[]) => {
      const set = names.map((n) => n.toLowerCase());
      return headers.findIndex((h) => set.includes(h));
    };

    const colId = idx(["id"]);
    const colAddress1 = idx([
      "address 1",
      "address1",
      "address line 1",
      "address",
      "street",
      "street 1",
      "street1",
      "addr",
      "addr1",
    ]);
    const colAddress2 = idx(["address 2", "address2", "address line 2", "street 2", "street2", "addr2"]);
    const colCity = idx(["city"]);
    const colState = idx(["state", "province", "state or province"]);
    const colZip = idx(["zip", "postal", "postal code", "zip code"]);
    const colPhone = idx(["phone", "primary phone number", "phone number"]);
    const colFirst = idx(["aila", "first name", "first"]);
    const colLast = idx(["dawson", "last name", "last"]);

    const requiredCols = [colId, colAddress1, colCity, colState, colFirst, colLast];
    if (requiredCols.some((c) => c === -1)) {
      return { rows: [], error: "Missing required columns. Ensure 'id', 'Address 1', 'City', 'State', and name columns exist." };
    }

    const rows = lines.slice(1).map((line) => line.split(delimiter));
    let missingIdCount = 0;

    const parsedRows = rows
      .map((cols) => {
        const id = colId >= 0 ? (cols[colId] || "").trim() : "";
        if (!id) missingIdCount += 1;
        const first = (cols[colFirst] || "").trim();
        const last = (cols[colLast] || "").trim();
        const name = [first, last].filter(Boolean).join(" ").trim();
        return {
          id: id || undefined,
          address1: (cols[colAddress1] || "").trim(),
          address2: colAddress2 >= 0 ? (cols[colAddress2] || "").trim() : "",
          city: (cols[colCity] || "").trim(),
          state: (cols[colState] || "").trim(),
          zip: colZip >= 0 ? (cols[colZip] || "").trim() : "",
          phone: (cols[colPhone] || "").trim(),
          name,
        };
      })
      .filter((r) => r.id && r.address1 && r.city && r.state && r.name);

    if (parsedRows.length === 0) {
      return {
        rows: [],
        error: missingIdCount > 0 ? "No valid rows found. Each row must have an ID." : "No valid rows found. Check headers and data.",
      };
    }

    if (missingIdCount > 0) {
      return {
        rows: parsedRows,
        error: "Some rows were skipped because ID was missing.",
      };
    }

    return { rows: parsedRows, error: null };
  };

  const handleImport = async () => {
    setImportStatus(null);
    setImportCount(null);
    const { rows, error: parseError } = parseAddressRows(importText);
    if (parseError) {
      setImportStatus(parseError);
    }
    if (!rows || rows.length === 0) {
      setImportCount(null);
      return;
    }

    await handleImportParsed(rows, "pasted data");
  };

  const handleImportParsed = async (parsed: any[], label: string) => {
    setImportStatus(`Importing from ${label}...`);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      const res = await fetch("http://localhost:3000/api/addresses/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresses: parsed, userId: user.id }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      let data: any = null;
      try {
        data = await res.json();
      } catch (_e) {
        // ignore JSON parse errors (e.g., empty body), surface below
      }

      if (!res.ok) {
        setImportStatus(data?.error || "Import failed");
        return;
      }

      setImportCount(data?.accepted ?? parsed.length);
      setImportStatus(data?.message || "Accepted for background import");
    } catch (err: any) {
      if (err?.name === "AbortError") {
        setImportStatus("Import request timed out.");
      } else {
        console.error(err);
        setImportStatus(err.message || "Import failed");
      }
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    const text = await file.text();
    setImportText(text);
    const { rows, error: parseError } = parseAddressRows(text);
    if (parseError) {
      setImportStatus(parseError);
    }
    if (!rows || rows.length === 0) {
      setImportCount(null);
      return;
    }
    await handleImportParsed(rows, `file: ${file.name}`);
  };

  const handleNetworkInputChange = (field: string, value: string) => {
    setNetworkForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveNetworkProfile = async () => {
    setNetworkStatus(null);
    const domain = networkForm.domain.trim();
    const urlPattern = networkForm.urlPattern.trim();
    if (!domain || !urlPattern) {
      setNetworkStatus("Domain and URL pattern are required");
      return;
    }

    const rules = [
      {
        urlPattern,
        method: (networkForm.method || "").trim() || undefined,
        namePath: networkForm.namePath.trim() || undefined,
        firstNamePath: networkForm.firstNamePath.trim() || undefined,
        lastNamePath: networkForm.lastNamePath.trim() || undefined,
      },
    ];

    try {
      const res = await fetch("http://localhost:3000/api/networkProfiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain,
          userId: user.id,
          rules,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || data?.error) {
        setNetworkStatus(data?.error || "Save failed");
        return;
      }

      setNetworkProfiles((prev) => {
        const filtered = prev.filter((p) => p.id !== data.id);
        return [data as NetworkProfile, ...filtered];
      });
      setNetworkStatus("Saved");
    } catch (err: any) {
      console.error(err);
      setNetworkStatus(err?.message || "Save failed");
    }
  };

  const handleDeleteNetworkProfile = async (id: string) => {
    if (!confirm("Delete this network profile?")) return;
    try {
      const res = await fetch(`http://localhost:3000/api/networkProfiles/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setNetworkProfiles((prev) => prev.filter((p) => p.id !== id));
      } else {
        setNetworkStatus("Delete failed");
      }
    } catch (err: any) {
      console.error(err);
      setNetworkStatus(err?.message || "Delete failed");
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gray-50">
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        
        {/* Cooldown Settings */}
        <section className="bg-white p-4 rounded-xl border shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-600" />
              Global Cooldown
            </h3>
            {saveStatus && (
               <span className={`text-xs font-bold px-2 py-1 rounded ${saveStatus === 'Saved!' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                 {saveStatus}
               </span>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Wait time after usage</span>
              <span className="font-medium text-indigo-600">{cooldown} mins</span>
            </div>
            <input
              type="range"
              min="0"
              max="60"
              step="5"
              value={cooldown}
              onChange={(e) => handleCooldownChange(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
            <div className="flex justify-between text-xs text-gray-400">
              <span>0m</span>
              <span>30m</span>
              <span>60m</span>
            </div>
          </div>
        </section>

        {/* Selector Profiles */}
        <section className="space-y-3">
          <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2 px-1">
            <Globe className="w-4 h-4 text-indigo-600" />
            Mapped Domains
          </h3>
          
          {loading ? (
            <div className="text-center py-4 text-gray-500 text-sm">Loading...</div>
          ) : profiles.length === 0 ? (
            <div className="text-center py-8 text-gray-500 bg-white rounded-xl border border-dashed">
              No domain mappings found.
              <p className="text-xs mt-1">Right-click inputs on websites to map them.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {profiles.map((profile) => {
                const isEditing = editingProfiles[profile.id];
                const editState = selectorEdits[profile.id] || buildEditState(profile);
                
                return (
                  <div
                    key={profile.id}
                    className="bg-white p-3 rounded-lg border space-y-3"
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div className="overflow-hidden">
                        <div className="font-medium text-gray-800 truncate">{profile.domain}</div>
                      </div>
                      <div className="flex items-center gap-2">
                         <button
                           onClick={() => toggleEditProfile(profile.id)}
                           className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
                         >
                           {isEditing ? "Cancel" : "Edit"}
                         </button>
                         <button
                           onClick={() => handleDeleteProfile(profile.id)}
                           className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                           title="Delete Mappings"
                         >
                           <Trash2 className="w-4 h-4" />
                         </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {SELECTOR_FIELDS.map((field) => {
                        const current = getSelectorList(profile, field.key);
                        const isVisible = visibleFields[profile.id]?.includes(field.key);
                        
                        // Show if it has values OR if it's explicitly visible in edit mode
                        if (!isVisible && !isEditing && current.length === 0) return null;
                        if (isEditing && !isVisible) return null;

                        return (
                          <div key={field.key} className="space-y-1">
                            <div className="flex items-center justify-between text-xs text-gray-700">
                              <span>{field.label}</span>
                              <span className="text-gray-400">{current.length} mapped</span>
                            </div>
                            {isEditing ? (
                                <textarea
                                  value={editState[field.key] || ""}
                                  onChange={(e) =>
                                    handleSelectorChange(profile.id, field.key, e.target.value)
                                  }
                                  placeholder="One selector per line (CSS or XPath)"
                                  rows={3}
                                  className="w-full border rounded-lg p-2 text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                />
                            ) : (
                                <div className="text-[11px] text-gray-600 bg-gray-50 p-2 rounded border break-all">
                                    {current.join(", ")}
                                </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {isEditing && (
                        <div className="space-y-3 pt-2 border-t">
                          <div className="flex flex-wrap gap-2">
                             {SELECTOR_FIELDS.filter(
                               (f) => !visibleFields[profile.id]?.includes(f.key)
                             ).map((field) => (
                               <button
                                 key={field.key}
                                 onClick={() => handleAddField(profile.id, field.key)}
                                 className="text-xs flex items-center gap-1 px-2 py-1 bg-gray-50 hover:bg-gray-100 border rounded-lg text-gray-600 transition-colors"
                               >
                                 <Plus className="w-3 h-3" />
                                 Add {field.label}
                               </button>
                             ))}
                          </div>
                        
                          <div className="flex items-center justify-between text-xs">
                            {selectorSaveStatus[profile.id] && (
                              <span
                                className={`px-2 py-1 rounded ${
                                  selectorSaveStatus[profile.id] === "Saved"
                                    ? "bg-green-50 text-green-700"
                                    : "bg-red-50 text-red-700"
                                }`}
                              >
                                {selectorSaveStatus[profile.id]}
                              </span>
                            )}
                            <button
                              onClick={() => handleSaveSelectors(profile.id)}
                              disabled={selectorSaving[profile.id]}
                              className="ml-auto px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              {selectorSaving[profile.id] ? "Saving..." : "Save Changes"}
                            </button>
                          </div>
                        </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Network Profiles */}
        <section className="bg-white p-4 rounded-xl border shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
              <Globe className="w-4 h-4 text-indigo-600" />
              Network Name Detection
            </h3>
            {networkStatus && (
              <span className="text-xs px-2 py-1 rounded bg-indigo-50 text-indigo-700 font-medium">
                {networkStatus}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="space-y-1">
              <label className="text-gray-600 text-xs">Domain</label>
              <input
                value={networkForm.domain}
                onChange={(e) => handleNetworkInputChange("domain", e.target.value)}
                placeholder="example.com"
                className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-gray-600 text-xs">HTTP Method (optional)</label>
              <input
                value={networkForm.method}
                onChange={(e) => handleNetworkInputChange("method", e.target.value.toUpperCase())}
                placeholder="GET"
                className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-gray-600 text-xs">URL Pattern (substring or /regex/)</label>
              <input
                value={networkForm.urlPattern}
                onChange={(e) => handleNetworkInputChange("urlPattern", e.target.value)}
                placeholder="/api/profile"
                className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-gray-600 text-xs">Full Name Path</label>
              <input
                value={networkForm.namePath}
                onChange={(e) => handleNetworkInputChange("namePath", e.target.value)}
                placeholder="data.profile.full_name"
                className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-gray-600 text-xs">First Name Path</label>
              <input
                value={networkForm.firstNamePath}
                onChange={(e) => handleNetworkInputChange("firstNamePath", e.target.value)}
                placeholder="data.profile.first_name"
                className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-gray-600 text-xs">Last Name Path</label>
              <input
                value={networkForm.lastNamePath}
                onChange={(e) => handleNetworkInputChange("lastNamePath", e.target.value)}
                placeholder="data.profile.last_name"
                className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSaveNetworkProfile}
              className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Save Network Profile
            </button>
          </div>

          <div className="border-t pt-3">
            {networkProfiles.length === 0 ? (
              <div className="text-center text-sm text-gray-500 py-4">
                No network profiles configured yet.
              </div>
            ) : (
              <div className="space-y-2">
                {networkProfiles.map((profile) => {
                  const firstRule = Array.isArray(profile.rules) ? profile.rules[0] : null;
                  return (
                    <div
                      key={profile.id}
                      className="flex items-start justify-between border rounded-lg p-3 hover:bg-gray-50"
                    >
                      <div className="space-y-1">
                        <div className="font-medium text-gray-800">{profile.domain}</div>
                        {firstRule && (
                          <div className="text-xs text-gray-600 space-y-0.5">
                            <div>URL: {firstRule.urlPattern}</div>
                            {firstRule.method && <div>Method: {firstRule.method}</div>}
                            {firstRule.namePath && <div>Name: {firstRule.namePath}</div>}
                            {(firstRule.firstNamePath || firstRule.lastNamePath) && (
                              <div>
                                Parts: {[firstRule.firstNamePath, firstRule.lastNamePath].filter(Boolean).join(", ")}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteNetworkProfile(profile.id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Delete Network Profile"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Address Import */}
        <section className="bg-white p-4 rounded-xl border shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-800">Bulk Import Addresses (CSV/TSV)</h3>
            {importStatus && (
              <span className="text-xs px-2 py-1 rounded bg-indigo-50 text-indigo-700 font-medium">
                {importStatus}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500">
            Required headers: ID, Address 1, City, State, Aila (First Name), Dawson (Last Name). Optional: Address 2, Zip, Phone.
          </p>
          <div className="flex items-center gap-3 text-sm">
            <label className="cursor-pointer px-3 py-1.5 bg-white border rounded-lg hover:bg-gray-50 transition-colors">
              <input
                type="file"
                accept=".csv,.tsv,.txt"
                className="hidden"
                onChange={handleFileChange}
              />
              Upload CSV/TSV
            </label>
            <span className="text-xs text-gray-500 truncate">
              {importFileName || "No file selected"}
            </span>
          </div>
          <textarea
            className="w-full h-32 border rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="Paste CSV or tab-separated data here..."
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{importCount !== null ? `Imported: ${importCount}` : ""}</span>
            <button
              onClick={handleImport}
              className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Import Addresses
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
