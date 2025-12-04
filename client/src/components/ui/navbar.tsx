import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { canAccessAdminFeatures } from "@/lib/auth";
import { Button } from "./button";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { Badge } from "./badge";
import { 
  LayoutDashboard, 
  Users, 
  Settings, 
  Menu,
  X,
  User,
  LogOut,
  ChevronDown,
  ClipboardCheck
} from "lucide-react";
import avadoLogo from "@assets/AVADO-original_1754478882931.png";

export function Navbar() {
  const [location] = useLocation();
  const { user, logout, isLoggingOut } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  if (!user) return null;

  const canAccessAdmin = canAccessAdminFeatures(user.role);
  const canAccessMarking = ['marker', 'tutor', 'iqa', 'admin', 'superadmin'].includes(user.role);

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard, show: true },
    { href: "/marking", label: "Marking", icon: ClipboardCheck, show: canAccessMarking },
    { href: "/settings", label: "System Settings", icon: Settings, show: canAccessAdmin },
  ];

  const visibleNavItems = navItems.filter(item => item.show);

  const handleLogout = () => {
    logout();
    setIsMobileMenuOpen(false);
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

  const getUserDisplayName = () => {
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    return user.username;
  };

  const getUserInitials = () => {
    if (user.firstName && user.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    return user.username.slice(0, 2).toUpperCase();
  };

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
      <div className="w-full px-6">
        <div className="flex justify-between items-center h-16">
          {/* Logo Section */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center">
              <img src={avadoLogo} alt="Avado" className="h-8 mr-3" />
            </Link>
          </div>

          {/* Desktop Navigation Menu */}
          <div className="hidden md:block">
            <div className="ml-10 flex items-baseline space-x-4">
              {visibleNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = location === item.href;
                return (
                  <Link key={item.href} href={item.href}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`flex items-center space-x-2 transition-colors ${
                        isActive 
                          ? "text-primary bg-primary/10" 
                          : "text-gray-500 hover:text-primary"
                      }`}
                    >
                      <Icon size={16} />
                      <span>{item.label}</span>
                    </Button>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* User Profile Menu */}
          <div className="flex items-center">
            <div className="ml-4 flex items-center md:ml-6">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center space-x-2">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user.profileImageUrl || undefined} alt={getUserDisplayName()} />
                      <AvatarFallback>{getUserInitials()}</AvatarFallback>
                    </Avatar>
                    <span className="hidden md:block text-sm font-medium text-gray-700">
                      {getUserDisplayName()}
                    </span>
                    <Badge className={`hidden md:inline-flex text-xs ${getRoleBadgeColor(user.role)}`}>
                      {user.role}
                    </Badge>
                    <ChevronDown className="ml-2 text-gray-400" size={16} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem asChild>
                    <Link href="/profile" className="flex items-center">
                      <User className="mr-2" size={16} />
                      Your Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                    className="flex items-center text-red-600 focus:text-red-600"
                  >
                    <LogOut className="mr-2" size={16} />
                    {isLoggingOut ? "Signing out..." : "Sign out"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Mobile menu button */}
            <div className="md:hidden ml-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="text-gray-500 hover:text-gray-600"
              >
                {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden bg-white border-t border-gray-200">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href;
              return (
                <Link key={item.href} href={item.href}>
                  <Button
                    variant="ghost"
                    className={`w-full justify-start ${
                      isActive ? "text-primary bg-primary/10" : "text-gray-500"
                    }`}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <Icon className="mr-2" size={16} />
                    {item.label}
                  </Button>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
}
