import { Link, useLocation } from 'wouter';
import { ShoppingCart, MapPin, User, LogOut, Shield, Bell, Heart, ChevronDown, Settings, ShoppingBag, Phone, Instagram, Facebook, Linkedin, AtSign, Check, Tag, Info, PackageSearch, Mail, Menu, X } from 'lucide-react';
import logoIcon from '@/assets/gridmart-logo-icon.png';
import logoText from '@/assets/gridmart-logo-text.png';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useState, useEffect } from 'react';
import { useCart, useServingCities } from '@/lib/store';
import { useAuth } from '@/lib/auth';
import { useQuery } from '@tanstack/react-query';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
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
  const { setCities } = useServingCities();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const availableRoles = getAvailableRoles();
  const hasMultipleRoles = availableRoles.length > 1;

  useEffect(() => {
    async function loadCities() {
      try {
        const res = await fetch('/api/serving-cities');
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) setCities(data);
      } catch {
        // non-critical — header works without city data
      }
    }
    loadCities();
  }, []);

  // Close mobile menu on route change
  useEffect(() => { setMobileMenuOpen(false); }, [location]);

  const { data: categoriesFromApi = [] } = useQuery<{ id: string; name: string; parentId?: string | null }[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await fetch('/api/categories');
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 300000,
  });

  const topLevelCategories = categoriesFromApi.filter(c => !c.parentId);

  // Notifications (empty in production — kept for future use)
  const [notifications] = useState<{ id: string; title: string; message: string; time: string; link: string; read: boolean }[]>([]);
  const unreadNotifications = notifications.filter(n => !n.read).length;

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  // Shared user menu items used in both desktop and mobile dropdowns
  const UserMenuItems = () => (
    <>
      <DropdownMenuLabel>
        <div className="flex flex-col">
          <span>{user?.name || 'Account'}</span>
          {user?.email && <span className="text-xs text-muted-foreground font-normal">{user.email}</span>}
          {activeRole && <Badge variant="secondary" className="w-fit mt-1 text-xs">{roleLabels[activeRole] || activeRole}</Badge>}
        </div>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild>
        <Link href="/account" className="w-full cursor-pointer"><Settings className="w-4 h-4 mr-2" />Account Settings</Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <Link href="/orders" className="w-full cursor-pointer"><ShoppingBag className="w-4 h-4 mr-2" />My Orders</Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <Link href="/wishlist" className="w-full cursor-pointer"><Heart className="w-4 h-4 mr-2" />My Wishlist</Link>
      </DropdownMenuItem>
      {activeRole === 'admin' && (
        <DropdownMenuItem asChild>
          <Link href="/admin" className="w-full cursor-pointer"><Shield className="w-4 h-4 mr-2" />Admin Dashboard</Link>
        </DropdownMenuItem>
      )}
      {hasMultipleRoles && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">View as</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => { switchRole('buyer'); navigate('/'); }} className="cursor-pointer">
            <ShoppingBag className="w-4 h-4 mr-2" />Shopper
            {activeRole === 'buyer' && <Check className="w-4 h-4 ml-auto text-green-600" />}
          </DropdownMenuItem>
          {availableRoles.includes('admin') && (
            <DropdownMenuItem onClick={() => { switchRole('admin'); navigate('/admin'); }} className="cursor-pointer">
              <Shield className="w-4 h-4 mr-2" />Admin
              {activeRole === 'admin' && <Check className="w-4 h-4 ml-auto text-green-600" />}
            </DropdownMenuItem>
          )}
        </>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive">
        <LogOut className="w-4 h-4 mr-2" />Sign Out
      </DropdownMenuItem>
    </>
  );

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 font-sans">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center justify-between">

            {/* Logo */}
            <Link href="/" data-testid="link-home">
              <div className="flex items-end gap-2 cursor-pointer">
                <img src={logoIcon} alt="GridMart" className="w-10 h-10 object-contain" width="40" height="40" />
                <img src={logoText} alt="" aria-hidden="true" className="h-6 object-contain hidden sm:block mb-0.5" width="98" height="24" />
              </div>
            </Link>

            {/* Desktop centre nav */}
            <nav className="hidden lg:flex items-center gap-1">

              {/* Categories dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1.5 text-[14px] font-medium" data-testid="nav-categories">
                    <Tag className="w-4 h-4" />
                    Categories
                    <ChevronDown className="w-3 h-3 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="w-52">
                  <DropdownMenuItem asChild>
                    <Link href="/" className="w-full cursor-pointer font-medium">All Products</Link>
                  </DropdownMenuItem>
                  {topLevelCategories.length > 0 && <DropdownMenuSeparator />}
                  {topLevelCategories.map(cat => (
                    <DropdownMenuItem key={cat.id} asChild>
                      <Link href={`/?category=${encodeURIComponent(cat.name)}`} className="w-full cursor-pointer">
                        {cat.name}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <span className="text-muted-foreground/30 select-none mx-1">|</span>

              {/* Info dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1.5 text-[14px] font-medium" data-testid="nav-info">
                    <Info className="w-4 h-4" />
                    Info
                    <ChevronDown className="w-3 h-3 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="w-48">
                  <DropdownMenuItem asChild>
                    <Link href="/about" className="w-full cursor-pointer">
                      <Shield className="w-4 h-4 mr-2 opacity-60" />About Us
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/contact" className="w-full cursor-pointer">
                      <Mail className="w-4 h-4 mr-2 opacity-60" />Contact Us
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/track-order" className="w-full cursor-pointer">
                      <PackageSearch className="w-4 h-4 mr-2 opacity-60" />Track Your Order
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <span className="text-muted-foreground/30 select-none mx-1">|</span>

              {/* Sign In / Account */}
              {!isAuthenticated ? (
                <Link href="/login">
                  <Button size="sm" variant="ghost" className="gap-1.5 text-[14px] font-medium" data-testid="nav-sign-in">
                    <User className="w-4 h-4" />
                    <span>Sign In</span>
                  </Button>
                </Link>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="ghost" className="gap-1.5 text-[14px] font-medium" data-testid="nav-signed-in">
                      <User className="w-4 h-4" />
                      <span>{user?.name?.split(' ')[0] || 'Account'}</span>
                      <ChevronDown className="w-3 h-3 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center" className="w-56">
                    <UserMenuItems />
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </nav>

            {/* Right-side icons (all screen sizes) */}
            <div className="flex items-center gap-0.5">

              {/* Notifications */}
              {isAuthenticated && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="relative" data-testid="button-notifications">
                      <Bell className="w-5 h-5" />
                      {unreadNotifications > 0 && (
                        <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs bg-destructive text-destructive-foreground">
                          {unreadNotifications}
                        </Badge>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80" align="end">
                    <div className="space-y-2">
                      <h4 className="font-semibold pb-2 border-b">Notifications</h4>
                      <p className="text-sm text-muted-foreground py-4 text-center">No notifications</p>
                    </div>
                  </PopoverContent>
                </Popover>
              )}

              {/* Cart */}
              <Link href="/cart" aria-label="Cart">
                <Button variant="ghost" size="icon" className="relative" data-testid="button-cart" aria-label="Cart">
                  <ShoppingCart className="w-5 h-5" />
                  {cartCount > 0 && (
                    <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs bg-accent text-accent-foreground" data-testid="badge-cart-count">
                      {cartCount}
                    </Badge>
                  )}
                </Button>
              </Link>

              {/* Social */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" data-testid="button-social-media" aria-label="Follow us on social media">
                    <AtSign className="w-5 h-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>Follow Us</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <a href="https://www.instagram.com/grid.mart/" target="_blank" rel="noopener noreferrer" className="w-full cursor-pointer flex items-center">
                      <Instagram className="w-4 h-4 mr-2" />Instagram
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a href="https://www.facebook.com/profile.php?id=61586144236175" target="_blank" rel="noopener noreferrer" className="w-full cursor-pointer flex items-center">
                      <Facebook className="w-4 h-4 mr-2" />Facebook
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a href="https://www.linkedin.com/company/gridmart/" target="_blank" rel="noopener noreferrer" className="w-full cursor-pointer flex items-center">
                      <Linkedin className="w-4 h-4 mr-2" />LinkedIn
                    </a>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Mobile: user icon */}
              <div className="lg:hidden">
                {!isAuthenticated ? (
                  <Link href="/login" aria-label="Sign in">
                    <Button variant="ghost" size="icon" data-testid="nav-sign-in-mobile" aria-label="Sign in">
                      <User className="w-5 h-5" />
                    </Button>
                  </Link>
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" data-testid="nav-signed-in-mobile">
                        <User className="w-5 h-5 text-primary" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <UserMenuItems />
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              {/* Mobile: hamburger */}
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setMobileMenuOpen(v => !v)}
                aria-label="Toggle navigation menu"
                data-testid="button-mobile-menu"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
            </div>

          </div>
        </div>
      </header>

      {/* Mobile nav panel */}
      {mobileMenuOpen && (
        <div className="lg:hidden sticky top-16 z-40 w-full bg-background border-b shadow-md">
          <nav className="container mx-auto px-4 py-3 space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-3 pt-1 pb-0.5">Shop</p>
            <Link href="/">
              <Button variant="ghost" size="sm" className="w-full justify-start gap-2 font-medium">
                All Products
              </Button>
            </Link>
            {topLevelCategories.map(cat => (
              <Link key={cat.id} href={`/?category=${encodeURIComponent(cat.name)}`}>
                <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground pl-5">
                  {cat.name}
                </Button>
              </Link>
            ))}

            <div className="border-t my-2" />
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-3 pt-1 pb-0.5">Info</p>
            <Link href="/about">
              <Button variant="ghost" size="sm" className="w-full justify-start gap-2 font-medium">
                <Shield className="w-4 h-4 opacity-60" />About Us
              </Button>
            </Link>
            <Link href="/contact">
              <Button variant="ghost" size="sm" className="w-full justify-start gap-2 font-medium">
                <Mail className="w-4 h-4 opacity-60" />Contact Us
              </Button>
            </Link>
            <Link href="/track-order">
              <Button variant="ghost" size="sm" className="w-full justify-start gap-2 font-medium">
                <PackageSearch className="w-4 h-4 opacity-60" />Track Your Order
              </Button>
            </Link>
          </nav>
        </div>
      )}
    </>
  );
}
