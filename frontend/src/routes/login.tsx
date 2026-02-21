import { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { AlertCircle, Loader2, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LoginPageProps {
  onSuccess?: () => void;
}

export function LoginPage({ onSuccess }: LoginPageProps) {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [shake, setShake] = useState(false);
  const login = useAuthStore((s) => s.login);
  const loading = useAuthStore((s) => s.loading);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!key.trim()) {
      setError('API key is required');
      triggerShake();
      return;
    }
    const ok = await login(key.trim());
    if (ok) {
      onSuccess?.();
    } else {
      setError('Invalid API key');
      setKey('');
      triggerShake();
    }
  };

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-void">
      {/* Deep space background layers */}
      <div className="absolute inset-0">
        {/* Radial gradient core */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(34,211,167,0.06),transparent_70%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_80%_120%,rgba(59,130,246,0.04),transparent_60%)]" />

        {/* Grid with fade */}
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(99,123,184,1) 1px, transparent 1px), linear-gradient(90deg, rgba(99,123,184,1) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
            maskImage: 'radial-gradient(ellipse 70% 60% at 50% 50%, black 20%, transparent 70%)',
            WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 50% 50%, black 20%, transparent 70%)',
          }}
        />

        {/* Floating orbs */}
        <div className="login-orb login-orb-1" />
        <div className="login-orb login-orb-2" />
        <div className="login-orb login-orb-3" />

        {/* Noise texture overlay */}
        <div className="absolute inset-0 opacity-[0.015]" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
        }} />
      </div>

      {/* Content */}
      <div className="relative w-full max-w-[420px] mx-6 login-enter">
        {/* Outer glow ring */}
        <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-accent/20 via-transparent to-info/10 blur-sm" />

        {/* Card */}
        <div className="relative rounded-2xl border border-white/[0.06] bg-[#080d1c]/90 backdrop-blur-xl shadow-[0_32px_64px_-12px_rgba(0,0,0,0.8)]">
          {/* Top accent line */}
          <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />

          <div className="px-8 pt-10 pb-8">
            {/* Logo mark */}
            <div className="flex flex-col items-center mb-8">
              <div className="relative mb-5">
                {/* Pulsing ring */}
                <div className="absolute -inset-3 rounded-full bg-accent/10 animate-[pulse_3s_ease-in-out_infinite]" />
                <div className="relative h-14 w-14 rounded-full bg-gradient-to-br from-accent/20 to-accent/5 border border-accent/25 flex items-center justify-center">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" className="text-accent">
                    <path d="M12 2L2 7l10 5 10-5-10-5z" fill="currentColor" opacity="0.3"/>
                    <path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>

              <h1 className="text-[22px] font-bold tracking-[-0.02em] text-white">
                Overmind
              </h1>
              <p className="mt-1 text-[13px] text-text-muted font-medium tracking-wide uppercase">
                Mission Control
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="api-key" className="block text-[11px] font-semibold text-text-muted mb-2 tracking-wider uppercase">
                  Access Key
                </label>
                <div className={cn('relative group', shake && 'login-shake')}>
                  <input
                    ref={inputRef}
                    id="api-key"
                    type={showKey ? 'text' : 'password'}
                    value={key}
                    onChange={(e) => { setKey(e.target.value); setError(''); }}
                    placeholder="Enter your API key"
                    autoComplete="off"
                    className={cn(
                      'w-full rounded-xl px-4 py-3.5 pr-11 text-[13px] font-mono tracking-wide',
                      'bg-white/[0.03] border text-white placeholder:text-text-muted/60',
                      'focus:outline-none transition-all duration-200',
                      'focus:bg-white/[0.05] focus:shadow-[0_0_0_3px_rgba(34,211,167,0.08)]',
                      error
                        ? 'border-danger/40 focus:border-danger/60'
                        : 'border-white/[0.06] focus:border-accent/30'
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-text-muted/50 hover:text-text-secondary transition-colors"
                    tabIndex={-1}
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 text-danger text-[12px] login-fade-in">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-medium">{error}</span>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className={cn(
                  'w-full flex items-center justify-center gap-2.5 rounded-xl px-4 py-3.5',
                  'text-[13px] font-bold tracking-wide transition-all duration-200',
                  'bg-gradient-to-r from-accent to-emerald-400 text-void',
                  'hover:shadow-[0_0_24px_rgba(34,211,167,0.25)] hover:brightness-110',
                  'active:scale-[0.98]',
                  'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none',
                  'focus:outline-none focus:ring-2 focus:ring-accent/30 focus:ring-offset-2 focus:ring-offset-void'
                )}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Authenticating...
                  </>
                ) : (
                  <>
                    Enter Mission Control
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            {/* Divider */}
            <div className="mt-6 pt-5 border-t border-white/[0.04]">
              <p className="text-center text-[10px] text-text-muted/60 tracking-wide">
                Secured with <code className="text-text-muted/80 bg-white/[0.03] px-1.5 py-0.5 rounded text-[9px]">OVERMIND_API_KEY</code>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
