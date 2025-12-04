import { useState, useEffect, useRef } from "react";
import { Trash2, Clock, Globe } from "lucide-react";
import { SelectorProfile } from "../lib/types";

export function AdminOptions() {
  const [profiles, setProfiles] = useState<SelectorProfile[]>([]);
  const [cooldown, setCooldown] = useState(30);
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const saveTimeoutRef = useRef<number | null>(null);

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
      </div>
    </div>
  );
}
