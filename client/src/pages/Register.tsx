import { useState } from 'react';
import { useLocation, Link } from 'wouter';
import { Phone, ArrowRight, Loader2, CheckCircle } from 'lucide-react';
import logoIcon from '@/assets/gridmart-logo-icon.png';
import logoText from '@/assets/gridmart-logo-text.png';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/lib/auth';

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

export default function Register() {
  const [, navigate] = useLocation();
  const { setUser } = useAuth();
  const [step, setStep] = useState<'phone' | 'verify'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [codeSent, setCodeSent] = useState(false);

  const formatPhoneNumber = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    setPhone(formatted);
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    const digits = phone.replace(/\D/g, '');
    if (digits.length !== 10) {
      setError('Please enter a valid 10-digit phone number');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: digits }),
      });

      const data = await response.json();
      
      if (response.ok) {
        setCodeSent(true);
        setStep('verify');
      } else {
        setError(data.error || 'Failed to send verification code');
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (code.length !== 6) {
      setError('Please enter the 6-digit code');
      return;
    }

    setLoading(true);
    try {
      const digits = phone.replace(/\D/g, '');
      const response = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phone: digits, code }),
      });

      const data = await response.json();
      
      if (response.ok) {
        setUser(data.user);
        navigate('/');
      } else {
        setError(data.error || 'Verification failed');
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setError('');
    setLoading(true);
    try {
      const digits = phone.replace(/\D/g, '');
      const response = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: digits }),
      });

      const data = await response.json();
      
      if (response.ok) {
        setError('');
        setCode('');
      } else {
        setError(data.error || 'Failed to resend code');
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5 p-4">
      <div className="w-full max-w-md animate-slide-up">
        <div className="text-center mb-8">
          <Link href="/">
            <div className="inline-flex items-center gap-2 mb-4">
              <img src={logoIcon} alt="GridMart" className="w-10 h-10 object-contain" />
              <img src={logoText} alt="GridMart" className="h-6 object-contain" />
            </div>
          </Link>
          <p className="text-muted-foreground">
            {step === 'phone' ? 'Create your account' : 'Enter verification code'}
          </p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-center gap-2 py-2">
              <Phone className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg">
                {step === 'phone' ? 'Sign Up' : 'Verify Phone'}
              </CardTitle>
            </div>
            <CardDescription className="text-center">
              {step === 'phone' 
                ? 'Enter your phone number to get started'
                : `We sent a code to ${phone}`
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {step === 'phone' ? (
              <>
                <Button 
                  variant="outline" 
                  className="w-full gap-2" 
                  type="button"
                  onClick={() => {
                    alert('Google sign-up coming soon! Use phone for now.');
                  }}
                  data-testid="button-google-register"
                >
                  <GoogleIcon className="w-5 h-5" />
                  Continue with Google
                </Button>

                <div className="flex items-center gap-3 my-4">
                  <Separator className="flex-1" />
                  <span className="text-xs text-muted-foreground">or</span>
                  <Separator className="flex-1" />
                </div>

                <form onSubmit={handleSendCode} className="space-y-4">
                  <div>
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={phone}
                      onChange={handlePhoneChange}
                      placeholder="(416) 555-1234"
                      maxLength={14}
                      required
                      data-testid="input-phone"
                    />
                  </div>
                  {error && (
                    <p className="text-sm text-destructive" data-testid="text-error">{error}</p>
                  )}
                  <Button type="submit" className="w-full gap-2" disabled={loading} data-testid="button-send-code">
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ArrowRight className="w-4 h-4" />
                    )}
                    {loading ? 'Sending...' : 'Send Verification Code'}
                  </Button>
                </form>
              </>
            ) : (
              <form onSubmit={handleVerifyCode} className="space-y-4">
                {codeSent && (
                  <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 p-3 rounded-lg mb-4">
                    <CheckCircle className="w-4 h-4" />
                    Verification code sent!
                  </div>
                )}
                <div>
                  <Label htmlFor="code">Verification Code</Label>
                  <Input
                    id="code"
                    type="text"
                    inputMode="numeric"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="123456"
                    maxLength={6}
                    className="text-center text-2xl tracking-widest"
                    required
                    autoFocus
                    data-testid="input-code"
                  />
                </div>
                {error && (
                  <p className="text-sm text-destructive" data-testid="text-error">{error}</p>
                )}
                <Button type="submit" className="w-full gap-2" disabled={loading} data-testid="button-verify">
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  {loading ? 'Verifying...' : 'Verify & Continue'}
                </Button>
                <div className="text-center">
                  <Button
                    type="button"
                    variant="link"
                    className="text-sm"
                    onClick={handleResendCode}
                    disabled={loading}
                    data-testid="button-resend"
                  >
                    Didn't receive code? Resend
                  </Button>
                </div>
                <div className="text-center">
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-sm"
                    onClick={() => {
                      setStep('phone');
                      setCode('');
                      setError('');
                      setCodeSent(false);
                    }}
                    data-testid="button-change-phone"
                  >
                    Use a different number
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Already have an account?{' '}
          <Link href="/login" className="text-primary hover:underline font-medium">
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}
