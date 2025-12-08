import { useState, useEffect } from "react";
import { Search, Plus, CreditCard, Settings, RefreshCw, LogOut } from "lucide-react";
import { Card, User } from "../lib/types";
import { AdminOptions } from "../components/AdminOptions";
import { Login } from "../components/Login";
import { Signup } from "../components/Signup";
import { ConfigError } from "../components/ConfigError";
import { useAuth } from "../lib/useAuth";
import { signOut } from "../lib/auth";
import { isSupabaseConfigured } from "../lib/supabase";

type AuthView = "login" | "signup";

function App() {
  console.log('[App] Component rendering...');
  const { user, isLoading: authLoading } = useAuth();
  console.log('[App] Auth state:', { user: user?.email, authLoading });
  const [authView, setAuthView] = useState<AuthView>("login");
  const [activeTab, setActiveTab] = useState<"vault" | "options">("vault");
  const [cards, setCards] = useState<Card[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchCards = () => {
    console.log('[fetchCards] Starting...');
    if (!user) {
      console.log('[fetchCards] No user, returning');
      return;
    }
    
    console.log('[fetchCards] Setting loading to true');
    setLoading(true);
    
    // Add timeout in case background script doesn't respond
    const timeout = setTimeout(() => {
      console.error('[fetchCards] TIMEOUT - background script not responding after 5 seconds');
      setLoading(false);
    }, 5000);
    
    console.log('[fetchCards] Sending message to background...');
    try {
      chrome.runtime.sendMessage({ 
        type: "GET_CARDS",
        payload: { userId: user.id, role: user.role, groupId: user.slash_group_id }
      }, (response) => {
        clearTimeout(timeout);
        
        // Check for Chrome runtime errors
        if (chrome.runtime.lastError) {
          console.error('Chrome runtime error:', chrome.runtime.lastError);
          setLoading(false);
          return;
        }
        
        if (response && response.cards) {
          setCards(response.cards);
        } else if (response && response.error) {
          console.error('Error fetching cards:', response.error);
        }
        setLoading(false);
      });
    } catch (error) {
      clearTimeout(timeout);
      console.error('Error sending message:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    console.log('[App] useEffect for fetchCards, user:', user?.email);
    if (user) {
      console.log('[App] User exists, fetching cards...');
      fetchCards();
    }
  }, [user]);

  const filteredCards = cards.filter((card) => {
    const query = searchQuery.toLowerCase();
    return (
      card.last4.includes(query) ||
      card.brand.toLowerCase().includes(query) ||
      card.labels.some((l) => l.toLowerCase().includes(query))
    );
  });

  // Check for active cards (not in cooldown)
  const activeCards = cards.filter(card => {
      if (!card.active) return false;
      if (card.excluded_until && new Date(card.excluded_until) > new Date()) return false;
      return true;
  });

  const handleGenerateCard = () => {
    if (!user) return;
    
    setLoading(true);
    
    const timeout = setTimeout(() => {
      console.error('Card creation timeout');
      setLoading(false);
    }, 5000);
    
    chrome.runtime.sendMessage({ 
      type: "CREATE_CARD",
      payload: { userId: user.id, groupId: user.slash_group_id }
    }, (response) => {
      clearTimeout(timeout);
      
      if (chrome.runtime.lastError) {
        console.error('Chrome runtime error:', chrome.runtime.lastError);
        setLoading(false);
        return;
      }
      
      if (response && response.card) {
        fetchCards();
      } else {
        setLoading(false);
      }
    });
  };

  const handleLogout = async () => {
    await signOut();
    // Auth state change will update UI automatically
  };

  const handleAutofillNext = () => {
    if (!user) return;
    
    setLoading(true);
    
    const timeout = setTimeout(() => {
      console.error('Autofill timeout');
      setLoading(false);
    }, 5000);
    
    chrome.runtime.sendMessage({ 
      type: "AUTOFILL_NEXT",
      payload: { userId: user.id, role: user.role, groupId: user.slash_group_id }
    }, (response) => {
      clearTimeout(timeout);
      
      if (chrome.runtime.lastError) {
        console.error('Chrome runtime error:', chrome.runtime.lastError);
        setLoading(false);
        return;
      }
      
      if (response && response.success) {
        fetchCards();
      } else {
        setLoading(false);
      }
    });
  };

  const handleAutofillCard = (cardId: string) => {
      if (!user) return;
      
      setLoading(true);
      
      const timeout = setTimeout(() => {
        console.error('Autofill card timeout');
        setLoading(false);
      }, 5000);
      
      chrome.runtime.sendMessage({ 
        type: "AUTOFILL_CARD", 
        payload: { 
          cardId, 
          userId: user.id, 
          role: user.role, 
          groupId: user.slash_group_id 
        } 
      }, (response) => {
          clearTimeout(timeout);
          
          if (chrome.runtime.lastError) {
            console.error('Chrome runtime error:', chrome.runtime.lastError);
            setLoading(false);
            return;
          }
          
          if (response && response.success) {
              fetchCards();
          } else {
              setLoading(false);
          }
      });
  };

  // Check if Supabase is configured
  if (!isSupabaseConfigured()) {
    return <ConfigError />;
  }

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-2" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show auth screens if not logged in
  if (!user) {
    if (authView === "signup") {
      return <Signup onSwitchToLogin={() => setAuthView("login")} />;
    }
    return <Login onSwitchToSignup={() => setAuthView("signup")} />;
  }

  // User is authenticated - show main app
  return (
    <div className="w-full h-full flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b p-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-indigo-600 flex items-center gap-2">
            <CreditCard className="w-6 h-6" />
            Slash Vault
          </h1>
          {user.role === "admin" && (
            <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-medium rounded">
              Admin
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {user.role === "admin" && (
            <button
              onClick={() =>
                setActiveTab(activeTab === "vault" ? "options" : "vault")
              }
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              title={activeTab === "vault" ? "Options" : "Back to Vault"}
            >
              <Settings className="w-5 h-5 text-gray-600" />
            </button>
          )}
          <button
            onClick={handleLogout}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            title="Sign out"
          >
            <LogOut className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {activeTab === "vault" ? (
          <>
            {/* Search & Actions */}
            <div className="p-4 space-y-3 bg-white border-b">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search cards..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
              </div>
              <button
                onClick={handleGenerateCard}
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-lg flex items-center justify-center gap-2 font-medium transition-colors disabled:opacity-70"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                Generate New Card
              </button>
              <button
                onClick={handleAutofillNext}
                disabled={loading || activeCards.length === 0}
                className="w-full bg-white border border-indigo-600 text-indigo-600 hover:bg-indigo-50 py-2 px-4 rounded-lg flex items-center justify-center gap-2 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CreditCard className="w-4 h-4" />
                {activeCards.length === 0 ? "No Active Cards" : "Autofill Next Card (Ctrl+Shift+F)"}
              </button>
            </div>

            {/* Card List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loading && cards.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  Loading cards...
                </div>
              ) : filteredCards.length > 0 ? (
                filteredCards.map((card) => (
                  <div
                    key={card.id}
                    className="bg-white p-4 rounded-xl border shadow-sm hover:shadow-md transition-shadow group"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-lg tracking-wider">
                          •••• {card.last4}
                        </span>
                        <span className="px-2 py-0.5 bg-gray-100 text-xs rounded text-gray-600 font-medium">
                          {card.brand}
                        </span>
                      </div>
                      {card.excluded_until &&
                        new Date(card.excluded_until) > new Date() && (
                          <span className="text-xs text-amber-600 font-medium bg-amber-50 px-2 py-1 rounded">
                            Cooldown
                          </span>
                        )}
                    </div>
                    <div className="flex justify-between items-end">
                      <div className="text-xs text-gray-500 space-y-1">
                        <div>
                          Exp: {card.exp_month}/{card.exp_year}
                        </div>
                        <div>Used: {card.usage_count} times</div>
                        <div className="text-gray-400">Created by: {card.created_by}</div>
                      </div>
                      <button 
                        onClick={() => handleAutofillCard(card.id)}
                        disabled={!!(card.excluded_until && new Date(card.excluded_until) > new Date())}
                        className="text-sm text-indigo-600 font-medium hover:text-indigo-800 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Autofill
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No cards found.
                </div>
              )}
            </div>
          </>
        ) : (
            <AdminOptions user={user as User} />
        )}
      </main>
    </div>
  );
}

export default App;
