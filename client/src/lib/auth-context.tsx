'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from './api';
import { disconnectSocket } from './socket';

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  status: string;
  isEmailVerified: boolean;
}

interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: { displayName?: string; status?: string; avatarUrl?: string }) => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // Load session from storage and verify with backend
  useEffect(() => {
    const initAuth = async () => {
      try {
        const storedToken = localStorage.getItem('cengine_access_token');
        const storedUser = localStorage.getItem('cengine_user');

        if (storedToken && storedUser) {
          setAccessToken(storedToken);
          setUser(JSON.parse(storedUser));

          // Silently refresh profile to ensure freshness
          try {
            const res = await api.get('/users/me');
            if (res.data?.data) {
              setUser(res.data.data);
              localStorage.setItem('cengine_user', JSON.stringify(res.data.data));
            }
          } catch {
            // Session may still be valid or refresh interceptor will handle
          }
        }
      } catch (err) {
        console.error('Failed to restore auth session:', err);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password });
    const { token, accessToken: newAccessToken, user: userData } = res.data.data;
    const tokenToSave = newAccessToken || token;

    setAccessToken(tokenToSave);
    setUser(userData);
    localStorage.setItem('cengine_access_token', tokenToSave);
    localStorage.setItem('cengine_user', JSON.stringify(userData));
    router.push('/chat');
  };

  const register = async (email: string, password: string, displayName: string) => {
    const res = await api.post('/auth/register', { email, password, displayName });
    const { accessToken: newAccessToken, user: userData } = res.data.data;

    setAccessToken(newAccessToken);
    setUser(userData);
    localStorage.setItem('cengine_access_token', newAccessToken);
    localStorage.setItem('cengine_user', JSON.stringify(userData));
    router.push('/chat');
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Ignore
    } finally {
      setUser(null);
      setAccessToken(null);
      localStorage.removeItem('cengine_access_token');
      localStorage.removeItem('cengine_user');
      disconnectSocket();
      router.push('/login');
    }
  };

  const updateProfile = async (data: { displayName?: string; status?: string; avatarUrl?: string }) => {
    const res = await api.patch('/users/profile', data);
    const updated = res.data.data;
    setUser((prev) => (prev ? { ...prev, ...updated } : updated));
    localStorage.setItem('cengine_user', JSON.stringify(updated));
  };

  const deleteAccount = async () => {
    await api.delete('/auth/delete-account');
    setUser(null);
    setAccessToken(null);
    localStorage.removeItem('cengine_access_token');
    localStorage.removeItem('cengine_user');
    disconnectSocket();
    router.push('/login');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        updateProfile,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
