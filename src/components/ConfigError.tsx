import { AlertCircle, CreditCard } from 'lucide-react';

export function ConfigError() {
  return (
    <div className="w-full h-full flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b p-4 flex justify-center items-center shadow-sm">
        <h1 className="text-xl font-bold text-indigo-600 flex items-center gap-2">
          <CreditCard className="w-6 h-6" />
          Slash Vault
        </h1>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h2 className="text-lg font-bold text-red-900 mb-2">
                  Configuration Error
                </h2>
                <p className="text-sm text-red-800 mb-4">
                  Supabase credentials are not configured. The extension cannot function without proper configuration.
                </p>
                
                <div className="bg-white rounded border border-red-300 p-3 mb-4">
                  <p className="text-xs font-mono text-gray-700 mb-2">
                    Required environment variables:
                  </p>
                  <ul className="text-xs font-mono text-gray-600 space-y-1">
                    <li>• VITE_SUPABASE_URL</li>
                    <li>• VITE_SUPABASE_ANON_KEY</li>
                  </ul>
                </div>

                <div className="space-y-2 text-sm text-red-800">
                  <p className="font-semibold">To fix this:</p>
                  <ol className="list-decimal list-inside space-y-1 text-xs">
                    <li>Create a <code className="bg-red-100 px-1 rounded">.env</code> file in the project root</li>
                    <li>Add your Supabase credentials</li>
                    <li>Run <code className="bg-red-100 px-1 rounded">npm run build</code></li>
                    <li>Reload the extension in Chrome</li>
                  </ol>
                </div>

                <div className="mt-4 pt-4 border-t border-red-300">
                  <p className="text-xs text-red-700">
                    See <strong>SETUP.md</strong> for detailed instructions.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

