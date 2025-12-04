import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authApi, type LoginCredentials } from "@/lib/auth";
import { useToast } from "./use-toast";
import { useLocation } from "wouter";
import type { User } from "@shared/schema";

export function useAuth() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: user, isLoading, error } = useQuery<User>({
    queryKey: ['/api/auth/me'],
    queryFn: async () => {
      try {
        const response = await fetch('/api/auth/me', { credentials: 'include' });
        if (response.status === 401) {
          return null;
        }
        if (!response.ok) {
          throw new Error(`${response.status}: ${response.statusText}`);
        }
        return await response.json();
      } catch (error) {
        return null;
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    refetchOnReconnect: false,
    refetchInterval: false,
  });

  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: (data) => {
      queryClient.setQueryData(['/api/auth/me'], data.user);
      toast({
        title: "Success",
        description: "Logged in successfully",
      });
      // Redirect to home page after successful login
      setLocation('/');
    },
    onError: (error: Error) => {
      toast({
        title: "Login Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      queryClient.setQueryData(['/api/auth/me'], null);
      queryClient.clear();
      toast({
        title: "Success",
        description: "Logged out successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Logout Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login: loginMutation.mutate,
    logout: logoutMutation.mutate,
    isLoggingIn: loginMutation.isPending,
    isLoggingOut: logoutMutation.isPending,
  };
}
