import { useState, useEffect } from 'react';
import { useLocation, Link } from 'wouter';
import { Shield, ArrowRight } from 'lucide-react';
import logoIcon from '@/assets/gridmart-logo-icon.png';
import logoText from '@/assets/gridmart-logo-text.png';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/auth';

export default function AdminLogin() {
  const [, navigate] = useLocation();
  const { login, user, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoading && user?.type === 'admin') {
      navigate('/admin');
    }
  }, [user, isLoading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    const result = await login(email, password);
    if (result.success) {
      const user = useAuth.getState().user;
      if (user?.type === 'admin') {
        navigate('/admin');
      } else {
        setError('Access denied. Admin credentials required.');
      }
    } else {
      setError(result.error || 'Login failed');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-200 via-slate-100 to-slate-200 p-4">
      <div className="w-full max-w-md animate-slide-up">
        <div className="text-center mb-8">
          <Link href="/">
            <div className="inline-flex items-center gap-2 mb-4">
              <img src={logoIcon} alt="GridMart" className="w-10 h-10 object-contain" />
              <img src={logoText} alt="GridMart" className="h-6 object-contain" />
            </div>
          </Link>
          <div className="flex items-center justify-center gap-2 text-slate-600">
            <Shield className="w-4 h-4" />
            <p>Administrator Access</p>
          </div>
        </div>

        <Card className="border-slate-300 bg-white shadow-lg">
          <CardHeader>
            <CardTitle className="text-slate-900">Admin Sign In</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <Label htmlFor="email" className="text-slate-700">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@gridmart.ca"
                  className="bg-white border-slate-300 text-slate-900"
                  data-testid="input-admin-email"
                />
              </div>
              <div>
                <Label htmlFor="password" className="text-slate-700">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-white border-slate-300 text-slate-900"
                  data-testid="input-admin-password"
                />
              </div>
              {error && (
                <p className="text-sm text-red-400" data-testid="text-admin-error">{error}</p>
              )}
              <Button type="submit" className="w-full gap-2" data-testid="button-admin-login">
                Sign In
                <ArrowRight className="w-4 h-4" />
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
