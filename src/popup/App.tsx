import React, { useState, useEffect } from 'react';
import { Search, Plus, CreditCard, Settings, RefreshCw } from 'lucide-react';
import { MOCK_CARDS, MOCK_USER } from '../lib/mocks';
import { Card } from '../lib/types';

function App() {
  const [activeTab, setActiveTab] = useState<'vault' | 'options'>('vault');
  const [cards, setCards] = useState<Card[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Simulate fetch
    setLoading(true);
    setTimeout(() => {
      setCards(MOCK_CARDS);
      setLoading(false);
    }, 500);
  }, []);

  const filteredCards = cards.filter((card) => {
    const query = searchQuery.toLowerCase();
    return (
      card.last4.includes(query) ||
      card.brand.toLowerCase().includes(query) ||
      card.labels.some((l) => l.toLowerCase().includes(query))
    );
  });

  const handleGenerateCard = () => {
    // Mock generation
    setLoading(true);
    setTimeout(() => {
      const newCard: Card = {
        id: `card-${Date.now()}`,
        slash_card_id: `slash-${Date.now()}`,
        last4: Math.floor(1000 + Math.random() * 9000).toString(),
        brand: 'Visa',
        exp_month: 12,
        exp_year: 2028,
        created_by: MOCK_USER.id,
        labels: ['New'],
        last_used: null,
        usage_count: 0,
        excluded_until: null,
        active: true,
        created_at: new Date().toISOString(),
      };
      setCards([newCard, ...cards]);
      setLoading(false);
    }, 1000);
  };

  return (
    <div className="w-full h-full flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b p-4 flex justify-between items-center shadow-sm">
        <h1 className="text-xl font-bold text-indigo-600 flex items-center gap-2">
          <CreditCard className="w-6 h-6" />
          Slash Vault
        </h1>
        {MOCK_USER.role === 'admin' && (
          <button
            onClick={() => setActiveTab(activeTab === 'vault' ? 'options' : 'vault')}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            title={activeTab === 'vault' ? 'Options' : 'Back to Vault'}
          >
            <Settings className="w-5 h-5 text-gray-600" />
          </button>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'vault' ? (
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
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Generate New Card
              </button>
            </div>

            {/* Card List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loading && cards.length === 0 ? (
                <div className="text-center py-8 text-gray-500">Loading cards...</div>
              ) : filteredCards.length > 0 ? (
                filteredCards.map((card) => (
                  <div
                    key={card.id}
                    className="bg-white p-4 rounded-xl border shadow-sm hover:shadow-md transition-shadow group"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-lg tracking-wider">•••• {card.last4}</span>
                        <span className="px-2 py-0.5 bg-gray-100 text-xs rounded text-gray-600 font-medium">
                          {card.brand}
                        </span>
                      </div>
                      {card.excluded_until && new Date(card.excluded_until) > new Date() && (
                        <span className="text-xs text-amber-600 font-medium bg-amber-50 px-2 py-1 rounded">
                          Cooldown
                        </span>
                      )}
                    </div>
                    <div className="flex justify-between items-end">
                      <div className="text-xs text-gray-500">
                        <div>Exp: {card.exp_month}/{card.exp_year}</div>
                        <div>Used: {card.usage_count} times</div>
                      </div>
                      <button className="text-sm text-indigo-600 font-medium hover:text-indigo-800 opacity-0 group-hover:opacity-100 transition-opacity">
                        Autofill
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">No cards found.</div>
              )}
            </div>
          </>
        ) : (
          <div className="p-4">
            <h2 className="text-lg font-bold mb-4">Admin Options</h2>
            <p className="text-gray-600 text-sm">Global selector management and cooldown settings will go here.</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
