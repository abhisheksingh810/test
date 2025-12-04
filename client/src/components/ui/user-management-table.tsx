import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { canModifyUser } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useTimezone } from "@/hooks/use-timezone";
import type { User, UserRole } from "@shared/schema";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";
import { Button } from "./button";
import { Input } from "./input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";
import { Badge } from "./badge";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";
import { Card, CardContent, CardHeader, CardTitle } from "./card";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "./dropdown-menu";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./alert-dialog";
import { 
  Search, 
  MoreHorizontal, 
  Edit, 
  Trash2, 
  X,
  ChevronLeft,
  ChevronRight
} from "lucide-react";

interface UserTableProps {
  onEditUser: (user: User) => void;
}

interface UsersResponse {
  users: User[];
  total: number;
  page: number;
  limit: number;
}

export function UserManagementTable({ onEditUser }: UserTableProps) {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { formatRelative } = useTimezone();
  
  const [filters, setFilters] = useState({
    search: "",
    role: "all",
    status: "all"
  });
  const [page, setPage] = useState(1);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  
  const limit = 10;

  const queryParams = new URLSearchParams();
  if (filters.search) queryParams.append('search', filters.search);
  if (filters.role && filters.role !== 'all') queryParams.append('role', filters.role);
  if (filters.status && filters.status !== 'all') queryParams.append('status', filters.status);
  queryParams.append('page', page.toString());
  queryParams.append('limit', limit.toString());

  const { data, isLoading } = useQuery<UsersResponse>({
    queryKey: [`/api/users?${queryParams.toString()}`],
    staleTime: 30 * 1000, // 30 seconds
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest('DELETE', `/api/users/${userId}`);
    },
    onSuccess: () => {
      // Invalidate all user queries to refresh the list
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          return Array.isArray(query.queryKey) && 
                 query.queryKey[0] && 
                 typeof query.queryKey[0] === 'string' && 
                 query.queryKey[0].startsWith('/api/users');
        }
      });
      toast({
        title: "Success",
        description: "User deleted successfully",
      });
      setUserToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleDeleteUser = (user: User) => {
    if (!canModifyUser(currentUser?.role || '', user.role)) {
      toast({
        title: "Error",
        description: "You don't have permission to delete this user",
        variant: "destructive",
      });
      return;
    }
    setUserToDelete(user);
  };

  const confirmDelete = () => {
    if (userToDelete) {
      deleteMutation.mutate(userToDelete.id);
    }
  };

  const clearFilters = () => {
    setFilters({ search: "", role: "all", status: "all" });
    setPage(1);
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'superadmin': return 'bg-red-100 text-red-800';
      case 'admin': return 'bg-purple-100 text-purple-800';
      case 'marker': return 'bg-orange-100 text-orange-800';
      case 'tutor': return 'bg-blue-100 text-blue-800';
      case 'iqa': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'inactive': return 'bg-gray-100 text-gray-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getUserDisplayName = (user: User | null) => {
    if (!user) return 'Unknown User';
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    return user.username || 'Unknown User';
  };

  const getUserInitials = (user: User | null) => {
    if (!user) return 'UU';
    if (user.firstName && user.lastName) {
      return `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();
    }
    return (user.username || 'UU').slice(0, 2).toUpperCase();
  };

  const formatLastLogin = (lastLogin: string | Date | null) => {
    if (!lastLogin) return 'Never';
    return formatRelative(lastLogin);
  };

  const totalPages = Math.ceil((data?.total || 0) / limit);
  const startIndex = (page - 1) * limit + 1;
  const endIndex = Math.min(page * limit, data?.total || 0);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search Users
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                <Input
                  placeholder="Search by name or email..."
                  value={filters.search}
                  onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                  className="pl-10"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Filter by Role
              </label>
              <Select
                value={filters.role}
                onValueChange={(value) => setFilters(prev => ({ ...prev, role: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="superadmin">Superadmin</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="tutor">Tutor</SelectItem>
                  <SelectItem value="marker">Marker</SelectItem>
                  <SelectItem value="iqa">IQA</SelectItem>
                  <SelectItem value="student">Student</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Filter by Status
              </label>
              <Select
                value={filters.status}
                onValueChange={(value) => setFilters(prev => ({ ...prev, status: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={clearFilters}
                className="w-full"
              >
                <X className="mr-2" size={16} />
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* User Table */}
      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array(5).fill(0).map((_, index) => (
                    <TableRow key={index}>
                      <TableCell colSpan={5}>
                        <div className="flex items-center space-x-4">
                          <div className="h-10 w-10 bg-gray-200 rounded-full animate-pulse" />
                          <div className="space-y-2">
                            <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
                            <div className="h-3 w-24 bg-gray-200 rounded animate-pulse" />
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : data?.users?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8">
                      No users found
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.users?.map((user) => (
                    <TableRow key={user.id} className="hover:bg-gray-50">
                      <TableCell>
                        <div className="flex items-center space-x-3">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={user.profileImageUrl || undefined} />
                            <AvatarFallback>{getUserInitials(user)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {getUserDisplayName(user)}
                            </div>
                            <div className="text-sm text-gray-500">
                              {user.email}
                            </div>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell>
                        <Badge className={getRoleBadgeColor(user.role)}>
                          {user.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusBadgeColor(user.status)}>
                          {user.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-gray-500">
                        {formatLastLogin(user.lastLoginAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal size={16} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => onEditUser(user)}
                              disabled={!canModifyUser(currentUser?.role || '', user.role)}
                            >
                              <Edit className="mr-2" size={16} />
                              Edit User
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDeleteUser(user)}
                              disabled={!canModifyUser(currentUser?.role || '', user.role)}
                              className="text-red-600 focus:text-red-600"
                            >
                              <Trash2 className="mr-2" size={16} />
                              Delete User
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {data && data.total > limit && (
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-gray-700">
                Showing {startIndex} to {endIndex} of {data.total} results
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft size={16} />
                  Previous
                </Button>
                <span className="text-sm">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Next
                  <ChevronRight size={16} />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!userToDelete} onOpenChange={() => setUserToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the user "{getUserDisplayName(userToDelete!)}" and all associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete User"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
