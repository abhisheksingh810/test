import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { z } from "zod";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Eye, EyeOff, CheckCircle } from "lucide-react";
import { resetPasswordSchema } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import avadoLogo from "@assets/AVADO-original_1754478882931.png";

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

export default function ResetPassword() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [token, setToken] = useState<string>("");
  const [, setLocation] = useLocation();

  // Extract token from URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenParam = urlParams.get('token');
    if (tokenParam) {
      setToken(tokenParam);
    }
  }, []);

  const form = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      token: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  // Update form token when token state changes
  useEffect(() => {
    if (token) {
      form.setValue('token', token);
    }
  }, [token, form]);

  const resetPasswordMutation = useMutation({
    mutationFn: async (data: ResetPasswordFormData) => {
      const response = await apiRequest('POST', '/api/auth/reset-password', data);
      return await response.json();
    },
    onSuccess: () => {
      setIsSuccess(true);
      // Redirect to login after 3 seconds
      setTimeout(() => {
        setLocation('/login');
      }, 3000);
    },
    onError: (error: Error) => {
      console.error('Reset password error:', error);
    },
  });

  const onSubmit = (data: ResetPasswordFormData) => {
    resetPasswordMutation.mutate(data);
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div>
            <div className="flex justify-center">
              <img src={avadoLogo} alt="Avado" className="h-12" />
            </div>
            <h2 className="mt-6 text-center text-3xl font-bold text-gray-900">
              Invalid Reset Link
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              This password reset link is invalid or missing
            </p>
          </div>

          <Card>
            <CardContent className="pt-6">
              <div className="text-center space-y-4">
                <Alert variant="destructive">
                  <AlertDescription>
                    This password reset link is invalid or has expired. Please request a new one.
                  </AlertDescription>
                </Alert>
                <div className="flex flex-col space-y-2">
                  <Link href="/forgot-password">
                    <Button className="w-full">
                      Request new reset link
                    </Button>
                  </Link>
                  <Link href="/login">
                    <Button variant="ghost" className="w-full">
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Back to login
                    </Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div>
            <div className="flex justify-center">
              <img src={avadoLogo} alt="Avado" className="h-12" />
            </div>
            <h2 className="mt-6 text-center text-3xl font-bold text-gray-900">
              Password Reset Successful
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              Your password has been updated successfully
            </p>
          </div>

          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                </div>
                <p className="text-sm text-gray-600 mb-6">
                  Your password has been successfully reset. You can now sign in with your new password.
                </p>
                <div className="space-y-4">
                  <p className="text-xs text-gray-500">
                    You will be redirected to the login page in a few seconds.
                  </p>
                  <Link href="/login">
                    <Button className="w-full">
                      Continue to login
                    </Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <div className="flex justify-center">
            <img src={avadoLogo} alt="Avado" className="h-12" />
          </div>
          <h2 className="mt-6 text-center text-3xl font-bold text-gray-900">
            Reset your password
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Enter your new password below
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-center">New Password</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showPassword ? "text" : "password"}
                            placeholder="Enter your new password"
                            autoComplete="new-password"
                            {...field}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm New Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showConfirmPassword ? "text" : "password"}
                            placeholder="Confirm your new password"
                            autoComplete="new-password"
                            {...field}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          >
                            {showConfirmPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {resetPasswordMutation.isError && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      {resetPasswordMutation.error instanceof Error 
                        ? resetPasswordMutation.error.message 
                        : "Something went wrong. Please try again."}
                    </AlertDescription>
                  </Alert>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={resetPasswordMutation.isPending}
                >
                  {resetPasswordMutation.isPending ? "Resetting..." : "Reset password"}
                </Button>
              </form>
            </Form>

            <div className="mt-6 text-center">
              <Link href="/login">
                <Button variant="ghost" className="text-sm">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to login
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}