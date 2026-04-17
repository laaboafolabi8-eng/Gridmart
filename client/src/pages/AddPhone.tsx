import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Phone, Loader2, ArrowLeft, CheckCircle, Mail } from 'lucide-react';
import logoIcon from '@/assets/gridmart-logo-icon.png';
import logoText from '@/assets/gridmart-logo-text.png';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/auth';

export default function AddPhone() {
  const [, navigate] = useLocation();
  const { user, checkSession, isLoading } = useAuth();
  const [step, setStep] = useState<'phone' | 'verify'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    
    if (!user) {
      navigate('/login');
      return;
    }
    
    if (user.phone) {
      if (user.type === 'admin') {
        navigate('/admin');
      } else if (user.type === 'node') {
        navigate('/node-dashboard');
      } else {
        navigate('/');
      }
    }
  }, [user, navigate, isLoading]);

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

  const getDigitsOnly = (phoneNumber: string) => {
    return phoneNumber.replace(/\D/g, '');
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    const digits = getDigitsOnly(phone);
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
      const response = await fetch('/api/auth/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phone: getDigitsOnly(phone), verificationCode: code }),
      });

      const data = await response.json();
      
      if (response.ok) {
        await checkSession();
        const updatedUser = data.user;
        if (updatedUser?.type === 'admin') {
          navigate('/admin');
        } else if (updatedUser?.type === 'node') {
          navigate('/node-dashboard');
        } else {
          navigate('/');
        }
      } else {
        setError(data.error || 'Verification failed');
      }
    } catch (err: any) {
      console.error('Verify code error:', err);
      setError('Connection error. Please check your internet and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setError('');
    setLoading(true);
    try {
      const response = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: getDigitsOnly(phone) }),
      });

      const data = await response.json();
      
      if (response.ok) {
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
        <div className="flex items-center gap-2 mb-8">
          <img src={logoIcon} alt="" className="h-10 w-10" />
          <img src={logoText} alt="GridMart" className="h-6" />
        </div>
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <div className="flex items-center gap-2 mb-8">
        <img src={logoIcon} alt="" className="h-10 w-10" />
        <img src={logoText} alt="GridMart" className="h-6" />
      </div>

      <Card className="w-full max-w-md">
        <CardHeader className="text-center pb-4">
          {user?.email && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-4 bg-muted/50 rounded-lg py-2 px-3">
              <Mail className="w-4 h-4" />
              <span>Signed in as {user.email}</span>
            </div>
          )}
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Phone className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-2xl font-display font-semibold">Add Your Phone Number</h1>
          <CardDescription>
            {step === 'phone' 
              ? "We'll text you pickup notifications and order updates"
              : `Enter the 6-digit code sent to ${phone}`
            }
          </CardDescription>
        </CardHeader>

        <CardContent>
          {error && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
              {error}
            </div>
          )}

          {step === 'phone' && (
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
                  autoComplete="tel"
                  data-testid="input-add-phone"
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={loading || getDigitsOnly(phone).length !== 10}
                data-testid="button-send-code"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send Verification Code'
                )}
              </Button>
            </form>
          )}

          {step === 'verify' && (
            <form onSubmit={handleVerifyCode} className="space-y-4">
              <div>
                <Label htmlFor="code">Verification Code</Label>
                <Input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  maxLength={6}
                  autoComplete="one-time-code"
                  className="text-center text-2xl tracking-widest"
                  data-testid="input-verification-code"
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={loading || code.length !== 6}
                data-testid="button-verify-code"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Verify & Continue
                  </>
                )}
              </Button>

              <div className="flex items-center justify-between text-sm">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStep('phone');
                    setCode('');
                  }}
                  className="gap-1"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Change Number
                </Button>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  onClick={handleResendCode}
                  disabled={loading}
                >
                  Resend Code
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <p className="mt-6 text-sm text-muted-foreground text-center max-w-sm">
        Your phone number helps us send pickup notifications and keep your orders secure.
      </p>
    </div>
  );
}
