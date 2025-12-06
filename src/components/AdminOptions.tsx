import { useState, useEffect, useRef } from "react";
import { User } from "../lib/types";
import { Trash2, Clock, Globe } from "lucide-react";
import { SelectorProfile } from "../lib/types";

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

  useEffect(() => {
    loadData();
    return () => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

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
      .finally(() => setLoading(false));
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
    if (lines.length === 0) return [];

    const delimiter = lines[0].includes("\t") ? "\t" : ",";
    const headers = lines[0].split(delimiter).map(normalizeHeader);

    const idx = (names: string[]) => {
      const set = names.map((n) => n.toLowerCase());
      return headers.findIndex((h) => set.includes(h));
    };

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

    const requiredCols = [colAddress1, colCity, colState, colFirst, colLast];
    if (requiredCols.some((c) => c === -1)) return [];

    const rows = lines.slice(1).map((line) => line.split(delimiter));

    return rows
      .map((cols) => {
        const first = (cols[colFirst] || "").trim();
        const last = (cols[colLast] || "").trim();
        const name = [first, last].filter(Boolean).join(" ").trim();
        return {
          address1: (cols[colAddress1] || "").trim(),
          address2: colAddress2 >= 0 ? (cols[colAddress2] || "").trim() : "",
          city: (cols[colCity] || "").trim(),
          state: (cols[colState] || "").trim(),
          zip: colZip >= 0 ? (cols[colZip] || "").trim() : "",
          phone: (cols[colPhone] || "").trim(),
          name,
        };
      })
      .filter((r) => r.address1 && r.city && r.state && r.name);
  };

  const handleImport = async () => {
    setImportStatus(null);
    setImportCount(null);
    const parsed = parseAddressRows(importText);
    if (parsed.length === 0) {
      setImportStatus("No valid rows found. Check headers and data.");
      return;
    }

    await handleImportParsed(parsed, "pasted data");
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
    const parsed = parseAddressRows(text);
    if (parsed.length === 0) {
      setImportStatus("No valid rows found. Check headers and data.");
      return;
    }
    await handleImportParsed(parsed, `file: ${file.name}`);
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
              {profiles.map((profile) => (
                <div key={profile.id} className="bg-white p-3 rounded-lg border flex justify-between items-start group">
                  <div className="overflow-hidden">
                    <div className="font-medium text-gray-800 truncate">{profile.domain}</div>
                    <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                      {profile.cardNumberSelectors?.length > 0 && (
                        <div>• Number: {profile.cardNumberSelectors.length} mapped</div>
                      )}
                      {profile.cardExpirySelectors?.length > 0 && (
                        <div>• Expiry: {profile.cardExpirySelectors.length} mapped</div>
                      )}
                      {profile.cvvSelectors?.length > 0 && (
                        <div>• CVV: {profile.cvvSelectors.length} mapped</div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteProfile(profile.id)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    title="Delete Mappings"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
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
            Expected headers: Address 1, Address 2, City, State, Zip, Phone, Aila (First Name), Dawson (Last Name)
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
