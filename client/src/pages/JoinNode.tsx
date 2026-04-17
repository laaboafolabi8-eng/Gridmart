import { useState, useEffect } from 'react';
import { useRoute, useLocation } from 'wouter';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, MapPin, CheckCircle, AlertCircle } from 'lucide-react';
import logoIcon from '@/assets/gridmart-logo-icon.png';

export default function JoinNode() {
  const [, params] = useRoute('/join/:token');
  const [, setLocation] = useLocation();
  const { checkSession } = useAuth();
  const token = params?.token || '';
  
  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenError, setTokenError] = useState('');
  const [prefillEmail, setPrefillEmail] = useState('');
  const [prefillNodeName, setPrefillNodeName] = useState('');
  
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    nodeName: '',
    address: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  
  useEffect(() => {
    if (!token) return;
    
    const validateToken = async () => {
      try {
        const res = await fetch(`/api/invite-tokens/validate/${token}`);
        const data = await res.json();
        
        if (!res.ok || !data.valid) {
          setTokenError(data.error || 'Invalid invite link');
          setTokenValid(false);
        } else {
          setTokenValid(true);
          if (data.email) {
            setPrefillEmail(data.email);
            setForm(f => ({ ...f, email: data.email }));
          }
          if (data.nodeName) {
            setPrefillNodeName(data.nodeName);
            setForm(f => ({ ...f, nodeName: data.nodeName }));
          }
        }
      } catch (e) {
        setTokenError('Failed to validate invite link');
        setTokenValid(false);
      } finally {
        setValidating(false);
      }
    };
    
    validateToken();
  }, [token]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (form.password !== form.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    
    if (form.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    
    if (!form.address.trim()) {
      toast.error('Address is required');
      return;
    }
    
    setSubmitting(true);
    
    try {
      const res = await fetch('/api/auth/register-node', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
          phone: form.phone,
          nodeName: form.nodeName,
          address: form.address || null,
          inviteToken: token,
        }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Registration failed');
      }
      
      localStorage.setItem('gridmart_active_role', 'node');
      await checkSession();
      setSuccess(true);
      toast.success('Welcome to GridMart!');
      
      setTimeout(() => {
        setLocation('/node-dashboard');
      }, 2000);
    } catch (e: any) {
      toast.error(e.message || 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };
  
  if (validating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/20">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary mb-4" />
          <p className="text-muted-foreground">Validating invite link...</p>
        </div>
      </div>
    );
  }
  
  if (!tokenValid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/20 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Invalid Invite Link</h2>
            <p className="text-muted-foreground mb-4">{tokenError}</p>
            <Button variant="outline" onClick={() => setLocation('/')}>
              Go to Homepage
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/20 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Welcome to GridMart!</h2>
            <p className="text-muted-foreground mb-4">
              Your node host account has been created. Redirecting to your dashboard...
            </p>
            <Loader2 className="w-5 h-5 animate-spin mx-auto text-primary" />
          </CardContent>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/20 p-4">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <img src={logoIcon} alt="GridMart" className="w-10 h-10" />
            <span className="font-display text-2xl font-bold text-gradient">GridMart</span>
          </div>
          <CardTitle className="text-xl">Become a Node Host</CardTitle>
          <CardDescription>
            You've been invited to join GridMart as a fulfillment partner
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Your Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Full name"
                  required
                  data-testid="input-join-name"
                />
              </div>
              
              <div className="col-span-2">
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="your@email.com"
                  required
                  disabled={!!prefillEmail}
                  className={prefillEmail ? 'bg-muted' : ''}
                  data-testid="input-join-email"
                />
                {prefillEmail && (
                  <p className="text-xs text-muted-foreground mt-1">
                    This email was specified in your invite
                  </p>
                )}
              </div>
              
              <div>
                <Label>Password *</Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Min 6 characters"
                  required
                  data-testid="input-join-password"
                />
              </div>
              
              <div>
                <Label>Confirm Password *</Label>
                <Input
                  type="password"
                  value={form.confirmPassword}
                  onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                  placeholder="Confirm password"
                  required
                  data-testid="input-join-confirm-password"
                />
              </div>
              
              <div className="col-span-2">
                <Label>Phone *</Label>
                <Input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+1 555 123 4567"
                  required
                  data-testid="input-join-phone"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Used for order notifications via SMS
                </p>
              </div>
              
              <div className="col-span-2 pt-2 border-t">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                  <MapPin className="w-4 h-4" />
                  <span>Node Details</span>
                </div>
              </div>
              
              <div className="col-span-2">
                <Label>Node Name *</Label>
                <Input
                  value={form.nodeName}
                  onChange={(e) => setForm({ ...form, nodeName: e.target.value })}
                  placeholder="e.g., Downtown Windsor Hub"
                  required
                  disabled={!!prefillNodeName}
                  className={prefillNodeName ? 'bg-muted' : ''}
                  data-testid="input-join-node-name"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {prefillNodeName 
                    ? 'This node name was specified in your invite'
                    : 'This is how customers will see your pickup location'}
                </p>
              </div>
              
              <div className="col-span-2">
                <Label>Address</Label>
                <Input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="123 Main St, City"
                  required
                  data-testid="input-join-address"
                />
              </div>
            </div>
            
            <Button
              type="submit"
              className="w-full"
              disabled={submitting}
              data-testid="button-join-submit"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating Account...
                </>
              ) : (
                'Create My Node Host Account'
              )}
            </Button>
            
            <p className="text-xs text-center text-muted-foreground">
              By signing up, you agree to our Terms of Service and Privacy Policy
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
