import { Link, useLocation } from 'wouter';
import { ShoppingCart, MapPin, User, LogOut, Shield, Bell, Heart, Eye, ChevronDown, Settings, ShoppingBag, Phone, Instagram, Facebook, Linkedin, AtSign, Check, Home as HomeIcon } from 'lucide-react';
import logoIcon from '@/assets/gridmart-logo-icon.png';
import logoText from '@/assets/gridmart-logo-text.png';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useState, useEffect, useMemo } from 'react';
import { useCart, useServingCities } from '@/lib/store';
import { useAuth } from '@/lib/auth';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

const roleLabels = {
  buyer: 'Shopper',
  node: 'Node Host',
  admin: 'Admin',
};

export function Header() {
  const [location, navigate] = useLocation();
  const { cartCount } = useCart();
  const { user, isAuthenticated, logout, activeRole, switchRole, getAvailableRoles } = useAuth();
  const { selectedCity, cities, setCities, setSelectedCityId } = useServingCities();
  
  const availableRoles = getAvailableRoles();
  const hasMultipleRoles = availableRoles.length > 1;

  useEffect(() => {
    fetch('/api/serving-cities')
      .then(res => res.json())
      .then(data => { if (Array.isArray(data) && data.length > 0) setCities(data); })
      .catch(() => {});
  }, []);
  
  // Get seen notification/message IDs from localStorage (persists across sessions)
  const getSeenIds = (type: 'notifications' | 'messages', role: string): Set<string> => {
    const key = `gridmart_seen_${type}_${user?.id || 'guest'}_${role}`;
    try {
      const stored = localStorage.getItem(key);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  };
  
  const saveSeenIds = (type: 'notifications' | 'messages', role: string, ids: Set<string>) => {
    const key = `gridmart_seen_${type}_${user?.id || 'guest'}_${role}`;
    localStorage.setItem(key, JSON.stringify(Array.from(ids)));
  };
  
  // Notifications - returns empty array (no sample data for production)
  const getRoleNotifications = (_role: string) => {
    return [] as { id: string; title: string; message: string; time: string; link: string; read: boolean }[];
  };
  
  const [notifications, setNotifications] = useState(() => getRoleNotifications(activeRole || 'buyer'));
  
  // Update notifications when role or user changes
  useEffect(() => {
    setNotifications(getRoleNotifications(activeRole || 'buyer'));
  }, [activeRole, user?.id]);
  
  const unreadNotifications = notifications.filter(n => !n.read).length;

  const markNotificationRead = (id: string) => {
    const seenIds = getSeenIds('notifications', activeRole || 'buyer');
    seenIds.add(id);
    saveSeenIds('notifications', activeRole || 'buyer', seenIds);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllNotificationsRead = () => {
    const seenIds = getSeenIds('notifications', activeRole || 'buyer');
    notifications.forEach(n => seenIds.add(n.id));
    saveSeenIds('notifications', activeRole || 'buyer', seenIds);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const navLinks: { href: string; label: string }[] = [];

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 font-sans [&_h1]:font-sans [&_h2]:font-sans [&_h3]:font-sans [&_h4]:font-sans [&_h5]:font-sans [&_h6]:font-sans">
      <div className="container mx-auto px-4">
        <div className="flex h-20 items-end lg:items-center justify-between pb-1 lg:pb-0 relative">
          <div className="flex items-center mb-3 lg:mb-0">
            <Link href="/" data-testid="link-home">
              <div className="flex items-end gap-2 cursor-pointer">
                <img src={logoIcon} alt="GridMart" className="w-12 h-12 object-contain" />
                <img src={logoText} alt="GridMart" className="h-7 object-contain hidden sm:block mb-0.5" />
              </div>
            </Link>
          </div>

          <div className="lg:hidden absolute left-1/2 -translate-x-1/2 flex items-center">
            <Badge className="bg-transparent text-primary border-0 text-[11px] px-0.5 py-0" data-testid="badge-serving-city-mobile">
              <MapPin className="w-2.5 h-2.5 mr-0.5" />
              Serving Windsor, Ontario
            </Badge>
          </div>

          <nav className="hidden lg:flex items-center gap-6 absolute left-1/2 -translate-x-1/2">
            {navLinks.map(link => (
              <Link key={link.href} href={link.href}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-sm font-semibold"
                  data-testid={`nav-${link.label.toLowerCase().replace(' ', '-')}`}
                >
                  {link.label}
                </Button>
              </Link>
            ))}
            <div className="flex items-center">
              <Badge className="bg-transparent text-primary border-0 text-[14px] px-1 py-0" data-testid="badge-serving-city">
                <MapPin className="w-3.5 h-3.5 mr-0.5" />
                Serving Windsor, Ontario
              </Badge>
            </div>
            <span className="text-muted-foreground/30">|</span>
            <Link href="/apply">
              <Button size="sm" className="h-8 px-4 text-[15px] gap-1.5 text-white hover:opacity-90" style={{ backgroundColor: '#fda612', borderColor: '#fda612', borderWidth: '2px' }} data-testid="button-become-node">
                <HomeIcon className="w-4 h-4" />
                Become a Node Host
              </Button>
            </Link>
            <span className="text-muted-foreground/30">|</span>
            {!isAuthenticated ? (
              <Link href="/login">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-primary min-w-[157px] justify-center h-9 text-[14px] px-3 border-0"
                  data-testid="nav-sign-in"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  <Phone className="w-4 h-4" />
                  <span>Sign In</span>
                </Button>
              </Link>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-primary min-w-[157px] justify-center h-9 text-[14px] px-3 border-0"
                    data-testid="nav-signed-in"
                  >
                    <User className="w-4 h-4" />
                    <span>Signed In</span>
                    <ChevronDown className="w-2.5 h-2.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="w-56">
                  <DropdownMenuLabel>
                    <div className="flex flex-col">
                      <span>{user?.name || 'Account'}</span>
                      {user?.email && (
                        <span className="text-xs text-muted-foreground font-normal">{user?.email}</span>
                      )}
                      {activeRole && (
                        <Badge variant="secondary" className="w-fit mt-1 text-xs">
                          {roleLabels[activeRole] || activeRole}
                        </Badge>
                      )}
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/account" className="w-full cursor-pointer">
                      <Settings className="w-4 h-4 mr-2" />
                      Account Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/orders" className="w-full cursor-pointer">
                      <ShoppingBag className="w-4 h-4 mr-2" />
                      My Orders
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/wishlist" className="w-full cursor-pointer">
                      <Heart className="w-4 h-4 mr-2" />
                      My Wishlist
                    </Link>
                  </DropdownMenuItem>
                  {activeRole === 'node' && (
                    <DropdownMenuItem asChild>
                      <Link href="/node-dashboard" className="w-full cursor-pointer">
                        <MapPin className="w-4 h-4 mr-2" />
                        Host Dashboard
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {activeRole === 'admin' && (
                    <DropdownMenuItem asChild>
                      <Link href="/admin" className="w-full cursor-pointer">
                        <Shield className="w-4 h-4 mr-2" />
                        Admin Dashboard
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {hasMultipleRoles && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-xs text-muted-foreground">View as</DropdownMenuLabel>
                      <DropdownMenuItem 
                        onClick={() => {
                          switchRole('buyer');
                          navigate('/');
                        }}
                        className="cursor-pointer"
                      >
                        <ShoppingBag className="w-4 h-4 mr-2" />
                        Shopper
                        {activeRole === 'buyer' && <Check className="w-4 h-4 ml-auto text-green-600" />}
                      </DropdownMenuItem>
                      {availableRoles.includes('node') && (
                        <DropdownMenuItem 
                          onClick={() => {
                            switchRole('node');
                            navigate('/node-dashboard');
                          }}
                          className="cursor-pointer"
                        >
                          <MapPin className="w-4 h-4 mr-2" />
                          Host
                          {activeRole === 'node' && <Check className="w-4 h-4 ml-auto text-green-600" />}
                        </DropdownMenuItem>
                      )}
                      {availableRoles.includes('admin') && (
                        <DropdownMenuItem 
                          onClick={() => {
                            switchRole('admin');
                            navigate('/admin');
                          }}
                          className="cursor-pointer"
                        >
                          <Shield className="w-4 h-4 mr-2" />
                          Admin
                          {activeRole === 'admin' && <Check className="w-4 h-4 ml-auto text-green-600" />}
                        </DropdownMenuItem>
                      )}
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive">
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </nav>
          

          <div className="flex items-center gap-0 lg:gap-2 lg:static absolute top-2 right-0 lg:top-auto lg:right-auto">
            {/* Notifications Bell */}
            {isAuthenticated && (
              <Popover onOpenChange={(open) => open && markAllNotificationsRead()}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative" data-testid="button-notifications">
                    <Bell className="w-6 h-6" />
                    {unreadNotifications > 0 && (
                      <Badge 
                        className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs bg-destructive text-destructive-foreground"
                        data-testid="badge-notifications-count"
                      >
                        {unreadNotifications}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80" align="end">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between pb-2 border-b">
                      <h4 className="font-semibold">Notifications</h4>
                      {unreadNotifications > 0 && (
                        <Badge variant="secondary">{unreadNotifications} new</Badge>
                      )}
                    </div>
                    {notifications.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">No notifications</p>
                    ) : (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {notifications.map(notif => (
                          <div 
                            key={notif.id} 
                            className="p-3 rounded-lg hover:bg-muted cursor-pointer transition-colors"
                            onClick={() => {
                              markNotificationRead(notif.id);
                              if (notif.link) navigate(notif.link);
                            }}
                            data-testid={`notification-item-${notif.id}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm">{notif.title}</p>
                                <p className="text-xs text-muted-foreground line-clamp-2">{notif.message}</p>
                              </div>
                              <span className="text-xs text-muted-foreground whitespace-nowrap">{notif.time}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            )}

            <Link href="/cart">
              <Button variant="ghost" size="lg" className="relative p-2" data-testid="button-cart">
                <ShoppingCart className="w-8 h-8" />
                {cartCount > 0 && (
                  <Badge 
                    className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs bg-accent text-accent-foreground"
                    data-testid="badge-cart-count"
                  >
                    {cartCount}
                  </Badge>
                )}
              </Button>
            </Link>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" data-testid="button-social-media">
                  <AtSign className="w-6 h-6" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Follow Us</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <a 
                    href="https://www.instagram.com/grid.mart/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="w-full cursor-pointer flex items-center"
                  >
                    <Instagram className="w-4 h-4 mr-2" />
                    Instagram
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a 
                    href="https://www.facebook.com/profile.php?id=61586144236175" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="w-full cursor-pointer flex items-center"
                  >
                    <Facebook className="w-4 h-4 mr-2" />
                    Facebook
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a 
                    href="https://www.linkedin.com/company/gridmart/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="w-full cursor-pointer flex items-center"
                  >
                    <Linkedin className="w-4 h-4 mr-2" />
                    LinkedIn
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Mobile sign in / signed in - right side under socials */}
            <div className="lg:hidden">
              {!isAuthenticated ? (
                <Link href="/login">
                  <Button
                    variant="ghost"
                    size="icon"
                    data-testid="nav-sign-in-mobile"
                  >
                    <User className="w-6 h-6" />
                  </Button>
                </Link>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" data-testid="nav-signed-in-mobile">
                      <User className="w-6 h-6 text-primary" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel>
                      <div className="flex flex-col">
                        <span className="text-sm">{user?.name || 'Account'}</span>
                        {activeRole && (
                          <Badge variant="secondary" className="w-fit mt-1 text-xs">
                            {roleLabels[activeRole] || activeRole}
                          </Badge>
                        )}
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/account" className="w-full cursor-pointer">
                        <Settings className="w-4 h-4 mr-2" />
                        Account Settings
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/orders" className="w-full cursor-pointer">
                        <ShoppingBag className="w-4 h-4 mr-2" />
                        My Orders
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/wishlist" className="w-full cursor-pointer">
                        <Heart className="w-4 h-4 mr-2" />
                        My Wishlist
                      </Link>
                    </DropdownMenuItem>
                    {activeRole === 'node' && (
                      <DropdownMenuItem asChild>
                        <Link href="/node-dashboard" className="w-full cursor-pointer">
                          <MapPin className="w-4 h-4 mr-2" />
                          Host Dashboard
                        </Link>
                      </DropdownMenuItem>
                    )}
                    {activeRole === 'admin' && (
                      <DropdownMenuItem asChild>
                        <Link href="/admin" className="w-full cursor-pointer">
                          <Shield className="w-4 h-4 mr-2" />
                          Admin Dashboard
                        </Link>
                      </DropdownMenuItem>
                    )}
                    {hasMultipleRoles && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-xs text-muted-foreground">View as</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => { switchRole('buyer'); navigate('/'); }} className="cursor-pointer">
                          <ShoppingBag className="w-4 h-4 mr-2" />
                          Shopper
                          {activeRole === 'buyer' && <Check className="w-4 h-4 ml-auto text-green-600" />}
                        </DropdownMenuItem>
                        {availableRoles.includes('node') && (
                          <DropdownMenuItem onClick={() => { switchRole('node'); navigate('/node-dashboard'); }} className="cursor-pointer">
                            <MapPin className="w-4 h-4 mr-2" />
                            Host
                            {activeRole === 'node' && <Check className="w-4 h-4 ml-auto text-green-600" />}
                          </DropdownMenuItem>
                        )}
                        {availableRoles.includes('admin') && (
                          <DropdownMenuItem onClick={() => { switchRole('admin'); navigate('/admin'); }} className="cursor-pointer">
                            <Shield className="w-4 h-4 mr-2" />
                            Admin
                            {activeRole === 'admin' && <Check className="w-4 h-4 ml-auto text-green-600" />}
                          </DropdownMenuItem>
                        )}
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive">
                      <LogOut className="w-4 h-4 mr-2" />
                      Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

          </div>
        </div>

      </div>
    </header>
  );
}
