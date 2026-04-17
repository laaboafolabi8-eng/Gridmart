import { create } from 'zustand';
import { authApi } from './api';
import type { User } from '@shared/schema';

export type UserType = 'admin' | 'buyer' | 'node' | null;

const ACTIVE_ROLE_KEY = 'gridmart_active_role';

interface AuthState {
  user: User | null;
  activeRole: UserType;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  checkSession: () => Promise<void>;
  switchRole: (role: UserType) => void;
  getAvailableRoles: () => UserType[];
}

function getStoredActiveRole(): UserType {
  try {
    const stored = localStorage.getItem(ACTIVE_ROLE_KEY);
    if (stored === 'admin' || stored === 'buyer' || stored === 'node') {
      return stored;
    }
  } catch {}
  return null;
}

function storeActiveRole(role: UserType) {
  try {
    if (role) {
      localStorage.setItem(ACTIVE_ROLE_KEY, role);
    } else {
      localStorage.removeItem(ACTIVE_ROLE_KEY);
    }
  } catch {}
}

export const useAuth = create<AuthState>()((set, get) => ({
  user: null,
  activeRole: null,
  isAuthenticated: false,
  isLoading: true,
  
  login: async (email: string, password: string) => {
    try {
      const result = await authApi.login(email, password);
      const user = result.user;
      const activeRole = user.type as UserType;
      storeActiveRole(activeRole);
      set({ user, isAuthenticated: true, activeRole });
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Login failed' 
      };
    }
  },
  
  logout: async () => {
    try {
      await authApi.logout();
      storeActiveRole(null);
      set({ user: null, isAuthenticated: false, activeRole: null });
    } catch (error) {
      console.error('Logout failed:', error);
      storeActiveRole(null);
      set({ user: null, isAuthenticated: false, activeRole: null });
    }
  },
  
  checkSession: async () => {
    try {
      const session = await authApi.getSession();
      if (session?.user) {
        const user = session.user;
        const storedRole = getStoredActiveRole();
        const availableRoles = getAvailableRolesForUser(user);
        let activeRole: UserType;

        if (storedRole && availableRoles.includes(storedRole)) {
          activeRole = storedRole;
        } else {
          activeRole = (user.type as UserType);
          storeActiveRole(activeRole);
        }

        set({ user, isAuthenticated: true, isLoading: false, activeRole });
      } else {
        storeActiveRole(null);
        set({ user: null, isAuthenticated: false, isLoading: false, activeRole: null });
      }
    } catch (error) {
      set({ user: null, isAuthenticated: false, isLoading: false, activeRole: null });
    }
  },
  
  switchRole: (role: UserType) => {
    const availableRoles = get().getAvailableRoles();
    if (role && availableRoles.includes(role)) {
      storeActiveRole(role);
      set({ activeRole: role });
    }
  },
  
  getAvailableRoles: () => {
    const user = get().user;
    return getAvailableRolesForUser(user);
  },
}));

function getAvailableRolesForUser(user: User | null): UserType[] {
  if (!user) return [];
  
  const rolesSet = new Set<UserType>();
  // Add primary type
  if (user.type) {
    rolesSet.add(user.type as UserType);
  }
  // Add additional roles from DB
  if (user.roles && Array.isArray(user.roles)) {
    user.roles.forEach((role: string) => {
      if (role === 'admin' || role === 'buyer' || role === 'node') {
        rolesSet.add(role as UserType);
      }
    });
  }
  // For node users without explicit roles array, default to also having buyer role
  if (user.type === 'node' && !rolesSet.has('buyer')) {
    rolesSet.add('buyer');
  }
  // Admins can access all views (node and buyer) for testing/management purposes
  if (user.type === 'admin') {
    rolesSet.add('node');
    rolesSet.add('buyer');
  }
  return Array.from(rolesSet);
}
