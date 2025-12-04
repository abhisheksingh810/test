import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { 
  Users, 
  GraduationCap, 
  Presentation, 
  ShieldQuestion,
  Bell
} from "lucide-react";

interface UserStatistics {
  totalUsers: number;
  activeStudents: number;
  instructors: number;
  admins: number;
}

export default function Home() {
  const { user } = useAuth();

  const { data: userStats, isLoading: isLoadingStats } = useQuery<UserStatistics>({
    queryKey: ['/api/users/statistics'],
  });

  if (!user) return null;

  const getRoleDescription = (role: string) => {
    switch (role) {
      case 'superadmin': return 'You have full system access and can manage all platform operations.';
      case 'admin': return 'You can manage users, system settings, and platform configuration.';
      case 'marker': return 'You can grade assessments and provide feedback to students.';
      case 'tutor': return 'You can create assessments and guide student learning.';
      case 'iqa': return 'You can perform internal quality assurance on assessments.';
      case 'student': return 'You can take assessments and track your learning progress.';
      default: return 'Welcome to the EduAssess platform.';
    }
  };

  const getUserDisplayName = () => {
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    return user.username;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full px-2 sm:px-4 py-6">
          {/* Welcome Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">
              Welcome back, {getUserDisplayName()}!
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              {getRoleDescription(user.role)}
            </p>
            <div className="mt-4">
              <Badge variant="secondary" className="text-sm">
                Role: {user.role}
              </Badge>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <Users className="text-primary" size={24} />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-500">Total Users</p>
                    <p className="text-2xl font-bold text-gray-900" data-testid="text-total-users">
                      {isLoadingStats ? '...' : userStats?.totalUsers || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <GraduationCap className="text-green-500" size={24} />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-500">Active Students</p>
                    <p className="text-2xl font-bold text-gray-900" data-testid="text-active-students">
                      {isLoadingStats ? '...' : userStats?.activeStudents || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <Presentation className="text-blue-500" size={24} />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-500">Instructors</p>
                    <p className="text-2xl font-bold text-gray-900" data-testid="text-instructors">
                      {isLoadingStats ? '...' : userStats?.instructors || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <ShieldQuestion className="text-purple-500" size={24} />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-500">Admins</p>
                    <p className="text-2xl font-bold text-gray-900" data-testid="text-admins">
                      {isLoadingStats ? '...' : userStats?.admins || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Bell className="mr-2" size={20} />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-900">New assessment created</p>
                    <p className="text-xs text-gray-500">2 hours ago</p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <div className="w-2 h-2 bg-green-500 rounded-full mt-2"></div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-900">User profile updated</p>
                    <p className="text-xs text-gray-500">4 hours ago</p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2"></div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-900">System maintenance scheduled</p>
                    <p className="text-xs text-gray-500">1 day ago</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
  );
}
