import { useState } from 'react';
import { CreditCard, AlertCircle, Loader2, CheckCircle } from 'lucide-react';
import { signUp } from '../lib/auth';

interface SignupProps {
  onSwitchToLogin: () => void;
}

export function Signup({ onSwitchToLogin }: SignupProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [groupId, setGroupId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    // Validation
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    setIsLoading(true);

    try {
      const { user, error: signUpError } = await signUp(email, password, groupId || undefined);
      
      if (signUpError) {
        setError(signUpError);
      } else if (user) {
        setSuccess(true);
        // Auto-redirect to login after a short delay
        setTimeout(() => {
          onSwitchToLogin();
        }, 2000);
      } else {
        setError('Sign up failed. Please try again.');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="w-full h-full flex flex-col bg-gray-50">
        <header className="bg-white border-b p-4 flex justify-center items-center shadow-sm">
          <h1 className="text-xl font-bold text-indigo-600 flex items-center gap-2">
            <CreditCard className="w-6 h-6" />
            Slash Vault
          </h1>
        </header>
        
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <div className="bg-green-100 p-4 rounded-full">
                <CheckCircle className="w-12 h-12 text-green-600" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Account Created!</h2>
            <p className="text-gray-600">Redirecting to login...</p>
          </div>
        </main>
      </div>
    );
  }

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
      <main className="flex-1 overflow-y-auto p-6">
        <div className="w-full max-w-sm mx-auto space-y-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900">Create Account</h2>
            <p className="mt-2 text-sm text-gray-600">
              Sign up to start managing your cards
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                placeholder="you@example.com"
                disabled={isLoading}
              />
            </div>

            <div>
              <label htmlFor="groupId" className="block text-sm font-medium text-gray-700 mb-1">
                Group ID <span className="text-gray-500 font-normal">(optional)</span>
              </label>
              <input
                id="groupId"
                type="text"
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                placeholder="Your team/group ID"
                disabled={isLoading}
              />
              <p className="mt-1 text-xs text-gray-500">
                Enter your team's group ID to share cards with your team
              </p>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                placeholder="••••••••"
                disabled={isLoading}
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                placeholder="••••••••"
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-lg font-medium transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating account...
                </>
              ) : (
                'Sign Up'
              )}
            </button>
          </form>

          <div className="text-center">
            <p className="text-sm text-gray-600">
              Already have an account?{' '}
              <button
                onClick={onSwitchToLogin}
                className="text-indigo-600 hover:text-indigo-700 font-medium"
                disabled={isLoading}
              >
                Sign in
              </button>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

