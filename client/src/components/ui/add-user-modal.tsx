import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { User, UserRole, UserStatus } from "@shared/schema";
import { adminEditUserSchema, createUserSchema } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./dialog";
import { Button } from "./button";
import { Input } from "./input";
import { Label } from "./label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";
import { Checkbox } from "./checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "./form";

// For creating new users
const createUserFormSchema = createUserSchema.extend({
  sendWelcomeEmail: z.boolean().default(true),
});

// For editing existing users
const editUserFormSchema = adminEditUserSchema;

type CreateUserFormData = z.infer<typeof createUserFormSchema>;
type EditUserFormData = z.infer<typeof editUserFormSchema>;

interface AddUserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingUser?: User | null;
}

export function AddUserModal({ open, onOpenChange, editingUser }: AddUserModalProps) {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isEditing = !!editingUser;
  
  // Use different forms for create vs edit
  const createForm = useForm<CreateUserFormData>({
    resolver: zodResolver(createUserFormSchema),
    defaultValues: {
      email: "",
      role: "student",
      sendWelcomeEmail: true,
    },
  });

  const editForm = useForm<EditUserFormData>({
    resolver: zodResolver(editUserFormSchema),
    defaultValues: {
      firstName: editingUser?.firstName || "",
      lastName: editingUser?.lastName || "",
      role: editingUser?.role || "student",
      status: editingUser?.status || "active",
    },
  });

  // Use the appropriate form based on mode
  const form = isEditing ? editForm : createForm;

  const createMutation = useMutation({
    mutationFn: async (data: CreateUserFormData | EditUserFormData) => {
      if (isEditing) {
        // For editing, only send the fields that can be updated
        const url = `/api/users/${editingUser.id}`;
        const response = await apiRequest('PUT', url, data);
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to update user');
        }
        return await response.json();
      } else {
        // For creating, exclude sendWelcomeEmail from the API request
        const { sendWelcomeEmail, ...userData } = data as CreateUserFormData;
        const response = await apiRequest('POST', '/api/users', userData);
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to create user');
        }
        return await response.json();
      }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      if (!isEditing && result.emailSent) {
        toast({
          title: "User Created Successfully",
          description: `User ${result.username} created and invitation email sent to ${result.email}`,
          duration: 8000,
        });
      } else if (!isEditing) {
        toast({
          title: "User Created",
          description: `User ${result.username} created. Note: Invitation email could not be sent - please configure SMTP settings.`,
          duration: 8000,
        });
      } else {
        toast({
          title: "Success",
          description: "User updated successfully",
        });
      }
      onOpenChange(false);
      
      // Reset the appropriate form
      if (isEditing) {
        editForm.reset();
      } else {
        createForm.reset();
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CreateUserFormData | EditUserFormData) => {
    createMutation.mutate(data);
  };

  const handleClose = () => {
    onOpenChange(false);
    if (isEditing) {
      editForm.reset();
    } else {
      createForm.reset();
    }
  };

  // Update form when editing user changes
  useEffect(() => {
    if (isEditing && editingUser) {
      editForm.reset({
        firstName: editingUser.firstName || "",
        lastName: editingUser.lastName || "",
        role: editingUser.role || "student",
        status: editingUser.status || "active",
      });
    }
  }, [editingUser, isEditing, editForm]);

  const canCreateSuperadmin = currentUser?.role === 'superadmin';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {editingUser ? 'Edit User' : 'Add New User'}
          </DialogTitle>
          {!editingUser && (
            <p className="text-sm text-gray-600 mt-2">
              A new user account will be created with temporary login credentials. An invitation email with login instructions will be automatically sent to the user's email address.
            </p>
          )}
        </DialogHeader>

{isEditing ? (
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-4 bg-gray-50 p-4 rounded-lg">
                <div className="text-sm text-gray-600">
                  <strong>User:</strong> {editingUser?.email}
                </div>
              </div>

              <FormField
                control={editForm.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="John" 
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Doe" 
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="student">Student</SelectItem>
                        <SelectItem value="tutor">Tutor</SelectItem>
                        <SelectItem value="marker">Marker</SelectItem>
                        <SelectItem value="iqa">IQA</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        {canCreateSuperadmin && (
                          <SelectItem value="superadmin">Superadmin</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end space-x-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  disabled={createMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? "Updating..." : "Update User"}
                </Button>
              </div>
            </form>
          </Form>
        ) : (
          <Form {...createForm}>
            <form onSubmit={createForm.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={createForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Address *</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="john@example.com" 
                        type="email" 
                        {...field}
                        autoComplete="off"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={createForm.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="student">Student</SelectItem>
                        <SelectItem value="tutor">Tutor</SelectItem>
                        <SelectItem value="marker">Marker</SelectItem>
                        <SelectItem value="iqa">IQA</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        {canCreateSuperadmin && (
                          <SelectItem value="superadmin">Superadmin</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={createForm.control}
                name="sendWelcomeEmail"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        Send welcome email with login instructions
                      </FormLabel>
                    </div>
                  </FormItem>
                )}
              />

              <div className="flex justify-end space-x-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  disabled={createMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? "Creating..." : "Create User"}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
