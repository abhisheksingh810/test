import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import {
  Clock,
  User,
  AlertCircle,
  CheckCircle2,
  Pause,
  SkipForward,
  Users,
  Eye,
  UserPlus,
  UserMinus,
  Settings2,
  X,
  Filter,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
} from "lucide-react";
import { format } from "date-fns";

interface AssignmentSubmission {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  submittedAt: string;
  fileCount: number;
  contextTitle: string;
  customAssessmentCode: string;
  consumerName: string;
  attemptNumber: number;
}

interface MarkingAssignment {
  id: string;
  submissionId: string;
  assignedMarkerId: string;
  markingStatus:
    | "waiting"
    | "being_marked"
    | "on_hold"
    | "approval_needed"
    | "marking_skipped"
    | "released";
  assignedAt: string;
  statusUpdatedAt: string;
  notes: string;
  priority: number;
  dueDate: string | null;
  submission: AssignmentSubmission;
  turnitinStatus?: string;
  assignedMarker?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  grade?: {
    finalGrade: string | null;
    percentageScore: number | null;
    totalMarksAwarded: number | null;
    totalMarksPossible: number | null;
  } | null;
  malpracticeLevel?: {
    id: string;
    levelText: string;
  } | null;
  skipReason?: {
    id: string;
    reasonText: string;
  } | null;
}

const statusColors = {
  waiting: "bg-yellow-100 text-yellow-800 border-yellow-200",
  being_marked: "bg-blue-100 text-blue-800 border-blue-200",
  on_hold: "bg-orange-100 text-orange-800 border-orange-200",
  approval_needed: "bg-purple-100 text-purple-800 border-purple-200",
  marking_skipped: "bg-red-100 text-red-700 border-red-200",
  released: "bg-green-100 text-green-800 border-green-200",
};

const statusIcons = {
  waiting: Clock,
  being_marked: Eye,
  on_hold: Pause,
  approval_needed: AlertCircle,
  marking_skipped: SkipForward,
  released: CheckCircle2,
};

const statusLabels = {
  waiting: "Waiting",
  being_marked: "Being Marked",
  on_hold: "On Hold",
  approval_needed: "Approval Needed",
  marking_skipped: "Marking Skipped",
  released: "Released",
};

export default function Marking() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
  
  // Define available tabs based on user role
  const availableTabs = isAdmin
    ? [
        { value: "all", label: "All", testId: "tab-all" },
        { value: "waiting", label: "Waiting", testId: "tab-waiting" },
        { value: "being_marked", label: "Being Marked", testId: "tab-being-marked" },
        { value: "on_hold", label: "On Hold", testId: "tab-on-hold" },
        { value: "approval_needed", label: "Approval Needed", testId: "tab-approval-needed" },
        { value: "marking_skipped", label: "Skipped", testId: "tab-marking-skipped" },
        { value: "released", label: "Released", testId: "tab-released" },
      ]
    : [
        { value: "being_marked", label: "Being Marked", testId: "tab-being-marked" },
        { value: "on_hold", label: "On Hold", testId: "tab-on-hold" },
        { value: "approval_needed", label: "Approval Needed", testId: "tab-approval-needed" },
      ];

  const [selectedStatus, setSelectedStatus] = useState<string>("being_marked");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedAssignment, setSelectedAssignment] =
    useState<MarkingAssignment | null>(null);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<string>("");
  const [statusNotes, setStatusNotes] = useState<string>("");
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string>("");
  const [selectedSubmissions, setSelectedSubmissions] = useState<Set<string>>(
    new Set(),
  );
  const [bulkAssignDialogOpen, setBulkAssignDialogOpen] = useState(false);
  const [bulkSelectedMarkerId, setBulkSelectedMarkerId] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 20;
  
  // Track if role-based default has been initialized
  const roleInitializedRef = useRef(false);

  // Column visibility state
  const [visibleColumns, setVisibleColumns] = useState({
    submittedTime: true,
    studentName: true,
    course: true,
    assessment: true,
    attempt: true,
    assignedTo: true,
    malpractice: true,
    skippedReason: true,
    overallGrade: true,
    turnitinStatus: true,
    markingStatus: true,
  });

  // Column filters state
  const [columnFilters, setColumnFilters] = useState({
    submittedTime: "",
    studentName: "",
    course: "",
    assessment: "",
    attempt: "",
    assignedTo: "",
    malpractice: "",
    skippedReason: "",
    overallGrade: "",
  });

  // Set correct default tab when user role is first determined
  useEffect(() => {
    if (user && !roleInitializedRef.current) {
      const correctDefaultTab = isAdmin ? "all" : "being_marked";
      setSelectedStatus(correctDefaultTab);
      roleInitializedRef.current = true;
    }
  }, [user, isAdmin]);

  // Fetch marking assignments (server-side filtering by status) with offset pagination
  const { data: assignmentsData, isLoading } = useQuery({
    queryKey: ["/api/marking/assignments/offset", selectedStatus, currentPage],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        page: currentPage.toString(),
      });
      
      // Add status filter (only if not "all")
      if (selectedStatus !== "all") {
        params.append("status", selectedStatus);
      }
      
      const response = await fetch(`/api/marking/assignments/offset?${params}`);
      if (!response.ok) throw new Error("Failed to fetch assignments");
      const data = await response.json();
      return data;
    },
  });

  const allAssignments = assignmentsData?.assignments || [];
  const pagination = assignmentsData?.pagination || { total: 0, page: 1, totalPages: 1, limit: pageSize };

  // Reset to page 1 when switching tabs or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedStatus, searchQuery, JSON.stringify(columnFilters)]);

  // Filter assignments based on search query and column filters (status filtering is now done server-side)
  const assignments = allAssignments.filter((assignment: MarkingAssignment) => {
    // Filter by search query (student name or email)
    const searchMatch =
      !searchQuery ||
      `${assignment.submission.firstName} ${assignment.submission.lastName}`
        .toLowerCase()
        .includes(searchQuery.toLowerCase()) ||
      (assignment.submission.email &&
        assignment.submission.email
          .toLowerCase()
          .includes(searchQuery.toLowerCase()));

    // Column filters
    const studentNameMatch =
      !columnFilters.studentName ||
      `${assignment.submission.firstName} ${assignment.submission.lastName}`
        .toLowerCase()
        .includes(columnFilters.studentName.toLowerCase());

    const courseMatch =
      !columnFilters.course ||
      (assignment.submission.contextTitle || "")
        .toLowerCase()
        .includes(columnFilters.course.toLowerCase());

    const assessmentMatch =
      !columnFilters.assessment ||
      (assignment.submission.customAssessmentCode || "")
        .toLowerCase()
        .includes(columnFilters.assessment.toLowerCase());

    const attemptMatch =
      !columnFilters.attempt ||
      (assignment.submission.attemptNumber?.toString() || "").includes(
        columnFilters.attempt,
      );

    const assignedToMatch =
      !columnFilters.assignedTo ||
      (assignment.assignedMarker
        ? `${assignment.assignedMarker.firstName} ${assignment.assignedMarker.lastName} ${assignment.assignedMarker.email}`
            .toLowerCase()
            .includes(columnFilters.assignedTo.toLowerCase())
        : "unassigned".includes(columnFilters.assignedTo.toLowerCase()));

    const malpracticeMatch =
      !columnFilters.malpractice ||
      (assignment.malpracticeLevel?.levelText || "")
        .toLowerCase()
        .includes(columnFilters.malpractice.toLowerCase());

    const skippedReasonMatch =
      !columnFilters.skippedReason ||
      (assignment.skipReason?.reasonText || "")
        .toLowerCase()
        .includes(columnFilters.skippedReason.toLowerCase());

    const overallGradeMatch =
      !columnFilters.overallGrade ||
      (assignment.grade?.finalGrade || "")
        .toLowerCase()
        .includes(columnFilters.overallGrade.toLowerCase());

    return (
      searchMatch &&
      studentNameMatch &&
      courseMatch &&
      assessmentMatch &&
      attemptMatch &&
      assignedToMatch &&
      malpracticeMatch &&
      skippedReasonMatch &&
      overallGradeMatch
    );
  });

  // Fetch users for assignment (admins only)
  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ["/api/users"],
    queryFn: async () => {
      if (!isAdmin) return [];
      const response = await fetch("/api/users?limit=100");
      if (!response.ok) throw new Error("Failed to fetch users");
      const data = await response.json();
      console.log("Fetched users:", data.users);
      const filteredUsers = data.users.filter((u: any) => u.role === "marker");
      console.log("Filtered users:", filteredUsers);
      return filteredUsers;
    },
    enabled: isAdmin,
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({
      submissionId,
      status,
      notes,
    }: {
      submissionId: string;
      status: string;
      notes?: string;
    }) => {
      const response = await fetch(
        `/api/marking/assignments/${submissionId}/status`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status, notes }),
        },
      );
      if (!response.ok) throw new Error("Failed to update status");
      return response.json();
    },
    onMutate: async ({ submissionId, status: newStatus }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ 
        predicate: (query) => query.queryKey[0] === "/api/marking/assignments"
      });

      // Get the old status from the selected assignment
      const oldStatus = selectedAssignment?.markingStatus || selectedStatus;

      // Optimistically remove from current status list
      queryClient.setQueriesData(
        { predicate: (query) => query.queryKey[0] === "/api/marking/assignments" && query.queryKey[1] === oldStatus },
        (oldData: any) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            assignments: oldData.assignments?.filter(
              (assignment: MarkingAssignment) => assignment.submissionId !== submissionId
            ) || [],
          };
        }
      );

      // Return context for rollback
      return { oldStatus };
    },
    onSuccess: (data, variables, context) => {
      // Invalidate all marking assignment queries to refetch with updated data
      queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === "/api/marking/assignments"
      });
      toast({
        title: "Success",
        description: "Assignment status updated successfully",
      });
      setStatusDialogOpen(false);
      setSelectedAssignment(null);
    },
    onError: (error: any, variables, context) => {
      // Rollback optimistic update on error
      if (context?.oldStatus) {
        queryClient.invalidateQueries({ 
          predicate: (query) => query.queryKey[0] === "/api/marking/assignments"
        });
      }
      toast({
        title: "Error",
        description: error.message || "Failed to update status",
        variant: "destructive",
      });
    },
  });

  // Assign marker mutation (admin only)
  const assignMarkerMutation = useMutation({
    mutationFn: async ({
      submissionId,
      markerId,
    }: {
      submissionId: string;
      markerId: string;
    }) => {
      const response = await fetch(
        `/api/marking/assignments/${submissionId}/assign`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ markerId }),
        },
      );
      if (!response.ok) throw new Error("Failed to assign marker");
      return response.json();
    },
    onMutate: async ({ submissionId }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ 
        predicate: (query) => query.queryKey[0] === "/api/marking/assignments"
      });

      // Get the old status from the selected assignment or current tab
      const oldStatus = selectedAssignment?.markingStatus || selectedStatus;

      // Optimistically remove from current status list (likely "waiting")
      queryClient.setQueriesData(
        { predicate: (query) => query.queryKey[0] === "/api/marking/assignments" && query.queryKey[1] === oldStatus },
        (oldData: any) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            assignments: oldData.assignments?.filter(
              (assignment: MarkingAssignment) => assignment.submissionId !== submissionId
            ) || [],
          };
        }
      );

      // Return context for rollback
      return { oldStatus };
    },
    onSuccess: () => {
      // Invalidate all marking assignment queries to refetch with updated data
      // The item will now appear in "being_marked" status
      queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === "/api/marking/assignments"
      });
      toast({ title: "Success", description: "Marker assigned successfully" });
      setAssignDialogOpen(false);
      setSelectedAssignment(null);
    },
    onError: (error: any, variables, context) => {
      // Rollback optimistic update on error
      if (context?.oldStatus) {
        queryClient.invalidateQueries({ 
          predicate: (query) => query.queryKey[0] === "/api/marking/assignments"
        });
      }
      toast({
        title: "Error",
        description: error.message || "Failed to assign marker",
        variant: "destructive",
      });
    },
  });

  // Unassign marker mutation (admin only)
  const unassignMarkerMutation = useMutation({
    mutationFn: async (submissionId: string) => {
      const response = await fetch(
        `/api/marking/assignments/${submissionId}/unassign`,
        {
          method: "DELETE",
        },
      );
      if (!response.ok) throw new Error("Failed to unassign marker");
      return response.json();
    },
    onMutate: async (submissionId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ 
        predicate: (query) => query.queryKey[0] === "/api/marking/assignments"
      });

      // Get the old status from the selected assignment or current tab
      const oldStatus = selectedAssignment?.markingStatus || selectedStatus;

      // Optimistically remove from current status list (likely "being_marked")
      queryClient.setQueriesData(
        { predicate: (query) => query.queryKey[0] === "/api/marking/assignments" && query.queryKey[1] === oldStatus },
        (oldData: any) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            assignments: oldData.assignments?.filter(
              (assignment: MarkingAssignment) => assignment.submissionId !== submissionId
            ) || [],
          };
        }
      );

      // Return context for rollback
      return { oldStatus };
    },
    onSuccess: () => {
      // Invalidate all marking assignment queries to refetch with updated data
      // The item will now appear in "waiting" status
      queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === "/api/marking/assignments"
      });
      toast({
        title: "Success",
        description: "Marker unassigned successfully",
      });
      setAssignDialogOpen(false);
      setSelectedAssignment(null);
    },
    onError: (error: any, variables, context) => {
      // Rollback optimistic update on error
      if (context?.oldStatus) {
        queryClient.invalidateQueries({ 
          predicate: (query) => query.queryKey[0] === "/api/marking/assignments"
        });
      }
      toast({
        title: "Error",
        description: error.message || "Failed to unassign marker",
        variant: "destructive",
      });
    },
  });

  // Bulk assign marker mutation (admin only)
  const bulkAssignMarkerMutation = useMutation({
    mutationFn: async ({
      submissionIds,
      markerId,
    }: {
      submissionIds: string[];
      markerId: string;
    }) => {
      const response = await fetch("/api/marking/assignments/bulk-assign", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ submissionIds, markerId }),
      });
      if (!response.ok) throw new Error("Failed to bulk assign marker");
      return response.json();
    },
    onMutate: async ({ submissionIds }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ 
        predicate: (query) => query.queryKey[0] === "/api/marking/assignments"
      });

      // Optimistically remove from current status list
      queryClient.setQueriesData(
        { predicate: (query) => query.queryKey[0] === "/api/marking/assignments" && query.queryKey[1] === selectedStatus },
        (oldData: any) => {
          if (!oldData) return oldData;
          const submissionIdsSet = new Set(submissionIds);
          return {
            ...oldData,
            assignments: oldData.assignments?.filter(
              (assignment: MarkingAssignment) => !submissionIdsSet.has(assignment.submissionId)
            ) || [],
          };
        }
      );

      // Return context for rollback
      return { selectedStatus };
    },
    onSuccess: (data) => {
      // Invalidate all marking assignment queries to refetch with updated data
      queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === "/api/marking/assignments"
      });
      toast({
        title: "Success",
        description: `Successfully assigned ${data.assignedCount} submissions to marker`,
      });
      setBulkAssignDialogOpen(false);
      setSelectedSubmissions(new Set());
      setBulkSelectedMarkerId("");
    },
    onError: (error: any, variables, context) => {
      // Rollback optimistic update on error
      if (context?.selectedStatus) {
        queryClient.invalidateQueries({ 
          predicate: (query) => query.queryKey[0] === "/api/marking/assignments"
        });
      }
      toast({
        title: "Error",
        description: error.message || "Failed to bulk assign marker",
        variant: "destructive",
      });
    },
  });

  // Bulk unassign marker mutation (admin only)
  const bulkUnassignMarkerMutation = useMutation({
    mutationFn: async (submissionIds: string[]) => {
      const response = await fetch("/api/marking/assignments/bulk-unassign", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ submissionIds }),
      });
      if (!response.ok) throw new Error("Failed to bulk unassign marker");
      return response.json();
    },
    onMutate: async (submissionIds) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ 
        predicate: (query) => query.queryKey[0] === "/api/marking/assignments"
      });

      // Optimistically remove from current status list
      queryClient.setQueriesData(
        { predicate: (query) => query.queryKey[0] === "/api/marking/assignments" && query.queryKey[1] === selectedStatus },
        (oldData: any) => {
          if (!oldData) return oldData;
          const submissionIdsSet = new Set(submissionIds);
          return {
            ...oldData,
            assignments: oldData.assignments?.filter(
              (assignment: MarkingAssignment) => !submissionIdsSet.has(assignment.submissionId)
            ) || [],
          };
        }
      );

      // Return context for rollback
      return { selectedStatus };
    },
    onSuccess: (data) => {
      // Invalidate all marking assignment queries to refetch with updated data
      queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === "/api/marking/assignments"
      });
      toast({
        title: "Success",
        description: `Successfully unassigned ${data.unassignedCount} submissions`,
      });
      setSelectedSubmissions(new Set());
    },
    onError: (error: any, variables, context) => {
      // Rollback optimistic update on error
      if (context?.selectedStatus) {
        queryClient.invalidateQueries({ 
          predicate: (query) => query.queryKey[0] === "/api/marking/assignments"
        });
      }
      toast({
        title: "Error",
        description: error.message || "Failed to bulk unassign marker",
        variant: "destructive",
      });
    },
  });

  // Bulk approve submissions mutation (admin only)
  const bulkApproveSubmissionsMutation = useMutation({
    mutationFn: async (submissionIds: string[]) => {
      const response = await fetch("/api/marking/assignments/bulk-approve", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ submissionIds }),
      });
      if (!response.ok) throw new Error("Failed to bulk approve submissions");
      return response.json();
    },
    onSuccess: (data) => {
      // Invalidate all marking assignment queries (for all status tabs)
      queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === "/api/marking/assignments"
      });
      toast({
        title: "Success",
        description:
          data.message ||
          `Successfully approved ${data.approvedCount} submissions`,
      });
      setSelectedSubmissions(new Set());
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to bulk approve submissions",
        variant: "destructive",
      });
    },
  });

  const handleStatusChange = () => {
    if (selectedAssignment && newStatus) {
      updateStatusMutation.mutate({
        submissionId: selectedAssignment.submissionId,
        status: newStatus,
        notes: statusNotes,
      });
    }
  };

  const handleAssignMarker = () => {
    if (selectedAssignment && selectedMarkerId) {
      assignMarkerMutation.mutate({
        submissionId: selectedAssignment.submissionId,
        markerId: selectedMarkerId,
      });
    }
  };

  const handleUnassignMarker = () => {
    if (selectedAssignment) {
      unassignMarkerMutation.mutate(selectedAssignment.submissionId);
    }
  };

  const handleBulkAssignMarker = () => {
    if (selectedSubmissions.size > 0 && bulkSelectedMarkerId) {
      const submissionIds = Array.from(selectedSubmissions);
      bulkAssignMarkerMutation.mutate({
        submissionIds,
        markerId: bulkSelectedMarkerId,
      });
    }
  };

  const handleBulkUnassignMarker = () => {
    if (selectedSubmissions.size > 0) {
      if (
        confirm(
          `Are you sure you want to unassign ${selectedSubmissions.size} submission${selectedSubmissions.size !== 1 ? "s" : ""}?`,
        )
      ) {
        const submissionIds = Array.from(selectedSubmissions);
        bulkUnassignMarkerMutation.mutate(submissionIds);
      }
    }
  };

  const handleBulkApproveSubmissions = () => {
    if (selectedSubmissions.size > 0) {
      if (
        confirm(
          `Are you sure you want to approve and release ${selectedSubmissions.size} submission${selectedSubmissions.size !== 1 ? "s" : ""}? This will change their status to "Released" and make the results available.`,
        )
      ) {
        const submissionIds = Array.from(selectedSubmissions);
        bulkApproveSubmissionsMutation.mutate(submissionIds);
      }
    }
  };

  const handleExportReleased = async () => {
    try {
      const response = await fetch("/api/marking/assignments/export-released", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to export released submissions");
      }

      // Create a blob from the response and trigger download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `released-submissions-${format(new Date(), "yyyy-MM-dd")}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Success",
        description: "Released submissions exported successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to export released submissions",
        variant: "destructive",
      });
    }
  };

  const handleSelectAllSubmissions = (checked: boolean) => {
    if (checked) {
      const allSubmissionIds = new Set<string>(
        assignments.map(
          (assignment: MarkingAssignment) => assignment.submissionId,
        ),
      );
      setSelectedSubmissions(allSubmissionIds);
    } else {
      setSelectedSubmissions(new Set());
    }
  };

  const handleSelectSubmission = (submissionId: string, checked: boolean) => {
    const newSelected = new Set(selectedSubmissions);
    if (checked) {
      newSelected.add(submissionId);
    } else {
      newSelected.delete(submissionId);
    }
    setSelectedSubmissions(newSelected);
  };

  const openBulkAssignDialog = () => {
    setBulkSelectedMarkerId("");
    setBulkAssignDialogOpen(true);
  };

  const openStatusDialog = (assignment: MarkingAssignment) => {
    setSelectedAssignment(assignment);
    setNewStatus(assignment.markingStatus);
    setStatusNotes(assignment.notes || "");
    setStatusDialogOpen(true);
  };

  const openAssignDialog = (assignment: MarkingAssignment) => {
    setSelectedAssignment(assignment);
    setSelectedMarkerId(assignment.assignedMarkerId || "");
    setAssignDialogOpen(true);
  };

  const openSubmissionDetails = (submissionId: string) => {
    setLocation(`/submissions/${submissionId}`);
  };

  const openMarkingBuddy = (submissionId: string) => {
    const markingBuddyUrl = import.meta.env.VITE_APP_MARKING_BUDDY_URL;
    if (!markingBuddyUrl) {
      toast({
        title: "Configuration Error",
        description: "Marking buddy URL is not configured",
        variant: "destructive",
      });
      return;
    }
    const url = new URL(markingBuddyUrl+'/mark-submission');
    url.searchParams.set("submissionId", submissionId);
    window.open(url.toString(), "_blank");
  };

  const getStatusBadge = (status: string) => {
    const Icon = statusIcons[status as keyof typeof statusIcons] || Clock;
    return (
      <Badge
        className={
          statusColors[status as keyof typeof statusColors] ||
          statusColors.waiting
        }
      >
        <Icon className="w-3 h-3 mr-1" />
        {statusLabels[status as keyof typeof statusLabels] || status}
      </Badge>
    );
  };

  const getTurnitinStatusBadge = (status?: string) => {
    switch (status) {
      case "pending":
        return (
          <Badge variant="secondary" className="text-yellow-700 bg-yellow-100">
            Pending
          </Badge>
        );
      case "processing":
        return (
          <Badge variant="secondary" className="text-blue-700 bg-blue-100">
            Processing
          </Badge>
        );
      case "complete":
        return (
          <Badge variant="secondary" className="text-green-700 bg-green-100">
            Complete
          </Badge>
        );
      case "error":
        return <Badge variant="destructive">Error</Badge>;
      case "not_submitted":
      default:
        return <Badge variant="outline">Not Checked</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="w-full p-6">
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="pt-6">
                <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full p-6" data-testid="marking-page">
      <div className="mb-6">
        <h1
          className="text-3xl font-bold text-gray-900 mb-2"
          data-testid="page-title"
        >
          Marking Dashboard
        </h1>
        <p className="text-gray-600">
          Manage and track learner submission assignments
        </p>
      </div>

      {/* Search Controls */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Search Students</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="w-full max-w-md">
            <Label htmlFor="student-search">
              Search by student name or email
            </Label>
            <Input
              id="student-search"
              type="text"
              placeholder="Enter student name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="student-search-input"
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* Assignments Tabs */}
      <Tabs
        value={selectedStatus}
        onValueChange={setSelectedStatus}
        className="w-full"
      >
        <TabsList 
          className={`grid w-full ${isAdmin ? 'grid-cols-7' : 'grid-cols-3'}`} 
          data-testid="status-tabs"
        >
          {availableTabs.map((tab) => (
            <TabsTrigger 
              key={tab.value} 
              value={tab.value} 
              data-testid={tab.testId}
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={selectedStatus} className="mt-6">
          {/* Filters and Column Controls */}
          <Card className="mb-4">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">
                  Filters & Column Settings
                </CardTitle>
                <div className="flex gap-2">
                  {/* Clear Filters Button */}
                  {Object.values(columnFilters).some((v) => v !== "") && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setColumnFilters({
                          submittedTime: "",
                          studentName: "",
                          course: "",
                          assessment: "",
                          attempt: "",
                          assignedTo: "",
                          malpractice: "",
                          skippedReason: "",
                          overallGrade: "",
                        })
                      }
                      data-testid="clear-filters-button"
                    >
                      <X className="w-4 h-4 mr-1" />
                      Clear Filters
                    </Button>
                  )}

                  {/* Export Released Submissions Button */}
                  {(user?.role === "admin" || user?.role === "superadmin") &&
                    selectedStatus === "released" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportReleased}
                        data-testid="export-released-button"
                      >
                        <Download className="w-4 h-4 mr-1" />
                        Export CSV
                      </Button>
                    )}

                  {/* Column Visibility Popover */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid="column-visibility-button"
                      >
                        <Settings2 className="w-4 h-4 mr-1" />
                        Columns
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-80"
                      data-testid="column-visibility-popover"
                    >
                      <div className="space-y-4">
                        <h4 className="font-medium text-sm">Toggle Columns</h4>
                        <div className="space-y-2">
                          {Object.entries(visibleColumns).map(
                            ([key, value]) => (
                              <div
                                key={key}
                                className="flex items-center space-x-2"
                              >
                                <Checkbox
                                  id={`column-${key}`}
                                  checked={value}
                                  onCheckedChange={(checked) =>
                                    setVisibleColumns((prev) => ({
                                      ...prev,
                                      [key]: checked as boolean,
                                    }))
                                  }
                                  data-testid={`column-toggle-${key}`}
                                />
                                <Label
                                  htmlFor={`column-${key}`}
                                  className="text-sm cursor-pointer"
                                >
                                  {key === "submittedTime"
                                    ? "Submitted Time"
                                    : key === "studentName"
                                      ? "Student Name"
                                      : key === "course"
                                        ? "Course"
                                        : key === "assessment"
                                          ? "Assessment"
                                          : key === "attempt"
                                            ? "Attempt"
                                            : key === "assignedTo"
                                              ? "Assigned To"
                                              : key === "malpractice"
                                                ? "Malpractice"
                                                : key === "skippedReason"
                                                  ? "Skipped Reason"
                                                  : key === "overallGrade"
                                                    ? "Overall Grade"
                                                    : key === "turnitinStatus"
                                                      ? "Turnitin Status"
                                                      : key === "markingStatus"
                                                        ? "Marking Status"
                                                        : key}
                                </Label>
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {visibleColumns.studentName && (
                  <div>
                    <Label htmlFor="filter-studentName" className="text-xs">
                      Student Name
                    </Label>
                    <Input
                      id="filter-studentName"
                      placeholder="Filter..."
                      value={columnFilters.studentName}
                      onChange={(e) =>
                        setColumnFilters((prev) => ({
                          ...prev,
                          studentName: e.target.value,
                        }))
                      }
                      data-testid="filter-studentName"
                      className="h-8 text-sm"
                    />
                  </div>
                )}
                {visibleColumns.course && (
                  <div>
                    <Label htmlFor="filter-course" className="text-xs">
                      Course
                    </Label>
                    <Input
                      id="filter-course"
                      placeholder="Filter..."
                      value={columnFilters.course}
                      onChange={(e) =>
                        setColumnFilters((prev) => ({
                          ...prev,
                          course: e.target.value,
                        }))
                      }
                      data-testid="filter-course"
                      className="h-8 text-sm"
                    />
                  </div>
                )}
                {visibleColumns.assessment && (
                  <div>
                    <Label htmlFor="filter-assessment" className="text-xs">
                      Assessment
                    </Label>
                    <Input
                      id="filter-assessment"
                      placeholder="Filter..."
                      value={columnFilters.assessment}
                      onChange={(e) =>
                        setColumnFilters((prev) => ({
                          ...prev,
                          assessment: e.target.value,
                        }))
                      }
                      data-testid="filter-assessment"
                      className="h-8 text-sm"
                    />
                  </div>
                )}
                {visibleColumns.attempt && (
                  <div>
                    <Label htmlFor="filter-attempt" className="text-xs">
                      Attempt
                    </Label>
                    <Input
                      id="filter-attempt"
                      placeholder="Filter..."
                      value={columnFilters.attempt}
                      onChange={(e) =>
                        setColumnFilters((prev) => ({
                          ...prev,
                          attempt: e.target.value,
                        }))
                      }
                      data-testid="filter-attempt"
                      className="h-8 text-sm"
                    />
                  </div>
                )}
                {visibleColumns.assignedTo && (
                  <div>
                    <Label htmlFor="filter-assignedTo" className="text-xs">
                      Assigned To
                    </Label>
                    <Input
                      id="filter-assignedTo"
                      placeholder="Filter..."
                      value={columnFilters.assignedTo}
                      onChange={(e) =>
                        setColumnFilters((prev) => ({
                          ...prev,
                          assignedTo: e.target.value,
                        }))
                      }
                      data-testid="filter-assignedTo"
                      className="h-8 text-sm"
                    />
                  </div>
                )}
                {visibleColumns.malpractice && (
                  <div>
                    <Label htmlFor="filter-malpractice" className="text-xs">
                      Malpractice
                    </Label>
                    <Input
                      id="filter-malpractice"
                      placeholder="Filter..."
                      value={columnFilters.malpractice}
                      onChange={(e) =>
                        setColumnFilters((prev) => ({
                          ...prev,
                          malpractice: e.target.value,
                        }))
                      }
                      data-testid="filter-malpractice"
                      className="h-8 text-sm"
                    />
                  </div>
                )}
                {visibleColumns.skippedReason && (
                  <div>
                    <Label htmlFor="filter-skippedReason" className="text-xs">
                      Skipped Reason
                    </Label>
                    <Input
                      id="filter-skippedReason"
                      placeholder="Filter..."
                      value={columnFilters.skippedReason}
                      onChange={(e) =>
                        setColumnFilters((prev) => ({
                          ...prev,
                          skippedReason: e.target.value,
                        }))
                      }
                      data-testid="filter-skippedReason"
                      className="h-8 text-sm"
                    />
                  </div>
                )}
                {visibleColumns.overallGrade && (
                  <div>
                    <Label htmlFor="filter-overallGrade" className="text-xs">
                      Overall Grade
                    </Label>
                    <Input
                      id="filter-overallGrade"
                      placeholder="Filter..."
                      value={columnFilters.overallGrade}
                      onChange={(e) =>
                        setColumnFilters((prev) => ({
                          ...prev,
                          overallGrade: e.target.value,
                        }))
                      }
                      data-testid="filter-overallGrade"
                      className="h-8 text-sm"
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Assignment Submissions</CardTitle>
                  <CardDescription>
                    {assignments.length} assignment
                    {assignments.length !== 1 ? "s" : ""} found
                  </CardDescription>
                </div>
                {/* Bulk Assignment Toolbar */}
                {isAdmin && selectedSubmissions.size > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">
                      {selectedSubmissions.size} selected
                    </span>
                    <Button
                      onClick={openBulkAssignDialog}
                      data-testid="bulk-assign-button"
                      className="h-9"
                    >
                      <UserPlus className="w-4 h-4 mr-1" />
                      Assign Marker
                    </Button>
                    <Button
                      onClick={handleBulkUnassignMarker}
                      disabled={bulkUnassignMarkerMutation.isPending}
                      data-testid="bulk-unassign-button"
                      variant="outline"
                      className="h-9"
                    >
                      <UserMinus className="w-4 h-4 mr-1" />
                      {bulkUnassignMarkerMutation.isPending
                        ? "Unassigning..."
                        : "Unassign Marker"}
                    </Button>
                    {(() => {
                      const hasApprovalNeeded = assignments.some(
                        (a: MarkingAssignment) =>
                          selectedSubmissions.has(a.submissionId) &&
                          a.markingStatus === "approval_needed",
                      );
                      return hasApprovalNeeded ? (
                        <Button
                          onClick={handleBulkApproveSubmissions}
                          disabled={bulkApproveSubmissionsMutation.isPending}
                          data-testid="bulk-approve-button"
                          className="h-9 bg-green-600 hover:bg-green-700"
                        >
                          <CheckCircle2 className="w-4 h-4 mr-1" />
                          {bulkApproveSubmissionsMutation.isPending
                            ? "Approving..."
                            : "Approve & Release"}
                        </Button>
                      ) : null;
                    })()}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {assignments.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-gray-500" data-testid="no-assignments">
                    No assignments found matching your criteria.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      {isAdmin && (
                        <TableHead className="w-12">
                          <Checkbox
                            checked={
                              assignments.length > 0 &&
                              selectedSubmissions.size === assignments.length
                            }
                            onCheckedChange={handleSelectAllSubmissions}
                            data-testid="select-all-checkbox"
                          />
                        </TableHead>
                      )}
                      {visibleColumns.submittedTime && (
                        <TableHead>Submitted Time</TableHead>
                      )}
                      {visibleColumns.studentName && (
                        <TableHead>Student Name</TableHead>
                      )}
                      {visibleColumns.course && <TableHead>Course</TableHead>}
                      {visibleColumns.assessment && (
                        <TableHead>Assessment</TableHead>
                      )}
                      {visibleColumns.attempt && <TableHead>Attempt</TableHead>}
                      {visibleColumns.assignedTo && (
                        <TableHead>Assigned To</TableHead>
                      )}
                      {visibleColumns.malpractice && (
                        <TableHead>Malpractice</TableHead>
                      )}
                      {visibleColumns.skippedReason && (
                        <TableHead>Skipped Reason</TableHead>
                      )}
                      {visibleColumns.overallGrade && (
                        <TableHead>Overall Grade</TableHead>
                      )}
                      {visibleColumns.turnitinStatus && (
                        <TableHead>Turnitin Status</TableHead>
                      )}
                      {visibleColumns.markingStatus && (
                        <TableHead>Marking Status</TableHead>
                      )}
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignments.map((assignment: MarkingAssignment) => (
                      <TableRow
                        key={assignment.id}
                        data-testid={`assignment-${assignment.id}`}
                        className="cursor-pointer hover:bg-gray-50"
                        onClick={() =>
                          openSubmissionDetails(assignment.submissionId)
                        }
                      >
                        {isAdmin && (
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedSubmissions.has(
                                assignment.submissionId,
                              )}
                              onCheckedChange={(checked) =>
                                handleSelectSubmission(
                                  assignment.submissionId,
                                  checked as boolean,
                                )
                              }
                              data-testid={`select-submission-${assignment.id}`}
                            />
                          </TableCell>
                        )}
                        {visibleColumns.submittedTime && (
                          <TableCell>
                            <div className="text-sm">
                              {format(
                                new Date(assignment.submission.submittedAt),
                                "MMM d, yyyy",
                              )}
                            </div>
                            <div className="text-xs text-gray-500">
                              {format(
                                new Date(assignment.submission.submittedAt),
                                "h:mm a",
                              )}
                            </div>
                          </TableCell>
                        )}

                        {visibleColumns.studentName && (
                          <TableCell>
                            <div>
                              <div className="font-medium">
                                {assignment.submission.firstName}{" "}
                                {assignment.submission.lastName}
                              </div>
                              <div className="text-sm text-gray-500">
                                {assignment.submission.email}
                              </div>
                            </div>
                          </TableCell>
                        )}

                        {visibleColumns.course && (
                          <TableCell>
                            <div className="text-sm">
                              {assignment.submission.contextTitle || "N/A"}
                            </div>
                          </TableCell>
                        )}

                        {visibleColumns.assessment && (
                          <TableCell>
                            <div className="font-medium">
                              {assignment.submission.customAssessmentCode ||
                                "N/A"}
                            </div>
                          </TableCell>
                        )}

                        {visibleColumns.attempt && (
                          <TableCell>
                            <div
                              className="text-sm font-medium"
                              data-testid={`attempt-number-${assignment.id}`}
                            >
                              {assignment.markingStatus === "marking_skipped"
                                ? "-"
                                : assignment.submission.attemptNumber
                                  ? `${assignment.submission.attemptNumber}/3`
                                  : "N/A"}
                            </div>
                          </TableCell>
                        )}

                        {visibleColumns.assignedTo && (
                          <TableCell>
                            {assignment.assignedMarker ? (
                              <div>
                                <div className="font-medium text-sm">
                                  {assignment.assignedMarker.firstName &&
                                  assignment.assignedMarker.lastName
                                    ? `${assignment.assignedMarker.firstName} ${assignment.assignedMarker.lastName}`
                                    : assignment.assignedMarker.email ||
                                      "Assigned User"}
                                </div>
                                {assignment.assignedMarker.firstName &&
                                  assignment.assignedMarker.lastName && (
                                    <div className="text-xs text-gray-500">
                                      {assignment.assignedMarker.email}
                                    </div>
                                  )}
                              </div>
                            ) : (
                              <span className="text-gray-400 text-sm">
                                Unassigned
                              </span>
                            )}
                          </TableCell>
                        )}

                        {visibleColumns.malpractice && (
                          <TableCell
                            data-testid={`malpractice-${assignment.id}`}
                          >
                            <div className="text-sm">
                              {assignment.malpracticeLevel?.levelText || "-"}
                            </div>
                          </TableCell>
                        )}

                        {visibleColumns.skippedReason && (
                          <TableCell
                            data-testid={`skipped-reason-${assignment.id}`}
                          >
                            <div className="text-sm">
                              {assignment.skipReason?.reasonText || "-"}
                            </div>
                          </TableCell>
                        )}

                        {visibleColumns.overallGrade && (
                          <TableCell
                            data-testid={`overall-grade-${assignment.id}`}
                          >
                            <div className="text-sm font-medium">
                              {assignment.grade?.finalGrade || "-"}
                            </div>
                            {assignment.grade?.percentageScore != null && (
                              <div className="text-xs text-gray-500">
                                {assignment.grade.percentageScore.toFixed(1)}%
                              </div>
                            )}
                          </TableCell>
                        )}

                        {visibleColumns.turnitinStatus && (
                          <TableCell>
                            {getTurnitinStatusBadge(assignment.turnitinStatus)}
                          </TableCell>
                        )}

                        {visibleColumns.markingStatus && (
                          <TableCell>
                            {getStatusBadge(assignment.markingStatus)}
                          </TableCell>
                        )}

                        <TableCell
                          className="text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex justify-end gap-1">
                            {isAdmin && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openStatusDialog(assignment)}
                                data-testid={`status-button-${assignment.id}`}
                                className="h-8 px-2"
                              >
                                <AlertCircle className="w-4 h-4" />
                              </Button>
                            )}

                            {isAdmin && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openAssignDialog(assignment)}
                                data-testid={`assign-button-${assignment.id}`}
                                className="h-8 px-2"
                              >
                                <Users className="w-4 h-4" />
                              </Button>
                            )}

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                openMarkingBuddy(assignment.submissionId)
                              }
                              data-testid={`marking-buddy-button-${assignment.id}`}
                              className="h-8 px-2"
                              title="Open in Marking Buddy"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {/* Pagination Controls */}
              {pagination.totalPages > 0 && (
                <div className="flex items-center justify-between px-6 py-4 border-t">
                  <div className="text-sm text-gray-600">
                    Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} result
                    {pagination.total !== 1 ? "s" : ""}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={pagination.page <= 1}
                      data-testid="prev-page-button"
                    >
                      <ChevronLeft className="w-4 h-4 mr-1" />
                      Previous
                    </Button>
                    <div className="text-sm text-gray-600 px-2">
                      Page {pagination.page} of {pagination.totalPages}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.min(pagination.totalPages, prev + 1))}
                      disabled={pagination.page >= pagination.totalPages}
                      data-testid="next-page-button"
                    >
                      Next
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Status Update Dialog */}
      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Marking Status</DialogTitle>
            <DialogDescription>
              Change the status of this assignment and add notes if needed.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="new-status">Status</Label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger data-testid="new-status-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="waiting">Waiting</SelectItem>
                  <SelectItem value="being_marked">Being Marked</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                  <SelectItem value="approval_needed">
                    Approval Needed
                  </SelectItem>
                  <SelectItem value="marking_skipped">
                    Marking Skipped
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="status-notes">Notes (Optional)</Label>
              <Textarea
                id="status-notes"
                value={statusNotes}
                onChange={(e) => setStatusNotes(e.target.value)}
                placeholder="Add any notes about this status change..."
                data-testid="status-notes-input"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setStatusDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleStatusChange}
              disabled={updateStatusMutation.isPending}
              data-testid="update-status-confirm"
            >
              {updateStatusMutation.isPending ? "Updating..." : "Update Status"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Marker Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Marker</DialogTitle>
            <DialogDescription>
              Select a user to assign as the marker for this submission.
            </DialogDescription>
          </DialogHeader>

          <div>
            <Label htmlFor="marker-select">Marker</Label>
            <Select
              value={selectedMarkerId}
              onValueChange={setSelectedMarkerId}
            >
              <SelectTrigger data-testid="marker-select">
                <SelectValue placeholder="Select a marker..." />
              </SelectTrigger>
              <SelectContent>
                {users.map((user: any) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.firstName && user.lastName
                      ? `${user.firstName} ${user.lastName} (${user.role})`
                      : user.email
                        ? `${user.email} (${user.role})`
                        : `User ID: ${user.id} (${user.role})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="flex justify-between gap-1">
            <Button
              variant="outline"
              onClick={() => setAssignDialogOpen(false)}
            >
              Cancel
            </Button>
            {selectedAssignment?.assignedMarkerId && (
              <Button
                variant="destructive"
                onClick={() => {
                  if (
                    confirm("Are you sure you want to unassign this marker?")
                  ) {
                    handleUnassignMarker();
                  }
                }}
                disabled={unassignMarkerMutation.isPending}
                data-testid="unassign-marker-button"
              >
                {unassignMarkerMutation.isPending
                  ? "Unassigning..."
                  : "Unassign"}
              </Button>
            )}
            <Button
              onClick={handleAssignMarker}
              disabled={assignMarkerMutation.isPending || !selectedMarkerId}
              data-testid="assign-marker-confirm"
            >
              {assignMarkerMutation.isPending
                ? "Assigning..."
                : "Assign Marker"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Assign Marker Dialog */}
      <Dialog
        open={bulkAssignDialogOpen}
        onOpenChange={setBulkAssignDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Assign Marker</DialogTitle>
            <DialogDescription>
              Assign {selectedSubmissions.size} selected submission
              {selectedSubmissions.size !== 1 ? "s" : ""} to a marker.
            </DialogDescription>
          </DialogHeader>

          <div>
            <Label htmlFor="bulk-marker-select">Marker</Label>
            <Select
              value={bulkSelectedMarkerId}
              onValueChange={setBulkSelectedMarkerId}
            >
              <SelectTrigger data-testid="bulk-marker-select">
                <SelectValue placeholder="Select a marker..." />
              </SelectTrigger>
              <SelectContent>
                {users.map((user: any) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.firstName && user.lastName
                      ? `${user.firstName} ${user.lastName} (${user.role})`
                      : user.email
                        ? `${user.email} (${user.role})`
                        : `User ID: ${user.id} (${user.role})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkAssignDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleBulkAssignMarker}
              disabled={
                bulkAssignMarkerMutation.isPending || !bulkSelectedMarkerId
              }
              data-testid="bulk-assign-marker-confirm"
            >
              {bulkAssignMarkerMutation.isPending
                ? "Assigning..."
                : `Assign to ${selectedSubmissions.size} Submission${selectedSubmissions.size !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
