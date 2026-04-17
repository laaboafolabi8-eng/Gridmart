import { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, User, MapPin, Bell, CreditCard, Save, Lock, Mail, Loader2, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';

interface NodeData {
  id: string;
  name: string;
  address: string;
  city: string;
  pickupInstructions: string | null;
  availabilityNoticeHours: number | null;
  notificationPhone: string | null;
}

export default function NodeSettings() {
  const { user } = useAuth();
  const [node, setNode] = useState<NodeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    name: '',
    address: '',
    city: '',
    pickupInstructions: '',
    emailNotifications: true,
    availabilityNoticeHours: 48,
    notificationPhone: '',
  });
  
  useEffect(() => {
    const fetchNode = async () => {
      try {
        const res = await fetch('/api/nodes/my-node', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setNode(data);
          setSettings(prev => ({
            ...prev,
            name: data.name || '',
            address: data.address || '',
            city: data.city || '',
            pickupInstructions: data.pickupInstructions || '',
            availabilityNoticeHours: data.availabilityNoticeHours ?? 48,
            notificationPhone: data.notificationPhone || '',
          }));
        }
      } catch (error) {
        console.error('Failed to fetch node:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchNode();
  }, []);

  const handleSave = async () => {
    if (!node) return;
    
    setSaving(true);
    try {
      const res = await fetch(`/api/nodes/${node.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: settings.name,
          pickupInstructions: settings.pickupInstructions || null,
          availabilityNoticeHours: settings.availabilityNoticeHours,
          notificationPhone: settings.notificationPhone || null,
        }),
      });
      
      if (res.ok) {
        toast.success('Settings saved!');
      } else {
        toast.error('Failed to save settings');
      }
    } catch (error) {
      console.error('Failed to save:', error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-muted/30">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </main>
        <Footer />
      </div>
    );
  }

  if (!node) {
    return (
      <div className="min-h-screen flex flex-col bg-muted/30">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-muted-foreground">No node found for your account.</p>
            <Link href="/node-dashboard">
              <Button className="mt-4">Back to Dashboard</Button>
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      <Header />
      
      <main className="flex-1 py-8">
        <div className="container mx-auto px-4 max-w-2xl">
          <Link href="/node-dashboard">
            <Button variant="ghost" className="mb-6 gap-2" data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </Button>
          </Link>

          <h1 className="font-display text-3xl font-bold mb-8" data-testid="text-settings-title">
            Node Settings
          </h1>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="font-display flex items-center gap-2">
                  <User className="w-5 h-5" />
                  Profile Information
                </CardTitle>
                <CardDescription>
                  Update your Node's public information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="name">Node Name</Label>
                  <Input
                    id="name"
                    value={settings.name}
                    onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                    data-testid="input-node-name"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-display flex items-center gap-2">
                  <MapPin className="w-5 h-5" />
                  Location
                </CardTitle>
                <CardDescription>
                  Your node's pickup location (set during application)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert className="bg-muted/50 border-muted-foreground/20">
                  <Lock className="w-4 h-4" />
                  <AlertDescription>
                    Location is set during your application and can only be changed by GridMart admin for verification purposes.
                  </AlertDescription>
                </Alert>
                <div>
                  <Label htmlFor="address" className="text-muted-foreground">Street Address</Label>
                  <Input
                    id="address"
                    value={settings.address}
                    disabled
                    className="bg-muted/50 text-muted-foreground cursor-not-allowed"
                    data-testid="input-address"
                  />
                </div>
                <div>
                  <Label htmlFor="city" className="text-muted-foreground">City</Label>
                  <Input
                    id="city"
                    value={settings.city}
                    disabled
                    className="bg-muted/50 text-muted-foreground cursor-not-allowed"
                    data-testid="input-city"
                  />
                </div>
                <Button 
                  variant="outline" 
                  className="w-full gap-2"
                  onClick={() => toast.info('Address change request submitted! Admin will review your request.')}
                  data-testid="button-request-address-change"
                >
                  <Mail className="w-4 h-4" />
                  Request Address Change
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-display flex items-center gap-2">
                  <MapPin className="w-5 h-5" />
                  Pickup Instructions
                </CardTitle>
                <CardDescription>
                  These instructions will be sent to customers via SMS when their order is ready
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={settings.pickupInstructions}
                  onChange={(e) => setSettings({ ...settings, pickupInstructions: e.target.value })}
                  rows={4}
                  placeholder="E.g., Ring the doorbell. Orders are in the cooler on the porch."
                  data-testid="input-instructions"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Keep it brief - this will be included in the SMS notification to customers.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-display flex items-center gap-2">
                  <Bell className="w-5 h-5" />
                  Notifications
                </CardTitle>
                <CardDescription>
                  How you want to be notified about orders
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="notificationPhone" className="flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    SMS Notification Phone
                  </Label>
                  <Input
                    id="notificationPhone"
                    type="tel"
                    value={settings.notificationPhone}
                    onChange={(e) => setSettings({ ...settings, notificationPhone: e.target.value })}
                    placeholder="e.g., 519-555-1234"
                    className="mt-1"
                    data-testid="input-notification-phone"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Order updates (new orders, customer arrivals) will be sent to this number via SMS.
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Email Notifications</div>
                    <div className="text-sm text-muted-foreground">
                      Receive order updates via email
                    </div>
                  </div>
                  <Switch
                    checked={settings.emailNotifications}
                    onCheckedChange={(checked) => 
                      setSettings({ ...settings, emailNotifications: checked })
                    }
                    data-testid="switch-email"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-display flex items-center gap-2">
                  <CreditCard className="w-5 h-5" />
                  Payment Information
                </CardTitle>
                <CardDescription>
                  Where your handoff earnings will be deposited
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-muted/50 rounded-lg">
                  <div className="text-sm text-muted-foreground mb-1">Connected Account</div>
                  <div className="font-medium">Bank Account ending in •••• 4242</div>
                </div>
                <Button variant="outline" className="w-full">
                  Update Payment Method
                </Button>
              </CardContent>
            </Card>

            <Button 
              onClick={handleSave} 
              size="lg" 
              className="w-full gap-2" 
              disabled={saving}
              data-testid="button-save"
            >
              {saving ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Save className="w-5 h-5" />
              )}
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
