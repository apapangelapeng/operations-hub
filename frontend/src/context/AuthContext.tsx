import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { ApiError, api } from "../lib/api";
import type { Persona, User } from "../types";
import { AuthContext, type AuthContextValue } from "./AuthState";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUser(await api<User>("/api/auth/me"));
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) {
        console.error(error);
      }
      setUser(null);
      const response = await api<{ users: Persona[] }>("/api/auth/personas");
      setPersonas(response.users);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const login = useCallback(async (email: string) => {
    const nextUser = await api<User>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    setUser(nextUser);
  }, []);

  const logout = useCallback(async () => {
    await api<void>("/api/auth/logout", { method: "POST" });
    setUser(null);
    const response = await api<{ users: Persona[] }>("/api/auth/personas");
    setPersonas(response.users);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      personas,
      loading,
      login,
      logout,
      hasPermission(permission: string) {
        return Boolean(
          user &&
            (user.permissions.includes("*") ||
              user.permissions.includes(permission)),
        );
      },
    }),
    [loading, login, logout, personas, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
