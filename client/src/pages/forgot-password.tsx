import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { z } from "zod";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Mail } from "lucide-react";
import { forgotPasswordSchema } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import avadoLogo from "@assets/AVADO-original_1754478882931.png";

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPassword() {
  const [isSuccess, setIsSuccess] = useState(false);

  const form = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  });

  const forgotPasswordMutation = useMutation({
    mutationFn: async (data: ForgotPasswordFormData) => {
      const response = await apiRequest('POST', '/api/auth/forgot-password', data);
      return await response.json();
    },
    onSuccess: () => {
      setIsSuccess(true);
    },
    onError: (error: Error) => {
      console.error('Forgot password error:', error);
    },
  });

  const onSubmit = (data: ForgotPasswordFormData) => {
    forgotPasswordMutation.mutate(data);
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div>
            <div className="flex justify-center">
              <img src={avadoLogo} alt="Avado" className="h-12" />
            </div>
            <h2 className="mt-6 text-center text-3xl font-bold text-gray-900">
              Check your email
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              We've sent a password reset link to your email address
            </p>
          </div>

          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
                  <Mail className="h-6 w-6 text-green-600" />
                </div>
                <p className="text-sm text-gray-600 mb-6">
                  If an account with that email exists, you will receive a password reset link shortly.
                  Please check your email and follow the instructions to reset your password.
                </p>
                <div className="space-y-4">
                  <p className="text-xs text-gray-500">
                    Didn't receive an email? Check your spam folder or try again.
                  </p>
                  <div className="flex flex-col space-y-2">
                    <Button
                      onClick={() => {
                        setIsSuccess(false);
                        form.reset();
                      }}
                      variant="outline"
                      className="w-full"
                    >
                      Try again
                    </Button>
                    <Link href="/login">
                      <Button variant="ghost" className="w-full">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to login
                      </Button>
                    </Link>
                  </div>
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
            Forgot your password?
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Enter your email address and we'll send you a link to reset your password
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-center">Reset Password</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email address</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="Enter your email address"
                          autoComplete="email"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {forgotPasswordMutation.isError && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      {forgotPasswordMutation.error instanceof Error 
                        ? forgotPasswordMutation.error.message 
                        : "Something went wrong. Please try again."}
                    </AlertDescription>
                  </Alert>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={forgotPasswordMutation.isPending}
                >
                  {forgotPasswordMutation.isPending ? "Sending..." : "Send reset link"}
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