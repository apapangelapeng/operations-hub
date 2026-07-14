import { createContext, useContext } from "react";

import type { Persona, User } from "../types";

export type AuthContextValue = {
  user: User | null;
  personas: Persona[];
  loading: boolean;
  login: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
