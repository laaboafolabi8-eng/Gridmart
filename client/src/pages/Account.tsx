import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/lib/auth';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { User, Lock, Bell, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export default function Account() {
  const { user, isAuthenticated, isLoading, checkSession, logout } = useAuth();
  const [, navigate] = useLocation();
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [pendingPhone, setPendingPhone] = useState('');
  const [emailOptIn, setEmailOptIn] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  
  const [isPhoneChangeDialogOpen, setIsPhoneChangeDialogOpen] = useState(false);
  const [phoneChangePassword, setPhoneChangePassword] = useState('');
  const [isConfirmingPhoneChange, setIsConfirmingPhoneChange] = useState(false);
  
  const [isDeleting, setIsDeleting] = useState(false);
  
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/login');
    }
  }, [isLoading, isAuthenticated, navigate]);
  
  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setEmail(user.email || '');
      setPhone(user.phone || '');
      setEmailOptIn((user as any).emailOptIn !== false);
    }
  }, [user]);
  
  const normalizePhone = (phone: string): string => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    return phone;
  };
  
  const handleSaveProfile = async () => {
    const currentNormalized = normalizePhone(user?.phone || '');
    const newNormalized = normalizePhone(phone);
    
    // Only show phone change warning for users who signed up with phone (not Google OAuth)
    // Phone signup users have email like "5195628558@phone.gridmart.ca"
    const isPhoneSignupUser = user?.email?.endsWith('@phone.gridmart.ca');
    
    if (isPhoneSignupUser && currentNormalized !== newNormalized && phone.replace(/\D/g, '').length >= 10) {
      setPendingPhone(phone);
      setPhoneChangePassword('');
      setIsPhoneChangeDialogOpen(true);
      return;
    }
    
    await saveProfile(phone);
  };
  
  const saveProfile = async (phoneToSave: string) => {
    setIsSavingProfile(true);
    try {
      const response = await fetch('/api/auth/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone: phoneToSave, smsOptIn: true, emailOptIn }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update profile');
      }
      
      await checkSession();
      toast.success('Profile updated successfully');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSavingProfile(false);
    }
  };
  
  const handleConfirmPhoneChange = async () => {
    if (!phoneChangePassword) {
      toast.error('Please enter your password');
      return;
    }
    
    setIsConfirmingPhoneChange(true);
    try {
      const response = await fetch('/api/auth/confirm-phone-change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          password: phoneChangePassword, 
          newPhone: pendingPhone,
          name,
          email,
          emailOptIn,
        }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update phone number');
      }
      
      setPhone(pendingPhone);
      setIsPhoneChangeDialogOpen(false);
      setPhoneChangePassword('');
      await checkSession();
      toast.success('Phone number updated successfully');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsConfirmingPhoneChange(false);
    }
  };
  
  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    
    setIsChangingPassword(true);
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to change password');
      }
      
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password changed successfully');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsChangingPassword(false);
    }
  };
  
  const handleSaveAddress = async () => {
    if (!addressForm.label || !addressForm.name || !addressForm.street || !addressForm.city || !addressForm.province || !addressForm.postalCode) {
      toast.error('Please fill in all required fields');
      return;
    }
    
    setIsSavingAddress(true);
    try {
      const url = editingAddress ? `/api/user/addresses/${editingAddress.id}` : '/api/user/addresses';
      const method = editingAddress ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addressForm),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save address');
      }
      
      await fetchAddresses();
      setIsAddressDialogOpen(false);
      setEditingAddress(null);
      resetAddressForm();
      toast.success(editingAddress ? 'Address updated' : 'Address added');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSavingAddress(false);
    }
  };
  
  const handleDeleteAddress = async (addressId: string) => {
    try {
      const response = await fetch(`/api/user/addresses/${addressId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete address');
      }
      
      await fetchAddresses();
      toast.success('Address deleted');
    } catch (error: any) {
      toast.error(error.message);
    }
  };
  
  const handleSetDefaultAddress = async (addressId: string) => {
    try {
      const response = await fetch(`/api/user/addresses/${addressId}/default`, {
        method: 'PUT',
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to set default address');
      }
      
      await fetchAddresses();
      toast.success('Default address updated');
    } catch (error: any) {
      toast.error(error.message);
    }
  };
  
  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch('/api/auth/delete-account', {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete account');
      }
      
      await logout();
      navigate('/');
      toast.success('Account deleted successfully');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsDeleting(false);
    }
  };
  
  const resetAddressForm = () => {
    setAddressForm({
      label: '',
      name: '',
      phone: '',
      street: '',
      city: '',
      province: '',
      postalCode: '',
      isDefault: false,
    });
  };
  
  const openAddAddress = () => {
    resetAddressForm();
    setEditingAddress(null);
    setIsAddressDialogOpen(true);
  };
  
  const openEditAddress = (address: UserAddress) => {
    setAddressForm({
      label: address.label,
      name: address.name,
      phone: address.phone || '',
      street: address.street,
      city: address.city,
      province: address.province,
      postalCode: address.postalCode,
      isDefault: address.isDefault || false,
    });
    setEditingAddress(address);
    setIsAddressDialogOpen(true);
  };
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }
  
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <h1 className="text-3xl font-bold mb-8">Account Settings</h1>
        
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Profile Information
              </CardTitle>
              <CardDescription>Update your personal details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    data-testid="input-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    data-testid="input-email"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(XXX) XXX-XXXX"
                    data-testid="input-phone"
                  />
                </div>
              </div>
              <Button onClick={handleSaveProfile} disabled={isSavingProfile} data-testid="button-save-profile">
                {isSavingProfile ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Save Changes
              </Button>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="w-5 h-5" />
                Change Password
              </CardTitle>
              <CardDescription>Update your password</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="current-password">Current Password</Label>
                  <Input
                    id="current-password"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="••••••••"
                    data-testid="input-current-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    data-testid="input-new-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm Password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    data-testid="input-confirm-password"
                  />
                </div>
              </div>
              <Button onClick={handleChangePassword} disabled={isChangingPassword || !currentPassword || !newPassword} data-testid="button-change-password">
                {isChangingPassword ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Change Password
              </Button>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5" />
                Communication Preferences
              </CardTitle>
              <CardDescription>Manage how we contact you</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>SMS Notifications</Label>
                  <p className="text-sm text-muted-foreground">Order updates are always sent via text message to your phone number</p>
                </div>
                <span className="text-sm text-muted-foreground">Always on</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Email Notifications</Label>
                  <p className="text-sm text-muted-foreground">Receive order updates and promotions via email</p>
                </div>
                <Switch
                  checked={emailOptIn}
                  onCheckedChange={setEmailOptIn}
                  data-testid="switch-email-opt-in"
                />
              </div>
              <Button onClick={handleSaveProfile} disabled={isSavingProfile} variant="outline" data-testid="button-save-preferences">
                {isSavingProfile ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Save Preferences
              </Button>
            </CardContent>
          </Card>
          
          <Dialog open={isPhoneChangeDialogOpen} onOpenChange={setIsPhoneChangeDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  Confirm Phone Number Change
                </DialogTitle>
                <DialogDescription>
                  Your phone number is used to sign in to your account. Changing it will update your sign-in number.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4 space-y-4">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-amber-800">
                    After this change, you will need to use <strong>{pendingPhone}</strong> to sign in to your account.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone-change-password">Enter your password to confirm</Label>
                  <Input
                    id="phone-change-password"
                    type="password"
                    value={phoneChangePassword}
                    onChange={(e) => setPhoneChangePassword(e.target.value)}
                    placeholder="Your password"
                    data-testid="input-phone-change-password"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsPhoneChangeDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleConfirmPhoneChange} disabled={isConfirmingPhoneChange || !phoneChangePassword} data-testid="button-confirm-phone-change">
                  {isConfirmingPhoneChange ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Confirm Change
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          
          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="w-5 h-5" />
                Delete Account
              </CardTitle>
              <CardDescription>Permanently delete your account and all associated data</CardDescription>
            </CardHeader>
            <CardContent>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" data-testid="button-delete-account">
                    Delete My Account
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete your account and remove all your data from our servers, including your order history and saved addresses.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteAccount}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      disabled={isDeleting}
                    >
                      {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Yes, delete my account
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
