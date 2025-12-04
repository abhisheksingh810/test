import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { canAccessAdminFeatures } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { UserManagementTable } from "@/components/ui/user-management-table";
import { AddUserModal } from "@/components/ui/add-user-modal";
import { Textarea } from "@/components/ui/textarea";
import { InstructionSetsTab } from "@/components/ui/instruction-sets-tab";
import { EmailTemplatesTab } from "@/components/ui/email-templates-tab";
import { HierarchicalCourseManagement } from "@/components/ui/hierarchical-course-management";
import { MarkingSettingsTab } from "@/components/ui/marking-settings-tab";
import type { SystemSetting, User, InstructionStep, InstructionSet, Assessment } from "@shared/schema";
import { TIMEZONE_OPTIONS } from "../../../shared/timezone-utils";
import { 
  Settings, 
  ShieldQuestion, 
  Save,
  Cog,
  Link,
  Shield,
  Users,
  Plus,
  GraduationCap,
  Presentation,
  FileText,
  CheckCircle,
  Loader,
  ExternalLink,
  Trash2,
  Edit,
  Mail,
  Copy,
  Zap,
  X
} from "lucide-react";

interface SettingsForm {
  timezone: string;
  ltiConsumerKey: string;
  ltiSharedSecret: string;
  sessionTimeout: string;
  passwordPolicy: string;
  requireTwoFactor: boolean;
  // SMTP settings
  hubspotSmtpHost: string;
  hubspotSmtpPort: string;
  hubspotSmtpUsername: string;
  hubspotSmtpPassword: string;
  hubspotSmtpFromEmail: string;
  hubspotSmtpFromName: string;
  hubspotSmtpUseTls: boolean;
  // TurnItIn settings
  turnitinApiUrl: string;
  turnitinApiKey: string;
  turnitinIntegrationName: string;
  turnitinIntegrationVersion: string;
  turnitinIndexAllSubmissions: boolean;
  turnitinSearchInternet: boolean;
  turnitinSearchPublication: boolean;
  turnitinSearchCrossref: boolean;
  turnitinSearchCrossrefPosted: boolean;
  turnitinSearchSubmittedWork: boolean;
  turnitinShowSourceText: boolean;
  turnitinShowMatchDetail: boolean;
  turnitinAnonymiseSubmissions: boolean;
}

export default function SystemSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Active tab state for sidebar navigation
  const [activeTab, setActiveTab] = useState<string>("settings");

  // Navigation items for sidebar
  const navigationItems = [
    {
      id: "settings",
      label: "General Settings",
      icon: Settings,
      description: "Basic platform configuration"
    },
    {
      id: "lti",
      label: "LTI Integration",
      icon: Link,
      description: "Learning Tools Interoperability"
    },
    {
      id: "smtp",
      label: "SMTP Settings",
      icon: Mail,
      description: "Email configuration"
    },
    {
      id: "email-templates",
      label: "Email Templates",
      icon: Mail,
      description: "Customize email templates"
    },
    {
      id: "instructions",
      label: "Instruction Sets",
      icon: Presentation,
      description: "Manage instruction sets"
    },
    {
      id: "courses",
      label: "Course Management",
      icon: GraduationCap,
      description: "Course and category settings"
    },
    {
      id: "turnitin",
      label: "TurnItIn Settings",
      icon: FileText,
      description: "Plagiarism detection"
    },
    {
      id: "marking-settings",
      label: "Marking Settings",
      icon: CheckCircle,
      description: "Skip reasons and malpractice levels"
    },
    {
      id: "users",
      label: "User Management",
      icon: Users,
      description: "Manage user accounts"
    }
  ];
  
  const [settings, setSettings] = useState<SettingsForm>({
    timezone: 'Europe/London',
    ltiConsumerKey: '',
    ltiSharedSecret: '',
    sessionTimeout: '60',
    passwordPolicy: 'standard',
    requireTwoFactor: false,
    // HubSpot SMTP settings defaults
    hubspotSmtpHost: 'smtp.hubspot.com',
    hubspotSmtpPort: '587',
    hubspotSmtpUsername: '',
    hubspotSmtpPassword: '',
    hubspotSmtpFromEmail: '',
    hubspotSmtpFromName: '',
    hubspotSmtpUseTls: true,
    // TurnItIn settings defaults
    turnitinApiUrl: '',
    turnitinApiKey: '',
    turnitinIntegrationName: 'Avado E-Assessment Platform',
    turnitinIntegrationVersion: '1.0.0',
    turnitinIndexAllSubmissions: true,
    turnitinSearchInternet: true,
    turnitinSearchPublication: true,
    turnitinSearchCrossref: true,
    turnitinSearchCrossrefPosted: true,
    turnitinSearchSubmittedWork: true,
    turnitinShowSourceText: true,
    turnitinShowMatchDetail: true,
    turnitinAnonymiseSubmissions: false,
  });

  // User management state
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  
  // Instruction sets management state
  const [selectedInstructionSet, setSelectedInstructionSet] = useState<string | null>(null);
  const [isCreateSetDialogOpen, setIsCreateSetDialogOpen] = useState(false);
  const [isEditSetDialogOpen, setIsEditSetDialogOpen] = useState(false);
  const [editingSet, setEditingSet] = useState<InstructionSet | null>(null);
  const [newSet, setNewSet] = useState({
    name: '',
    slug: '',
    description: ''
  });
  
  // LTI URL Generator state
  const [showLtiUrlGenerator, setShowLtiUrlGenerator] = useState(false);
  const [selectedAssessmentForUrl, setSelectedAssessmentForUrl] = useState<string>('');
  const [selectedInstructionSetForUrl, setSelectedInstructionSetForUrl] = useState<string>('');
  const [generatedLtiUrl, setGeneratedLtiUrl] = useState<string>('');
  const [customParameters, setCustomParameters] = useState<{key: string, value: string}[]>([
    { key: 'custom_action', value: 'exercise_attempt' }
  ]);
  
  // Instruction steps state (for selected set)
  const [instructionSteps, setInstructionSteps] = useState<InstructionStep[]>([]);
  const [showAddStepForm, setShowAddStepForm] = useState(false);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [newStepData, setNewStepData] = useState({
    stepNumber: '',
    title: '',
    content: '',
    stepType: 'info' as const,
    checkboxItems: [] as string[],
    isActive: 'true',
    instructionSetId: ''
  });

  // Redirect if not authorized
  if (!user || !canAccessAdminFeatures(user.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="pt-6">
            <div className="text-center">
              <ShieldQuestion className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h1 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h1>
              <p className="text-sm text-gray-600">
                You don't have permission to access system settings.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { data: systemSettings, isLoading } = useQuery({
    queryKey: ['/api/settings'],
    staleTime: 60 * 1000, // 1 minute
  });

  // Instruction sets query
  const { data: instructionSets, isLoading: setsLoading } = useQuery({
    queryKey: ['/api/instruction-sets'],
    staleTime: 60 * 1000, // 1 minute
  });

  const sets: InstructionSet[] = instructionSets as InstructionSet[] || [];

  // Assessments query for LTI URL generator
  const { data: assessments } = useQuery<Assessment[]>({
    queryKey: ['/api/assessments'],
    staleTime: 60 * 1000, // 1 minute
  });

  const allAssessments: Assessment[] = assessments || [];

  // Instruction steps query for selected set
  const { data: stepsData, isLoading: stepsLoading } = useQuery({
    queryKey: selectedInstructionSet ? [`/api/instruction-steps`, selectedInstructionSet] : ['/api/instruction-steps'],
    staleTime: 60 * 1000, // 1 minute
  });

  // Sync instruction steps data
  useEffect(() => {
    if (stepsData) {
      setInstructionSteps(stepsData);
    }
  }, [stepsData]);

  // Auto-select first instruction set if available
  useEffect(() => {
    if (sets.length > 0 && !selectedInstructionSet) {
      setSelectedInstructionSet(sets[0].id);
    }
  }, [sets, selectedInstructionSet]);

  // User statistics for user management tab
  const { data: statsData } = useQuery({
    queryKey: ['/api/users?limit=1000'], // Get all for stats
    select: (data: any) => {
      if (!data?.users) return { total: 0, students: 0, instructors: 0, admins: 0 };
      
      const users = data.users;
      return {
        total: users.length,
        students: users.filter((u: User) => u.role === 'student').length,
        instructors: users.filter((u: User) => ['tutor', 'marker', 'iqa'].includes(u.role)).length,
        admins: users.filter((u: User) => ['admin', 'superadmin'].includes(u.role)).length,
      };
    },
    staleTime: 60 * 1000, // 1 minute
  });

  // Create instruction set mutation
  const createSetMutation = useMutation({
    mutationFn: async (setData: typeof newSet) => {
      return await apiRequest(`/api/instruction-sets`, 'POST', {
        ...setData,
        isActive: 'true'
      });
    },
    onSuccess: (newSet: InstructionSet) => {
      queryClient.invalidateQueries({ queryKey: ['/api/instruction-sets'] });
      setIsCreateSetDialogOpen(false);
      setSelectedInstructionSet(newSet.id);
      setNewSet({ name: '', slug: '', description: '' });
      toast({
        title: "Success",
        description: "Instruction set created successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create instruction set.",
        variant: "destructive",
      });
    },
  });

  // Update instruction set mutation
  const updateSetMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InstructionSet> }) => {
      return await apiRequest('PUT', `/api/instruction-sets/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/instruction-sets'] });
      setIsEditSetDialogOpen(false);
      setEditingSet(null);
      toast({
        title: "Success",
        description: "Instruction set updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update instruction set.",
        variant: "destructive",
      });
    },
  });

  // Delete instruction set mutation
  const deleteSetMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest('DELETE', `/api/instruction-sets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/instruction-sets'] });
      if (selectedInstructionSet === editingSet?.id) {
        setSelectedInstructionSet(null);
      }
      toast({
        title: "Success",
        description: "Instruction set deleted successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete instruction set.",
        variant: "destructive",
      });
    },
  });

  const saveInstructionStepsMutation = useMutation({
    mutationFn: async (steps: InstructionStep[]) => {
      console.log('🔧 Saving instruction steps:', steps);
      return await apiRequest('POST', '/api/instruction-steps', steps);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Instruction steps updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/instruction-steps'] });
      if (selectedInstructionSet) {
        queryClient.invalidateQueries({ queryKey: [`/api/instruction-steps`, selectedInstructionSet] });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update instruction steps.",
        variant: "destructive",
      });
    },
  });

  const saveSettingsMutation = useMutation({
    mutationFn: async (settingsData: SettingsForm) => {
      const settingsArray = [
        { key: 'timezone', value: settingsData.timezone, description: 'Default system timezone' },
        { key: 'lti_consumer_key', value: settingsData.ltiConsumerKey, description: 'LTI consumer key for integration' },
        { key: 'lti_shared_secret', value: settingsData.ltiSharedSecret, description: 'LTI shared secret' },
        { key: 'session_timeout', value: settingsData.sessionTimeout, description: 'Session timeout in minutes' },
        { key: 'password_policy', value: settingsData.passwordPolicy, description: 'Password complexity requirements' },
        { key: 'require_two_factor', value: settingsData.requireTwoFactor.toString(), description: 'Require 2FA for admin accounts' },
        // HubSpot SMTP settings
        { key: 'hubspot_smtp_host', value: settingsData.hubspotSmtpHost, description: 'HubSpot SMTP server host' },
        { key: 'hubspot_smtp_port', value: settingsData.hubspotSmtpPort, description: 'HubSpot SMTP server port' },
        { key: 'hubspot_smtp_username', value: settingsData.hubspotSmtpUsername, description: 'HubSpot SMTP username' },
        { key: 'hubspot_smtp_password', value: settingsData.hubspotSmtpPassword, description: 'HubSpot SMTP password' },
        { key: 'hubspot_smtp_from_email', value: settingsData.hubspotSmtpFromEmail, description: 'HubSpot SMTP from email address' },
        { key: 'hubspot_smtp_from_name', value: settingsData.hubspotSmtpFromName, description: 'HubSpot SMTP from name' },
        { key: 'hubspot_smtp_use_tls', value: settingsData.hubspotSmtpUseTls.toString(), description: 'HubSpot SMTP use TLS encryption' },
        // TurnItIn settings
        { key: 'turnitin_api_url', value: settingsData.turnitinApiUrl, description: 'TurnItIn API URL' },
        { key: 'turnitin_api_key', value: settingsData.turnitinApiKey, description: 'TurnItIn API Key' },
        { key: 'turnitin_integration_name', value: settingsData.turnitinIntegrationName, description: 'TurnItIn integration name' },
        { key: 'turnitin_integration_version', value: settingsData.turnitinIntegrationVersion, description: 'TurnItIn integration version' },
        { key: 'turnitin_index_all_submissions', value: settingsData.turnitinIndexAllSubmissions.toString(), description: 'Index all submissions' },
        { key: 'turnitin_search_internet', value: settingsData.turnitinSearchInternet.toString(), description: 'Search Internet' },
        { key: 'turnitin_search_publication', value: settingsData.turnitinSearchPublication.toString(), description: 'Search Publications' },
        { key: 'turnitin_search_crossref', value: settingsData.turnitinSearchCrossref.toString(), description: 'Search Crossref' },
        { key: 'turnitin_search_crossref_posted', value: settingsData.turnitinSearchCrossrefPosted.toString(), description: 'Search Crossref Posted Content' },
        { key: 'turnitin_search_submitted_work', value: settingsData.turnitinSearchSubmittedWork.toString(), description: 'Search Submitted Work' },
        { key: 'turnitin_show_source_text', value: settingsData.turnitinShowSourceText.toString(), description: 'Show Source Text' },
        { key: 'turnitin_show_match_detail', value: settingsData.turnitinShowMatchDetail.toString(), description: 'Show Match Detail' },
        { key: 'turnitin_anonymise_submissions', value: settingsData.turnitinAnonymiseSubmissions.toString(), description: 'Anonymise Submissions' },
      ];

      const response = await apiRequest('POST', '/api/settings', settingsArray);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings'] });
      toast({
        title: "Success",
        description: "Settings saved successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const testTurnitinMutation = useMutation({
    mutationFn: async () => {
      if (!settings.turnitinApiUrl || !settings.turnitinApiKey) {
        throw new Error("API URL and API Key are required");
      }
      
      const response = await apiRequest('POST', '/api/settings/test-turnitin', {
        apiUrl: settings.turnitinApiUrl,
        apiKey: settings.turnitinApiKey
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }
      
      return await response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Connection Successful",
          description: "TurnItIn API connection verified successfully. Settings saved.",
        });
        // Only save the settings after successful connection test
        saveSettingsMutation.mutate(settings);
      } else {
        // This shouldn't happen if response.ok was true, but handle it just in case
        throw new Error(data.message || "Connection test failed");
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Connection Test Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const testSmtpMutation = useMutation({
    mutationFn: async () => {
      if (!settings.hubspotSmtpHost || !settings.hubspotSmtpUsername || !settings.hubspotSmtpPassword) {
        throw new Error("SMTP Host, Username, and Password are required");
      }
      
      const response = await apiRequest('POST', '/api/settings/test-smtp', {
        host: settings.hubspotSmtpHost,
        port: parseInt(settings.hubspotSmtpPort),
        username: settings.hubspotSmtpUsername,
        password: settings.hubspotSmtpPassword,
        fromEmail: settings.hubspotSmtpFromEmail,
        fromName: settings.hubspotSmtpFromName,
        useTls: settings.hubspotSmtpUseTls
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }
      
      return await response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "SMTP Connection Successful",
          description: "HubSpot SMTP connection verified successfully. Settings saved.",
        });
        // Only save the settings after successful connection test
        saveSettingsMutation.mutate(settings);
      } else {
        throw new Error(data.message || "SMTP connection test failed");
      }
    },
    onError: (error: Error) => {
      toast({
        title: "SMTP Connection Test Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (systemSettings && Array.isArray(systemSettings)) {
      const settingsMap = new Map(systemSettings.map((s: any) => [s.key, s.value]));
      
      setSettings({
        timezone: settingsMap.get('timezone') || 'Europe/London',
        ltiConsumerKey: settingsMap.get('lti_consumer_key') || '',
        ltiSharedSecret: settingsMap.get('lti_shared_secret') || '',
        sessionTimeout: settingsMap.get('session_timeout') || '60',
        passwordPolicy: settingsMap.get('password_policy') || 'standard',
        requireTwoFactor: settingsMap.get('require_two_factor') === 'true',
        // HubSpot SMTP settings
        hubspotSmtpHost: settingsMap.get('hubspot_smtp_host') || 'smtp.hubspot.com',
        hubspotSmtpPort: settingsMap.get('hubspot_smtp_port') || '587',
        hubspotSmtpUsername: settingsMap.get('hubspot_smtp_username') || '',
        hubspotSmtpPassword: settingsMap.get('hubspot_smtp_password') || '',
        hubspotSmtpFromEmail: settingsMap.get('hubspot_smtp_from_email') || '',
        hubspotSmtpFromName: settingsMap.get('hubspot_smtp_from_name') || '',
        hubspotSmtpUseTls: settingsMap.get('hubspot_smtp_use_tls') !== 'false',
        // TurnItIn settings
        turnitinApiUrl: settingsMap.get('turnitin_api_url') || '',
        turnitinApiKey: settingsMap.get('turnitin_api_key') || '',
        turnitinIntegrationName: settingsMap.get('turnitin_integration_name') || 'Avado E-Assessment Platform',
        turnitinIntegrationVersion: settingsMap.get('turnitin_integration_version') || '1.0.0',
        turnitinIndexAllSubmissions: settingsMap.get('turnitin_index_all_submissions') !== 'false',
        turnitinSearchInternet: settingsMap.get('turnitin_search_internet') !== 'false',
        turnitinSearchPublication: settingsMap.get('turnitin_search_publication') !== 'false',
        turnitinSearchCrossref: settingsMap.get('turnitin_search_crossref') !== 'false',
        turnitinSearchCrossrefPosted: settingsMap.get('turnitin_search_crossref_posted') !== 'false',
        turnitinSearchSubmittedWork: settingsMap.get('turnitin_search_submitted_work') !== 'false',
        turnitinShowSourceText: settingsMap.get('turnitin_show_source_text') !== 'false',
        turnitinShowMatchDetail: settingsMap.get('turnitin_show_match_detail') !== 'false',
        turnitinAnonymiseSubmissions: settingsMap.get('turnitin_anonymise_submissions') === 'true',
      });
    }
  }, [systemSettings]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveSettingsMutation.mutate(settings);
  };

  const handleInputChange = (key: keyof SettingsForm, value: string | boolean) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  // User management handlers
  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setIsAddUserModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsAddUserModalOpen(false);
    setEditingUser(null);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="w-full px-2 sm:px-4 py-6">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-64 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-96 mb-8"></div>
            <div className="space-y-6">
              <div className="h-64 bg-gray-200 rounded"></div>
              <div className="h-64 bg-gray-200 rounded"></div>
              <div className="h-64 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="w-full px-2 sm:px-4 py-6">
          {/* Page Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">System Settings</h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Manage platform settings and user accounts
            </p>
          </div>

          {/* Sidebar Layout */}
          <div className="flex gap-3">
            {/* Left Sidebar Navigation */}
            <div className="w-56 flex-shrink-0">
              <Card className="sticky top-6">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-900 dark:text-white">Settings</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <nav className="space-y-0.5">
                    {navigationItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => setActiveTab(item.id)}
                          data-testid={`nav-${item.id}`}
                          className={`w-full text-left px-3 py-2.5 text-sm font-medium rounded-md transition-colors duration-150 ${
                            isActive
                              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                          }`}
                        >
                          <div className="flex items-center">
                            <Icon className="mr-2.5 flex-shrink-0" size={16} />
                            <div className="min-w-0 flex-1">
                              <div className="font-medium">{item.label}</div>
                              <div className={`text-xs mt-0.5 ${
                                isActive 
                                  ? 'text-primary-foreground/80' 
                                  : 'text-gray-500 dark:text-gray-400'
                              }`}>
                                {item.description}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </nav>
                </CardContent>
              </Card>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 min-w-0">
              {/* System Settings Content */}
              {activeTab === "settings" && (
                <form onSubmit={handleSubmit}>
                <div className="space-y-6">
                  {/* General Settings */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center">
                        <Cog className="mr-2" size={20} />
                        General Settings
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="timezone">Default Timezone</Label>
                          <Select
                            value={settings.timezone}
                            onValueChange={(value) => handleInputChange('timezone', value)}
                          >
                            <SelectTrigger className="mt-2">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {TIMEZONE_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label} ({option.offset})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CardContent>
                  </Card>



                  {/* Security Settings */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center">
                        <Shield className="mr-2" size={20} />
                        Security Settings
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="sessionTimeout">Session Timeout (minutes)</Label>
                          <Input
                            id="sessionTimeout"
                            type="number"
                            min="15"
                            max="480"
                            value={settings.sessionTimeout}
                            onChange={(e) => handleInputChange('sessionTimeout', e.target.value)}
                            className="mt-2"
                          />
                        </div>
                        <div>
                          <Label htmlFor="passwordPolicy">Password Complexity</Label>
                          <Select
                            value={settings.passwordPolicy}
                            onValueChange={(value) => handleInputChange('passwordPolicy', value)}
                          >
                            <SelectTrigger className="mt-2">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="standard">Standard (8+ chars)</SelectItem>
                              <SelectItem value="strong">Strong (12+ chars, mixed case, numbers)</SelectItem>
                              <SelectItem value="very_strong">Very Strong (16+ chars, all requirements)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      
                      <Separator />
                      
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="requireTwoFactor"
                          checked={settings.requireTwoFactor}
                          onCheckedChange={(checked) => handleInputChange('requireTwoFactor', !!checked)}
                        />
                        <Label htmlFor="requireTwoFactor" className="text-sm">
                          Require two-factor authentication for admin accounts
                        </Label>
                      </div>
                    </CardContent>
                  </Card>



                  {/* Save Button */}
                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      disabled={saveSettingsMutation.isPending}
                      className="inline-flex items-center"
                    >
                      <Save className="mr-2" size={16} />
                      {saveSettingsMutation.isPending ? 'Saving...' : 'Save Settings'}
                    </Button>
                  </div>
                </div>
                </form>
              )}

              {/* LTI Integration Content */}
              {activeTab === "lti" && (
                <form onSubmit={handleSubmit}>
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center">
                        <Link className="mr-2" size={20} />
                        LTI Integration Settings
                      </CardTitle>
                      <CardDescription>
                        Configure Learning Tools Interoperability for assignment submissions from Thought Industries LMS.
                        Use the LTI Tool URL: <code className="bg-gray-100 px-1 rounded text-xs">{window.location.origin}/api/lti/launch</code>
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="ltiConsumerKey">Consumer Key</Label>
                          <Input
                            id="ltiConsumerKey"
                            placeholder="Enter LTI consumer key"
                            value={settings.ltiConsumerKey}
                            onChange={(e) => handleInputChange('ltiConsumerKey', e.target.value)}
                            className="mt-2"
                            autoComplete="off"
                          />
                        </div>
                        <div>
                          <Label htmlFor="ltiSharedSecret">Consumer Secret</Label>
                          <Input
                            id="ltiSharedSecret"
                            type="text"
                            placeholder="Enter consumer secret"
                            value={settings.ltiSharedSecret}
                            onChange={(e) => handleInputChange('ltiSharedSecret', e.target.value)}
                            className="mt-2"
                            autoComplete="off"
                          />
                        </div>
                      </div>

                      {/* LTI Demo Section - HIDDEN: Can be revived later if necessary */}
                      {/* <div className="pt-4 border-t">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <h4 className="text-sm font-medium">Test LTI Integration</h4>
                            <p className="text-xs text-gray-500">Simulate an assignment submission from your LMS</p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              // Open LTI demo in new window
                              window.open('/lti-demo', '_blank', 'width=800,height=600');
                            }}
                            className="flex items-center"
                          >
                            <ExternalLink className="mr-2" size={14} />
                            Launch Test
                          </Button>
                        </div>
                      </div> */}

                      {/* LTI URL Generator Section */}
                      <div className="pt-4 border-t">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <h4 className="text-sm font-medium">LTI Tool URL Generator</h4>
                            <p className="text-xs text-gray-500">Generate custom LTI URLs with assessment and instruction set parameters</p>
                          </div>
                          <Button
                            type="button"
                            variant="default"
                            size="sm"
                            onClick={() => setShowLtiUrlGenerator(true)}
                            className="flex items-center"
                            data-testid="button-generate-lti-url"
                          >
                            <Zap className="mr-2" size={14} />
                            Generate LTI Tool URL
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Save Button */}
                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      disabled={saveSettingsMutation.isPending}
                      className="inline-flex items-center"
                    >
                      <Save className="mr-2" size={16} />
                      {saveSettingsMutation.isPending ? 'Saving...' : 'Save Settings'}
                    </Button>
                  </div>
                </div>
                </form>
              )}

              {/* SMTP Settings Content */}
              {activeTab === "smtp" && (
                <form onSubmit={handleSubmit}>
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center">
                        <Mail className="mr-2" size={20} />
                        HubSpot SMTP Configuration
                      </CardTitle>
                      <CardDescription>
                        Configure SMTP settings using HubSpot's email service for reliable message delivery.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* SMTP Host Configuration */}
                      <div>
                        <Label htmlFor="hubspotSmtpHost">SMTP Host:</Label>
                        <Input
                          id="hubspotSmtpHost"
                          type="text"
                          placeholder="Enter SMTP host (e.g., smtp.hubapi.com)"
                          value={settings.hubspotSmtpHost}
                          onChange={(e) => handleInputChange('hubspotSmtpHost', e.target.value)}
                          className="mt-2"
                          data-testid="input-smtp-host"
                        />
                        <p className="text-sm text-gray-500 mt-1">
                          Enter your SMTP server hostname
                        </p>
                      </div>

                      {/* SMTP Port Configuration */}
                      <div>
                        <Label htmlFor="hubspotSmtpPort">SMTP Port:</Label>
                        <Select value={settings.hubspotSmtpPort} onValueChange={(value) => handleInputChange('hubspotSmtpPort', value)}>
                          <SelectTrigger className="mt-2">
                            <SelectValue placeholder="Select SMTP port" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="587">587 (STARTTLS - Recommended)</SelectItem>
                            <SelectItem value="25">25 (STARTTLS)</SelectItem>
                            <SelectItem value="465">465 (SSL/TLS)</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-sm text-gray-500 mt-1">
                          Port 587 with STARTTLS is recommended for most configurations
                        </p>
                      </div>

                      <Separator />

                      {/* SMTP Token Credentials */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="hubspotSmtpUsername">SMTP Token ID:</Label>
                          <Input
                            id="hubspotSmtpUsername"
                            type="text"
                            placeholder="Enter your HubSpot SMTP token ID"
                            value={settings.hubspotSmtpUsername}
                            onChange={(e) => handleInputChange('hubspotSmtpUsername', e.target.value)}
                            className="mt-2"
                            autoComplete="off"
                          />
                          <p className="text-sm text-gray-500 mt-1">
                            The ID from your HubSpot SMTP token
                          </p>
                        </div>
                        <div>
                          <Label htmlFor="hubspotSmtpPassword">SMTP Token Password:</Label>
                          <Input
                            id="hubspotSmtpPassword"
                            type="password"
                            placeholder="Enter your HubSpot SMTP token password"
                            value={settings.hubspotSmtpPassword}
                            onChange={(e) => handleInputChange('hubspotSmtpPassword', e.target.value)}
                            className="mt-2"
                            autoComplete="new-password"
                          />
                          <p className="text-sm text-gray-500 mt-1">
                            The password from your HubSpot SMTP token
                          </p>
                        </div>
                      </div>

                      {/* From Email Configuration */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="hubspotSmtpFromEmail">From Email Address:</Label>
                          <Input
                            id="hubspotSmtpFromEmail"
                            type="email"
                            placeholder="noreply@yourdomain.com"
                            value={settings.hubspotSmtpFromEmail}
                            onChange={(e) => handleInputChange('hubspotSmtpFromEmail', e.target.value)}
                            className="mt-2"
                          />
                        </div>
                        <div>
                          <Label htmlFor="hubspotSmtpFromName">From Name:</Label>
                          <Input
                            id="hubspotSmtpFromName"
                            type="text"
                            placeholder="Your Organization Name"
                            value={settings.hubspotSmtpFromName}
                            onChange={(e) => handleInputChange('hubspotSmtpFromName', e.target.value)}
                            className="mt-2"
                          />
                        </div>
                      </div>

                      <Separator />

                      {/* Security Options */}
                      <div>
                        <Label className="text-sm font-medium">Security Options:</Label>
                        <div className="mt-2 space-y-2">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="hubspotSmtpUseTls"
                              checked={settings.hubspotSmtpUseTls}
                              onCheckedChange={(checked) => handleInputChange('hubspotSmtpUseTls', !!checked)}
                            />
                            <Label htmlFor="hubspotSmtpUseTls" className="text-sm">
                              Use TLS encryption (recommended)
                            </Label>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <Button 
                          type="button"
                          variant="outline"
                          onClick={() => testSmtpMutation.mutate()}
                          disabled={testSmtpMutation.isPending || !settings.hubspotSmtpHost || !settings.hubspotSmtpUsername || !settings.hubspotSmtpPassword}
                          className="inline-flex items-center bg-blue-600 hover:bg-blue-700 text-white border-blue-600"
                        >
                          {testSmtpMutation.isPending ? (
                            <>
                              <Loader className="mr-2 animate-spin" size={16} />
                              Testing...
                            </>
                          ) : (
                            <>
                              <CheckCircle className="mr-2" size={16} />
                              Test SMTP Connection
                            </>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Save Button */}
                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      disabled={saveSettingsMutation.isPending}
                      className="inline-flex items-center"
                    >
                      <Save className="mr-2" size={16} />
                      {saveSettingsMutation.isPending ? 'Saving...' : 'Save Settings'}
                    </Button>
                  </div>
                </div>
                </form>
              )}

              {/* TurnItIn Settings Content */}
              {activeTab === "turnitin" && (
                <form onSubmit={handleSubmit}>
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center">
                        <FileText className="mr-2" size={20} />
                        TurnItIn Integration Settings
                      </CardTitle>
                      <CardDescription>
                        Configure TurnItIn plagiarism detection settings for your assessments.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* TCA v1 API Configuration */}
                      <div className="grid grid-cols-1 gap-4">
                        <div>
                          <Label htmlFor="turnitinApiUrl">TurnItIn API URL:</Label>
                          <Input
                            id="turnitinApiUrl"
                            type="url"
                            placeholder="https://app.turnitin.com"
                            value={settings.turnitinApiUrl}
                            onChange={(e) => handleInputChange('turnitinApiUrl', e.target.value)}
                            className="mt-2"
                            data-testid="input-turnitin-api-url"
                          />
                          <p className="text-sm text-gray-500 mt-1">
                            TCA v1 API base URL (e.g., https://app.turnitin.com)
                          </p>
                        </div>
                        <div>
                          <Label htmlFor="turnitinApiKey">TurnItIn API Key:</Label>
                          <Input
                            id="turnitinApiKey"
                            type="password"
                            placeholder="Enter TCA v1 API key"
                            value={settings.turnitinApiKey}
                            onChange={(e) => handleInputChange('turnitinApiKey', e.target.value)}
                            className="mt-2"
                            autoComplete="off"
                            data-testid="input-turnitin-api-key"
                          />
                          <p className="text-sm text-gray-500 mt-1">
                            Your TCA v1 bearer token for authentication
                          </p>
                        </div>
                      </div>

                      <Separator />

                      {/* Integration Settings */}
                      <div>
                        <Label className="text-sm font-medium">Integration Settings:</Label>
                        <div className="mt-3 space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <Label htmlFor="turnitinIntegrationName">Integration Name:</Label>
                              <Input
                                id="turnitinIntegrationName"
                                type="text"
                                placeholder="Avado E-Assessment Platform"
                                value={settings.turnitinIntegrationName}
                                onChange={(e) => handleInputChange('turnitinIntegrationName', e.target.value)}
                                className="mt-2"
                                data-testid="input-turnitin-integration-name"
                              />
                              <p className="text-sm text-gray-500 mt-1">
                                Integration identifier sent with TCA requests
                              </p>
                            </div>
                            <div>
                              <Label htmlFor="turnitinIntegrationVersion">Integration Version:</Label>
                              <Input
                                id="turnitinIntegrationVersion"
                                type="text"
                                placeholder="1.0.0"
                                value={settings.turnitinIntegrationVersion}
                                onChange={(e) => handleInputChange('turnitinIntegrationVersion', e.target.value)}
                                className="mt-2"
                                data-testid="input-turnitin-integration-version"
                              />
                              <p className="text-sm text-gray-500 mt-1">
                                Version sent with TCA requests
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <Button 
                          type="button"
                          variant="outline"
                          onClick={() => testTurnitinMutation.mutate()}
                          disabled={testTurnitinMutation.isPending || !settings.turnitinApiUrl || !settings.turnitinApiKey}
                          className="inline-flex items-center bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600"
                        >
                          {testTurnitinMutation.isPending ? (
                            <>
                              <Loader className="mr-2 animate-spin" size={16} />
                              Testing...
                            </>
                          ) : (
                            <>
                              <CheckCircle className="mr-2" size={16} />
                              Test Connection
                            </>
                          )}
                        </Button>
                      </div>

                      <Separator />

                      {/* Indexing Options */}
                      <div>
                        <Label className="text-sm font-medium">Indexing Options:</Label>
                        <div className="mt-2 space-y-2">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="turnitinIndexAllSubmissions"
                              checked={settings.turnitinIndexAllSubmissions}
                              onCheckedChange={(checked) => handleInputChange('turnitinIndexAllSubmissions', !!checked)}
                            />
                            <Label htmlFor="turnitinIndexAllSubmissions" className="text-sm">
                              Index all submissions
                            </Label>
                          </div>
                        </div>
                      </div>

                      <Separator />

                      {/* Search Levels */}
                      <div>
                        <Label className="text-sm font-medium">Search Levels:</Label>
                        <div className="mt-2 space-y-2">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="turnitinSearchInternet"
                              checked={settings.turnitinSearchInternet}
                              onCheckedChange={(checked) => handleInputChange('turnitinSearchInternet', !!checked)}
                            />
                            <Label htmlFor="turnitinSearchInternet" className="text-sm">
                              Internet
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="turnitinSearchPublication"
                              checked={settings.turnitinSearchPublication}
                              onCheckedChange={(checked) => handleInputChange('turnitinSearchPublication', !!checked)}
                            />
                            <Label htmlFor="turnitinSearchPublication" className="text-sm">
                              Publication
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="turnitinSearchCrossref"
                              checked={settings.turnitinSearchCrossref}
                              onCheckedChange={(checked) => handleInputChange('turnitinSearchCrossref', !!checked)}
                            />
                            <Label htmlFor="turnitinSearchCrossref" className="text-sm">
                              Crossref
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="turnitinSearchCrossrefPosted"
                              checked={settings.turnitinSearchCrossrefPosted}
                              onCheckedChange={(checked) => handleInputChange('turnitinSearchCrossrefPosted', !!checked)}
                            />
                            <Label htmlFor="turnitinSearchCrossrefPosted" className="text-sm">
                              Crossref Posted Content
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="turnitinSearchSubmittedWork"
                              checked={settings.turnitinSearchSubmittedWork}
                              onCheckedChange={(checked) => handleInputChange('turnitinSearchSubmittedWork', !!checked)}
                            />
                            <Label htmlFor="turnitinSearchSubmittedWork" className="text-sm">
                              Submitted Work
                            </Label>
                          </div>
                        </div>
                      </div>

                      <Separator />

                      {/* Visibility Settings */}
                      <div>
                        <Label className="text-sm font-medium">Visibility Settings:</Label>
                        <div className="mt-2 space-y-2">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="turnitinShowSourceText"
                              checked={settings.turnitinShowSourceText}
                              onCheckedChange={(checked) => handleInputChange('turnitinShowSourceText', !!checked)}
                            />
                            <Label htmlFor="turnitinShowSourceText" className="text-sm">
                              Source Text
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="turnitinShowMatchDetail"
                              checked={settings.turnitinShowMatchDetail}
                              onCheckedChange={(checked) => handleInputChange('turnitinShowMatchDetail', !!checked)}
                            />
                            <Label htmlFor="turnitinShowMatchDetail" className="text-sm">
                              Match Detail
                            </Label>
                          </div>
                        </div>
                      </div>

                      <Separator />

                      {/* Further Settings */}
                      <div>
                        <Label className="text-sm font-medium">Further Settings:</Label>
                        <div className="mt-2 space-y-2">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="turnitinAnonymiseSubmissions"
                              checked={settings.turnitinAnonymiseSubmissions}
                              onCheckedChange={(checked) => handleInputChange('turnitinAnonymiseSubmissions', !!checked)}
                            />
                            <Label htmlFor="turnitinAnonymiseSubmissions" className="text-sm">
                              Anonymise submissions ?
                            </Label>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Save Button */}
                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      disabled={saveSettingsMutation.isPending}
                      className="inline-flex items-center"
                    >
                      <Save className="mr-2" size={16} />
                      {saveSettingsMutation.isPending ? 'Saving...' : 'Save Settings'}
                    </Button>
                  </div>
                </div>
                </form>
              )}

              {/* Email Templates Content */}
              {activeTab === "email-templates" && (
                <EmailTemplatesTab />
              )}

              {/* Instruction Sets Content */}
              {activeTab === "instructions" && (
                <InstructionSetsTab />
              )}

              {/* Course Management Content */}
              {activeTab === "courses" && (
                <HierarchicalCourseManagement />
              )}

              {/* Marking Settings Content */}
              {activeTab === "marking-settings" && (
                <MarkingSettingsTab />
              )}

              {/* User Management Content */}
              {activeTab === "users" && (
                <div className="space-y-6">
                  {/* User Statistics */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card>
                      <CardContent className="pt-6">
                        <div className="flex items-center">
                          <div className="flex-shrink-0">
                            <Users className="text-primary" size={24} />
                          </div>
                          <div className="ml-4">
                            <p className="text-sm font-medium text-gray-500">Total Users</p>
                            <p className="text-2xl font-bold text-gray-900">{statsData?.total || 0}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="pt-6">
                        <div className="flex items-center">
                          <div className="flex-shrink-0">
                            <GraduationCap className="text-blue-500" size={24} />
                          </div>
                          <div className="ml-4">
                            <p className="text-sm font-medium text-gray-500">Students</p>
                            <p className="text-2xl font-bold text-gray-900">{statsData?.students || 0}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="pt-6">
                        <div className="flex items-center">
                          <div className="flex-shrink-0">
                            <Presentation className="text-green-500" size={24} />
                          </div>
                          <div className="ml-4">
                            <p className="text-sm font-medium text-gray-500">Instructors</p>
                            <p className="text-2xl font-bold text-gray-900">{statsData?.instructors || 0}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="pt-6">
                        <div className="flex items-center">
                          <div className="flex-shrink-0">
                            <Shield className="text-purple-500" size={24} />
                          </div>
                          <div className="ml-4">
                            <p className="text-sm font-medium text-gray-500">Admins</p>
                            <p className="text-2xl font-bold text-gray-900">{statsData?.admins || 0}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Add User Button */}
                  <div className="flex justify-end">
                    <Button
                      onClick={() => setIsAddUserModalOpen(true)}
                      className="inline-flex items-center"
                    >
                      <Plus className="mr-2" size={16} />
                      Add New User
                    </Button>
                  </div>

                  {/* User Management Table */}
                  <UserManagementTable onEditUser={handleEditUser} />
                </div>
              )}
            </div>
          </div>

          {/* Add/Edit User Modal */}
          <AddUserModal
            open={isAddUserModalOpen}
            onOpenChange={handleCloseModal}
            editingUser={editingUser}
          />

          {/* LTI URL Generator Modal */}
          <Dialog open={showLtiUrlGenerator} onOpenChange={(open) => {
            setShowLtiUrlGenerator(open);
            if (!open) {
              // Reset all state when modal closes
              setSelectedAssessmentForUrl('');
              setSelectedInstructionSetForUrl('');
              setGeneratedLtiUrl('');
              setCustomParameters([{ key: 'custom_action', value: 'exercise_attempt' }]);
            }
          }}>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle className="flex items-center">
                  <Zap className="mr-2" size={20} />
                  Generate LTI Tool URL
                </DialogTitle>
                <DialogDescription>
                  Create a custom LTI Tool URL with specific assessment and instruction set parameters for your ThoughtIndustries LMS.
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-6 py-4">
                {/* Assessment Selection */}
                <div className="space-y-2">
                  <Label htmlFor="assessment-select">Select Assessment</Label>
                  <Select 
                    value={selectedAssessmentForUrl} 
                    onValueChange={setSelectedAssessmentForUrl}
                  >
                    <SelectTrigger data-testid="select-assessment">
                      <SelectValue placeholder="Choose an assessment..." />
                    </SelectTrigger>
                    <SelectContent>
                      {allAssessments.map((assessment) => (
                        <SelectItem key={assessment.id} value={assessment.code}>
                          {assessment.name} ({assessment.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500">
                    This will be used as the 'cas' (Custom Assessment Code) parameter in the LTI URL.
                  </p>
                </div>

                {/* Instruction Set Selection */}
                <div className="space-y-2">
                  <Label htmlFor="instruction-set-select">Select Instruction Set</Label>
                  <Select 
                    value={selectedInstructionSetForUrl} 
                    onValueChange={setSelectedInstructionSetForUrl}
                  >
                    <SelectTrigger data-testid="select-instruction-set">
                      <SelectValue placeholder="Choose an instruction set..." />
                    </SelectTrigger>
                    <SelectContent>
                      {sets.map((instructionSet) => (
                        <SelectItem key={instructionSet.id} value={instructionSet.instructionSetCode || instructionSet.slug}>
                          {instructionSet.name} ({instructionSet.instructionSetCode || instructionSet.slug})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500">
                    This will be used as the 'cis' (Custom Instruction Set) parameter in the LTI URL.
                  </p>
                </div>

                {/* Custom Parameters Section */}
                <div className="space-y-2">
                  <Label>Additional Parameters</Label>
                  <div className="space-y-2">
                    {customParameters.map((param, index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <div className="flex-1">
                          <Input
                            placeholder="Key"
                            value={param.key}
                            onChange={(e) => {
                              const newParams = [...customParameters];
                              newParams[index].key = e.target.value;
                              setCustomParameters(newParams);
                            }}
                            className="text-sm"
                            data-testid={`input-param-key-${index}`}
                          />
                        </div>
                        <div className="flex-1">
                          <Input
                            placeholder="Value"
                            value={param.value}
                            onChange={(e) => {
                              const newParams = [...customParameters];
                              newParams[index].value = e.target.value;
                              setCustomParameters(newParams);
                            }}
                            className="text-sm"
                            data-testid={`input-param-value-${index}`}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setCustomParameters([...customParameters, { key: '', value: '' }]);
                          }}
                          className="h-8 w-8 p-0 rounded-full"
                          data-testid={`button-add-param-${index}`}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const newParams = customParameters.filter((_, i) => i !== index);
                            setCustomParameters(newParams);
                          }}
                          className="h-8 w-8 p-0 rounded-full"
                          data-testid={`button-remove-param-${index}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500">
                    Add custom parameters to be included in the LTI URL. Each parameter will be appended as a query parameter.
                  </p>
                </div>

                {/* Generated URL Display */}
                {generatedLtiUrl && (
                  <div className="space-y-2">
                    <Label>Generated LTI Tool URL</Label>
                    <div className="flex space-x-2">
                      <div className="flex-1 p-3 bg-gray-50 rounded-md border">
                        <code className="text-sm break-all">{generatedLtiUrl}</code>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(generatedLtiUrl);
                          toast({
                            title: "Copied!",
                            description: "LTI URL copied to clipboard"
                          });
                        }}
                        className="flex items-center"
                        data-testid="button-copy-url"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-gray-500">
                      Copy this URL and paste it into your ThoughtIndustries LMS as the LTI Tool URL.
                    </p>
                  </div>
                )}

                {/* Generate Button */}
                <div className="flex justify-end space-x-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowLtiUrlGenerator(false);
                      setSelectedAssessmentForUrl('');
                      setSelectedInstructionSetForUrl('');
                      setGeneratedLtiUrl('');
                      setCustomParameters([{ key: 'custom_action', value: 'exercise_attempt' }]);
                    }}
                  >
                    Done!
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      if (selectedAssessmentForUrl && selectedInstructionSetForUrl) {
                        const baseUrl = `${window.location.origin}/api/lti/launch`;
                        const params = new URLSearchParams({
                          cas: selectedAssessmentForUrl,
                          cis: selectedInstructionSetForUrl
                        });
                        
                        // Add custom parameters
                        customParameters.forEach(param => {
                          if (param.key.trim() && param.value.trim()) {
                            params.append(param.key.trim(), param.value.trim());
                          }
                        });
                        
                        const fullUrl = `${baseUrl}?${params.toString()}`;
                        setGeneratedLtiUrl(fullUrl);
                      }
                    }}
                    disabled={!selectedAssessmentForUrl || !selectedInstructionSetForUrl}
                    data-testid="button-generate-url"
                  >
                    Generate URL
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
  );
}
