import { apiRequest } from "./queryClient";
import type { User } from "@shared/schema";

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  sessionToken: string;
}

export const authApi = {
  login: async (credentials: LoginCredentials): Promise<LoginResponse> => {
    const response = await apiRequest('POST', '/api/auth/login', credentials);
    return await response.json();
  },

  logout: async (): Promise<void> => {
    await apiRequest('POST', '/api/auth/logout');
  },

  getCurrentUser: async (): Promise<User> => {
    const response = await apiRequest('GET', '/api/auth/me');
    return await response.json();
  }
};

export const hasPermission = (userRole: string, requiredRole: string): boolean => {
  const hierarchy = {
    superadmin: 6,
    admin: 5,
    marker: 3,
    tutor: 3,
    iqa: 3,
    student: 1
  };
  
  return (hierarchy[userRole as keyof typeof hierarchy] || 0) >= 
         (hierarchy[requiredRole as keyof typeof hierarchy] || 0);
};

export const canAccessAdminFeatures = (userRole: string): boolean => {
  return hasPermission(userRole, 'admin');
};

export const canModifyUser = (currentUserRole: string, targetUserRole: string): boolean => {
  // Superadmins can modify anyone
  if (currentUserRole === 'superadmin') return true;
  
  // Admins cannot modify superadmins
  if (currentUserRole === 'admin' && targetUserRole === 'superadmin') return false;
  
  // Admins can modify others
  if (currentUserRole === 'admin') return true;
  
  return false;
};
