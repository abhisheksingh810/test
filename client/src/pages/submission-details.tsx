import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { canAccessAdminFeatures } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import {
  ArrowLeft,
  FileText,
  Download,
  ExternalLink,
  Save,
  RotateCcw,
  Eye,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  MoreVertical,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { useState, useEffect, useMemo, useRef } from "react";

interface SubmissionFile {
  id: string;
  fileName: string;
  originalFileName: string;
  fileSize: string;
  fileType?: string;
  uploadOrder: number;
  uploadedAt: string;
  submissionFileType?: "submission" | "feedback";
  uploadedBy?: string;
  turnitinStatus?: string;
  turnitinSimilarityScore?: number;
  turnitinReportUrl?: string;
  turnitinErrorMessage?: string;
  turnitinSubmissionId?: string;
  turnitinPdfStatus?: string;
  turnitinPdfUrl?: string;
}

interface AssessmentSection {
  id: string;
  name: string;
  questionText: string;
  markingOptions: Array<{
    id: string;
    label: string;
    marks: number;
  }>;
}

interface GradeBoundary {
  id: string;
  gradeLabel: string;
  marksFrom: number;
  marksTo: number;
  isPass: boolean;
}

interface MarkingData {
  sectionMarks: Record<
    string,
    {
      selectedOptionId?: string;
      feedback?: string;
      marksAwarded: number;
    }
  >;
  overallGrade: {
    skipReasonId?: string;
    skippedReason?: string;
    malpracticeLevelId?: string;
    malpracticeNotes?: string;
    wordCount?: number;
    overallSummary?: string;
  };
  onHold?: boolean;
  holdReason?: string;
}

function PreviousAttemptCollapsible({
  attempt,
  sectionMark,
  sectionId,
  maxMarks,
}: {
  attempt: {
    attemptNumber: number;
    submissionId: string;
    markingStatus: string | null;
  };
  sectionMark: { marksAwarded: number; feedback: string | null };
  sectionId: string;
  maxMarks: number;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const isSkipped = attempt.markingStatus === "marking_skipped";

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      data-testid={`collapsible-attempt-${attempt.attemptNumber}-${sectionId}`}
    >
      <CollapsibleTrigger
        className="w-full"
        data-testid={`trigger-attempt-${attempt.attemptNumber}-${sectionId}`}
      >
        <div className="flex items-center justify-between w-full p-3 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors">
          <div className="flex items-center gap-2">
            {isOpen ? (
              <ChevronDown className="h-4 w-4 text-gray-500" />
            ) : (
              <ChevronRight className="h-4 w-4 text-gray-500" />
            )}
            <span className="font-medium text-sm">
              {isSkipped ? "Skipped" : `Attempt ${attempt.attemptNumber}`}
            </span>
          </div>
          <Badge variant="secondary" className="text-xs">
            {sectionMark.marksAwarded} marks
          </Badge>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 p-4 bg-white border border-gray-200 rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium text-gray-700">
                Marker Feedback
              </Label>
              <p
                className="mt-1 text-sm text-gray-600 whitespace-pre-wrap"
                data-testid={`text-previous-feedback-${attempt.attemptNumber}-${sectionId}`}
              >
                {sectionMark.feedback || "No feedback provided"}
              </p>
            </div>
            <div>
              <Label className="text-sm font-medium text-gray-700">
                Marks Awarded
              </Label>
              <p
                className="mt-1 text-sm font-semibold"
                data-testid={`text-previous-marks-${attempt.attemptNumber}-${sectionId}`}
              >
                {sectionMark.marksAwarded} marks
              </p>
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function PreviousOverallSummaryCollapsible({
  attempt,
}: {
  attempt: {
    attemptNumber: number;
    submissionId: string;
    overallSummary: string | null;
    overallMarks: number | null;
    overallGrade: string | null;
    markingStatus: string | null;
  };
}) {
  const [isOpen, setIsOpen] = useState(false);
  const isSkipped = attempt.markingStatus === "marking_skipped";

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="w-full">
        <div className="flex items-center justify-between w-full p-3 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors">
          <div className="flex items-center gap-2">
            {isOpen ? (
              <ChevronDown className="h-4 w-4 text-gray-500" />
            ) : (
              <ChevronRight className="h-4 w-4 text-gray-500" />
            )}
            <span className="font-medium text-sm">
              {isSkipped ? "Skipped" : `Attempt ${attempt.attemptNumber}`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {attempt.overallGrade && (
              <Badge variant="outline" className="text-xs">
                Overall Grade: {attempt.overallGrade}
              </Badge>
            )}
            <Badge variant="secondary" className="text-xs">
              Overall Marks: {attempt.overallMarks ?? "—"}
            </Badge>
          </div>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="mt-2 p-4 bg-white border border-gray-200 rounded-lg">
          <p className="mt-1 text-sm text-gray-600 whitespace-pre-wrap">
            {attempt.overallSummary || "No feedback provided"}
          </p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function SubmissionDetails() {
  const [, params] = useRoute("/submissions/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const submissionId = params?.id;
  const isAdmin = user && canAccessAdminFeatures(user.role);

  // State for marking data
  const [markingData, setMarkingData] = useState<MarkingData>({
    sectionMarks: {},
    overallGrade: {},
    onHold: false,
    holdReason: "",
  });

  // Track whether initial data load has completed to avoid race conditions with auto-fill
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);

  // State for malpractice confirmation dialog
  const [showMalpracticeConfirm, setShowMalpracticeConfirm] = useState(false);
  const [malpracticeConfirmData, setMalpracticeConfirmData] = useState<{
    level: string;
    type: string;
  } | null>(null);

  // State for marker file uploads
  const [selectedMarkerFiles, setSelectedMarkerFiles] = useState<File[]>([]);
  const markerFileInputRef = useRef<HTMLInputElement>(null);

  // State for delete confirmation dialog
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<{
    id: string;
    fileName: string;
  } | null>(null);

  // Fetch submission details
  const { data: submissionDetails, isLoading } = useQuery({
    queryKey: ["/api/submissions", submissionId, "details"],
    queryFn: async () => {
      if (!submissionId) return null;
      const response = await fetch(`/api/submissions/${submissionId}/details`);
      if (!response.ok) throw new Error("Failed to fetch submission details");
      return response.json();
    },
    enabled: !!submissionId,
  });

  // Fetch active skip reasons
  const { data: activeSkipReasons = [] } = useQuery<
    Array<{ id: string; reasonText: string }>
  >({
    queryKey: ["/api/skip-reasons/active"],
    enabled: !!submissionId,
  });

  // Fetch active malpractice levels
  const { data: activeMalpracticeLevels = [] } = useQuery<
    Array<{ id: string; levelText: string; description?: string }>
  >({
    queryKey: ["/api/malpractice-levels/active"],
    enabled: !!submissionId,
  });

  // Fetch previous attempts
  const { data: previousAttemptsData } = useQuery<{
    attempts: Array<{
      submissionId: string;
      attemptNumber: number;
      completedAt: string | null;
      overallSummary: string | null;
      overallMarks: number | null;
      overallGrade: string | null;
      markingStatus: string | null;
      sectionMarks: Record<
        string,
        {
          marksAwarded: number;
          feedback: string | null;
          selectedOptionId: string | null;
        }
      >;
    }>;
  }>({
    queryKey: ["/api/submissions", submissionId, "previous-attempts"],
    queryFn: async () => {
      if (!submissionId) return null;
      const response = await fetch(
        `/api/submissions/${submissionId}/previous-attempts`
      );
      if (!response.ok) throw new Error("Failed to fetch previous attempts");
      return response.json();
    },
    enabled: !!submissionId,
  });

  // Save marking mutation
  const saveMarkingMutation = useMutation({
    mutationFn: async (data: MarkingData) => {
      return apiRequest(
        "POST",
        `/api/submissions/${submissionId}/marking`,
        data
      );
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Marking saved successfully",
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/submissions", submissionId, "details"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/marking/assignments"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to save marking",
        variant: "destructive",
      });
    },
  });

  // Complete marking mutation
  const completeMarkingMutation = useMutation({
    mutationFn: async (data: MarkingData) => {
      return apiRequest(
        "POST",
        `/api/submissions/${submissionId}/complete-marking`,
        data
      );
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Marking completed successfully",
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/submissions", submissionId, "details"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/marking/assignments"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to complete marking",
        variant: "destructive",
      });
    },
  });

  // Marker file delete mutation
  const deleteMarkerFileMutation = useMutation({
    mutationFn: async (fileId: string) => {
      if (!submissionId) throw new Error("Submission ID is required");
      const response = await apiRequest(
        "DELETE",
        `/api/submissions/${submissionId}/feedback-files/${fileId}`
      );
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "File deleted successfully",
      });
      setShowDeleteConfirm(false);
      setFileToDelete(null);
      queryClient.invalidateQueries({
        queryKey: ["/api/submissions", submissionId, "details"],
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete file",
        variant: "destructive",
      });
    },
  });

  // Marker file upload mutation
  const uploadMarkerFilesMutation = useMutation({
    mutationFn: async (files: File[]) => {
      if (!submissionId) throw new Error("Submission ID is required");

      // Convert all files to base64
      const filesData = await Promise.all(
        files.map(async (file) => {
          const fileData = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          });

          return {
            fileName: file.name,
            fileSize: `${(file.size / 1024 / 1024).toFixed(2)}MB`,
            fileType: file.name.split(".").pop()?.toLowerCase() || "",
            fileData,
          };
        })
      );

      const response = await apiRequest(
        "POST",
        `/api/submissions/${submissionId}/feedback-files`,
        { files: filesData }
      );
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Success",
        description: data.message || "Files uploaded successfully",
      });
      setSelectedMarkerFiles([]);
      // Clear the file input value
      if (markerFileInputRef.current) {
        markerFileInputRef.current.value = "";
      }
      queryClient.invalidateQueries({
        queryKey: ["/api/submissions", submissionId, "details"],
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to upload files",
        variant: "destructive",
      });
    },
  });

  // TurnItIn retry mutation
  const retryTurnitinMutation = useMutation({
    mutationFn: async (fileId: string) => {
      return apiRequest(
        "POST",
        `/api/submissions/${submissionId}/files/${fileId}/retry-turnitin`
      );
    },
    onSuccess: (data: any) => {
      toast({
        title: "Success",
        description: data.message || "TurnItIn submission successful",
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/submissions", submissionId, "details"],
      });
    },
    onError: (error: any) => {
      toast({
        title: "TurnItIn Error",
        description: error.message || "Failed to submit to TurnItIn",
        variant: "destructive",
      });
    },
  });

  // Load existing marking data when submission details are fetched
  useEffect(() => {
    if (submissionDetails) {
      if (
        submissionDetails?.existingGrade ||
        submissionDetails?.existingSectionMarks ||
        submissionDetails?.markingAssignment
      ) {
        const newMarkingData: MarkingData = {
          sectionMarks: {},
          overallGrade: {},
          onHold: false,
          holdReason: "",
        };

        // Load existing section marks
        if (submissionDetails.existingSectionMarks?.length) {
          submissionDetails.existingSectionMarks.forEach((mark: any) => {
            newMarkingData.sectionMarks[mark.sectionId] = {
              selectedOptionId: mark.selectedOptionId,
              feedback: mark.feedback,
              marksAwarded: mark.marksAwarded,
            };
          });
        } else if (
          previousAttemptsData &&
          previousAttemptsData?.attempts?.length > 0
        ) {
          const latestAttempt =
            previousAttemptsData.attempts[
              previousAttemptsData.attempts.length - 1
            ];
          const latestAttemptMarks = latestAttempt?.sectionMarks || {};

          const filteredLatestAttemptMarks = Object.fromEntries(
            Object.entries(latestAttemptMarks).filter(
              ([, markingData]) => markingData.marksAwarded > 1
            )
          ) as Record<
            string,
            {
              selectedOptionId?: string;
              feedback?: string;
              marksAwarded: number;
            }
          >;

          // Initialize section marks if none exist
          newMarkingData.sectionMarks = filteredLatestAttemptMarks;
        }

        // Load existing overall grade
        if (submissionDetails.existingGrade) {
          newMarkingData.overallGrade = {
            skipReasonId: submissionDetails.existingGrade.skipReasonId,
            skippedReason: submissionDetails.existingGrade.skippedReason,
            malpracticeLevelId:
              submissionDetails.existingGrade.malpracticeLevelId,
            malpracticeNotes: submissionDetails.existingGrade.malpracticeNotes,
            wordCount: submissionDetails.existingGrade.wordCount,
            overallSummary: submissionDetails.existingGrade.overallSummary,
          };
        }

        // Load marking assignment status and hold reason
        if (submissionDetails.markingAssignment) {
          newMarkingData.onHold =
            submissionDetails.markingAssignment.markingStatus === "on_hold";
          newMarkingData.holdReason =
            submissionDetails.markingAssignment.holdReason || "";
        }

        setMarkingData(newMarkingData);
      }

      // Mark that initial data load is complete (whether there was data or not)
      setInitialDataLoaded(true);
    }
  }, [submissionDetails, previousAttemptsData]);

  // Calculate total marks possible as the sum of maximum marking options for each section
  const totalMarksPossible = useMemo(() => {
    if (!submissionDetails?.assessmentSections) return 0;
    return submissionDetails.assessmentSections.reduce(
      (total: number, section: AssessmentSection) => {
        const maxMarks = section.markingOptions.reduce(
          (max: number, option: { marks: number }) =>
            Math.max(max, option.marks),
          0
        );
        return total + maxMarks;
      },
      0
    );
  }, [submissionDetails?.assessmentSections]);

  // Filter marker feedback files
  const markerFiles = useMemo(() => {
    if (!submissionDetails?.files) return [];
    return submissionDetails.files.filter(
      (file: SubmissionFile) => file.submissionFileType === "feedback"
    );
  }, [submissionDetails?.files]);

  // Filter learner submission files
  const learnerFiles = useMemo(() => {
    if (!submissionDetails?.files) return [];
    return submissionDetails.files.filter(
      (file: SubmissionFile) => file.submissionFileType === "submission"
    );
  }, [submissionDetails?.files]);

  const handleDownloadFile = async (
    submissionId: string,
    fileId: string,
    fileName: string
  ) => {
    try {
      window.open(
        `/api/submissions/${submissionId}/files/${fileId}/download`,
        "_blank"
      );
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to download file",
        variant: "destructive",
      });
    }
  };

  const handleRetryTurnitin = (fileId: string) => {
    retryTurnitinMutation.mutate(fileId);
  };

  const handleViewTurnitinReport = async (fileId: string) => {
    try {
      const response = await fetch(`/api/turnitin/report/${fileId}`);
      const data = await response.json();
      if (response.ok && data.reportUrl) {
        window.open(data.reportUrl, "_blank");
      } else {
        toast({
          title: "Error",
          description: data.message || "TurnItIn report not available",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to open TurnItIn report",
        variant: "destructive",
      });
    }
  };

  const handleDownloadTurnitinPdf = async (fileId: string) => {
    try {
      // Open PDF in new tab for download
      window.open(`/api/turnitin/pdf/${fileId}`, "_blank");
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to download TurnItIn PDF report",
        variant: "destructive",
      });
    }
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
      case "skipped":
        return (
          <Badge variant="secondary" className="text-gray-700 bg-gray-100">
            Skipped
          </Badge>
        );
      default:
        return <Badge variant="outline">Not Submitted</Badge>;
    }
  };

  const updateSectionMark = (sectionId: string, field: string, value: any) => {
    setMarkingData((prev) => ({
      ...prev,
      sectionMarks: {
        ...prev.sectionMarks,
        [sectionId]: {
          ...prev.sectionMarks[sectionId],
          [field]: value,
        },
      },
    }));
  };

  const updateOverallGrade = (field: string, value: any) => {
    setMarkingData((prev) => ({
      ...prev,
      overallGrade: {
        ...prev.overallGrade,
        [field]: value,
      },
    }));
  };

  const handleSaveMarking = () => {
    // Validate that all sections have marks and feedback
    if (!submissionDetails?.assessmentSections) {
      toast({
        title: "Error",
        description: "No assessment sections found",
        variant: "destructive",
      });
      return;
    }

    // Check if skip reason or malpractice level is selected
    const hasSkipReasonOrMalpractice =
      markingData.overallGrade.skipReasonId ||
      markingData.overallGrade.malpracticeLevelId;

    console.log(markingData);

    // Only validate section marks and feedback if no skip reason or malpractice level is selected
    if (!hasSkipReasonOrMalpractice) {
      const allSections = submissionDetails.assessmentSections;
      const markedSections = Object.keys(markingData.sectionMarks);
      for (let i = 0; i < markedSections.length; i++) {
        const section = allSections.find(
          (s: any) => s.id === markedSections[i]
        );
        if (!section) {
          toast({
            title: "Validation Error",
            description: `Assessment section does not exists`,
            variant: "destructive",
          });
          return;
        }
        const sectionMark = markingData.sectionMarks[section.id];

        // Check if marks are provided and valid
        if (
          sectionMark?.marksAwarded === undefined ||
          sectionMark?.marksAwarded === null ||
          !Number.isFinite(Number(sectionMark?.marksAwarded))
        ) {
          toast({
            title: "Validation Error",
            description: `Please enter valid marks for: "${
              section.questionText || "Question " + (i + 1)
            }"`,
            variant: "destructive",
          });
          return;
        }

        // Validate marks are within valid range
        const marks = Number(sectionMark.marksAwarded);

        // Check if marks are negative
        if (marks < 0) {
          toast({
            title: "Validation Error",
            description: `Marks cannot be negative for: "${
              section.questionText || "Question " + (i + 1)
            }"`,
            variant: "destructive",
          });
          return;
        }

        // Check if section has marking options - if so, validate against options range
        if (section.markingOptions.length > 0) {
          const maxMarks = Math.max(
            ...section.markingOptions.map((opt: { marks: number }) => opt.marks)
          );
          const minMarks = Math.min(
            ...section.markingOptions.map((opt: { marks: number }) => opt.marks)
          );

          if (marks > maxMarks) {
            toast({
              title: "Validation Error",
              description: `Marks must not exceed ${maxMarks} for: "${
                section.questionText || "Question " + (i + 1)
              }"`,
              variant: "destructive",
            });
            return;
          }

          if (marks < minMarks) {
            toast({
              title: "Validation Error",
              description: `Marks must be at least ${minMarks} for: "${
                section.questionText || "Question " + (i + 1)
              }"`,
              variant: "destructive",
            });
            return;
          }
        }
      }
    }
    saveMarkingMutation.mutate(markingData);
  };

  const handleCompleteMarking = () => {
    // Validate that all sections have marks and feedback
    if (!submissionDetails?.assessmentSections) {
      toast({
        title: "Error",
        description: "No assessment sections found",
        variant: "destructive",
      });
      return;
    }

    // Check if skip reason or malpractice level is selected
    const hasSkipReasonOrMalpractice =
      markingData.overallGrade.skipReasonId ||
      markingData.overallGrade.malpracticeLevelId;

    // Only validate section marks and feedback if no skip reason or malpractice level is selected
    if (!hasSkipReasonOrMalpractice) {
      const sections = submissionDetails.assessmentSections;
      for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        const sectionMark = markingData.sectionMarks[section.id];

        // Check if marks are provided and valid
        if (
          sectionMark?.marksAwarded === undefined ||
          sectionMark?.marksAwarded === null ||
          !Number.isFinite(Number(sectionMark?.marksAwarded))
        ) {
          toast({
            title: "Validation Error",
            description: `Please enter valid marks for: "${
              section.questionText || "Question " + (i + 1)
            }"`,
            variant: "destructive",
          });
          return;
        }

        // Validate marks are within valid range
        const marks = Number(sectionMark.marksAwarded);

        // Check if marks are negative
        if (marks < 0) {
          toast({
            title: "Validation Error",
            description: `Marks cannot be negative for: "${
              section.questionText || "Question " + (i + 1)
            }"`,
            variant: "destructive",
          });
          return;
        }

        // Check if section has marking options - if so, validate against options range
        if (section.markingOptions.length > 0) {
          const maxMarks = Math.max(
            ...section.markingOptions.map((opt: { marks: number }) => opt.marks)
          );
          const minMarks = Math.min(
            ...section.markingOptions.map((opt: { marks: number }) => opt.marks)
          );

          if (marks > maxMarks) {
            toast({
              title: "Validation Error",
              description: `Marks must not exceed ${maxMarks} for: "${
                section.questionText || "Question " + (i + 1)
              }"`,
              variant: "destructive",
            });
            return;
          }

          if (marks < minMarks) {
            toast({
              title: "Validation Error",
              description: `Marks must be at least ${minMarks} for: "${
                section.questionText || "Question " + (i + 1)
              }"`,
              variant: "destructive",
            });
            return;
          }
        }

        // Check if feedback is provided
        if (!sectionMark?.feedback || sectionMark.feedback.trim() === "") {
          toast({
            title: "Validation Error",
            description: `Please provide feedback for: "${
              section.questionText || "Question " + (i + 1)
            }"`,
            variant: "destructive",
          });
          return;
        }
      }
    }

    // Check if overall summary is provided
    if (
      !markingData.overallGrade.overallSummary ||
      markingData.overallGrade.overallSummary.trim() === ""
    ) {
      toast({
        title: "Validation Error",
        description: "Please provide overall feedback for this submission",
        variant: "destructive",
      });
      return;
    }

    // Check if any malpractice level is selected
    if (markingData.overallGrade.malpracticeLevelId) {
      const selectedLevel = activeMalpracticeLevels.find(
        (level: any) => level.id === markingData.overallGrade.malpracticeLevelId
      );

      if (selectedLevel) {
        const levelText = selectedLevel.levelText.toLowerCase();

        // Determine malpractice type
        let malpracticeType = "moderate";
        if (levelText.includes("considerable")) {
          malpracticeType = "considerable";
        } else if (levelText.includes("severe")) {
          malpracticeType = "severe";
        }

        // Show confirmation dialog for all malpractice levels
        setMalpracticeConfirmData({
          level: selectedLevel.levelText,
          type: malpracticeType,
        });
        setShowMalpracticeConfirm(true);
        return; // Don't proceed yet, wait for confirmation
      }
    }

    // If no malpractice level selected, proceed directly
    completeMarkingMutation.mutate(markingData);
  };

  const confirmCompleteMarking = () => {
    setShowMalpracticeConfirm(false);
    completeMarkingMutation.mutate(markingData);
  };

  const getMarkingStatusDisplay = (status: string) => {
    switch (status) {
      case "waiting":
        return (
          <Badge variant="secondary" className="bg-gray-100 text-gray-700">
            Waiting
          </Badge>
        );
      case "being_marked":
        return (
          <Badge variant="secondary" className="bg-blue-100 text-blue-700">
            Being Marked
          </Badge>
        );
      case "marking_skipped":
        return (
          <Badge variant="destructive" className="bg-red-600 text-white">
            Skipped
          </Badge>
        );
      case "on_hold":
        return (
          <Badge variant="secondary" className="bg-orange-100 text-orange-700">
            On Hold
          </Badge>
        );
      case "approval_needed":
        return (
          <Badge variant="secondary" className="bg-purple-100 text-purple-700">
            Approval Needed
          </Badge>
        );
      case "approved":
        return (
          <Badge variant="secondary" className="bg-green-100 text-green-700">
            Approved
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="py-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-2 text-gray-500">Loading submission details...</p>
        </div>
      </div>
    );
  }

  if (!submissionDetails) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="py-8 text-center">
          <p className="text-gray-500">Submission not found</p>
          <Button
            variant="outline"
            onClick={() => setLocation("/marking")}
            className="mt-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Marking
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            onClick={() => setLocation("/marking")}
            data-testid="back-to-marking"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Marking
          </Button>
          <h1 className="text-2xl font-bold">Submission Marking</h1>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleSaveMarking}
            disabled={saveMarkingMutation.isPending}
            data-testid="save-marking"
            variant="outline"
          >
            <Save className="w-4 h-4 mr-2" />
            {saveMarkingMutation.isPending ? "Saving..." : "Save Marking"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Student & Assessment Info */}
        <div className="lg:col-span-1 space-y-6 lg:sticky lg:top-16 lg:self-start lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto">
          {/* Student Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Student Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-sm font-medium text-gray-500">
                  Student Name
                </Label>
                <p className="font-medium" data-testid="student-name">
                  {submissionDetails.submission.firstName}{" "}
                  {submissionDetails.submission.lastName}
                </p>
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-500">
                  Unit
                </Label>
                <p className="font-medium" data-testid="assessment-code">
                  {submissionDetails.submission.customAssessmentCode}
                </p>
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-500">
                  CIPD Number
                </Label>
                <p className="font-medium" data-testid="student-email">
                  {submissionDetails.submission.email}
                </p>
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-500">
                  Submission Date
                </Label>
                <p className="font-medium" data-testid="submitted-at">
                  {format(
                    new Date(submissionDetails.submission.submittedAt),
                    "PPP"
                  )}
                </p>
              </div>
              {submissionDetails.markingAssignment?.markingStatus !==
                "marking_skipped" && (
                <div>
                  <Label className="text-sm font-medium text-gray-500">
                    Attempt #
                  </Label>
                  <p className="font-medium" data-testid="attempt-number">
                    {submissionDetails.submission.attemptNumber || 1}
                  </p>
                </div>
              )}
              {submissionDetails.markingAssignment?.markingStatus && (
                <div>
                  <Label className="text-sm font-medium text-gray-500">
                    Marking Status
                  </Label>
                  <div className="mt-1" data-testid="marking-status">
                    {getMarkingStatusDisplay(
                      submissionDetails.markingAssignment.markingStatus
                    )}
                  </div>
                </div>
              )}

              {submissionDetails.assignedMarker && (
                <div>
                  <Label className="text-sm font-medium text-gray-500">
                    Assigned To
                  </Label>
                  <div className="mt-1">
                    <p className="font-medium" data-testid="assigned-marker">
                      {submissionDetails.assignedMarker.firstName}{" "}
                      {submissionDetails.assignedMarker.email}
                    </p>
                  </div>
                </div>
              )}
              <div>
                <Label htmlFor="word-count" className="text-sm font-medium">
                  Word Count
                </Label>
                <Input
                  id="word-count"
                  type="number"
                  placeholder="Word count"
                  value={markingData.overallGrade.wordCount || ""}
                  onChange={(e) =>
                    updateOverallGrade(
                      "wordCount",
                      parseInt(e.target.value) || 0
                    )
                  }
                  disabled
                  data-testid="word-count"
                />
              </div>

              {/* Final Grade Display - Only shown when marking is complete */}
              {submissionDetails?.existingGrade?.isComplete &&
                submissionDetails?.existingGrade?.finalGrade && (
                  <>
                    <Separator />
                    <div>
                      <Label className="text-sm font-medium text-gray-500">
                        Final Grade
                      </Label>
                      <div className="mt-2 space-y-2">
                        <Badge
                          className={`text-lg px-4 py-1 ${
                            submissionDetails.existingGrade.finalGrade ===
                              "Refer" ||
                            submissionDetails.existingGrade.finalGrade ===
                              "Fail"
                              ? "bg-red-600 text-white"
                              : "bg-green-600 text-white"
                          }`}
                          data-testid="final-grade"
                        >
                          {submissionDetails.existingGrade.finalGrade}
                          {submissionDetails.gradeBoundaries?.find(
                            (b: any) =>
                              b.gradeLabel ===
                              submissionDetails.existingGrade?.finalGrade
                          ) && (
                            <span className="ml-1 font-normal">
                              (
                              {
                                submissionDetails.gradeBoundaries.find(
                                  (b: any) =>
                                    b.gradeLabel ===
                                    submissionDetails.existingGrade?.finalGrade
                                )?.marksFrom
                              }
                              -
                              {
                                submissionDetails.gradeBoundaries.find(
                                  (b: any) =>
                                    b.gradeLabel ===
                                    submissionDetails.existingGrade?.finalGrade
                                )?.marksTo
                              }
                              )
                            </span>
                          )}
                        </Badge>
                        <p
                          className="text-sm font-medium"
                          data-testid="total-marks"
                        >
                          Total Marks:{" "}
                          {submissionDetails.existingGrade.totalMarksAwarded ||
                            0}
                          /{totalMarksPossible}
                        </p>
                      </div>
                    </div>
                  </>
                )}

              <Separator />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="on-hold-toggle"
                    className="text-sm font-medium"
                  >
                    On Hold
                  </Label>
                  <Switch
                    id="on-hold-toggle"
                    checked={markingData.onHold || false}
                    onCheckedChange={(checked) => {
                      setMarkingData((prev) => ({
                        ...prev,
                        onHold: checked,
                        holdReason: checked ? prev.holdReason : "",
                      }));
                    }}
                    data-testid="on-hold-toggle"
                  />
                </div>
                {markingData.onHold && (
                  <div>
                    <Label
                      htmlFor="hold-reason"
                      className="text-sm font-medium"
                    >
                      Hold Reason
                    </Label>
                    <Textarea
                      id="hold-reason"
                      placeholder="Enter reason for holding this submission..."
                      value={markingData.holdReason || ""}
                      onChange={(e) => {
                        setMarkingData((prev) => ({
                          ...prev,
                          holdReason: e.target.value,
                        }));
                      }}
                      rows={3}
                      data-testid="hold-reason"
                    />
                  </div>
                )}
              </div>
              <Separator />
              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="skip-reason"
                      className="text-sm font-medium"
                    >
                      Skip Reason
                    </Label>
                  </div>
                  <Select
                    value={
                      !markingData.overallGrade.skipReasonId
                        ? "none"
                        : markingData.overallGrade.skipReasonId
                    }
                    onValueChange={(value) =>
                      updateOverallGrade(
                        "skipReasonId",
                        value === "none" ? null : value
                      )
                    }
                  >
                    <SelectTrigger
                      id="skip-reason"
                      data-testid="select-skip-reason"
                      disabled={!isAdmin}
                    >
                      <SelectValue placeholder="Select skip reason (optional)..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {activeSkipReasons.map((reason: any) => (
                        <SelectItem key={reason.id} value={reason.id}>
                          {reason.reasonText}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!isAdmin && (
                    <p className="text-xs text-muted-foreground">
                      Only admins can modify skip reasons
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="malpractice-level"
                      className="text-sm font-medium"
                    >
                      Malpractice Level
                    </Label>
                  </div>
                  <Select
                    value={
                      !markingData.overallGrade.malpracticeLevelId
                        ? "none"
                        : markingData.overallGrade.malpracticeLevelId
                    }
                    onValueChange={(value) =>
                      updateOverallGrade(
                        "malpracticeLevelId",
                        value === "none" ? null : value
                      )
                    }
                  >
                    <SelectTrigger
                      id="malpractice-level"
                      data-testid="select-malpractice-level"
                      disabled={!isAdmin}
                    >
                      <SelectValue placeholder="Select malpractice level (optional)..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {activeMalpracticeLevels.map((level: any) => (
                        <SelectItem key={level.id} value={level.id}>
                          {level.levelText}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!isAdmin && (
                    <p className="text-xs text-muted-foreground">
                      Only admins can modify malpractice levels
                    </p>
                  )}
                </div>
                {/* Marker Files Section */}
                <div className="space-y-3 pt-4 border-t">
                  <Label className="text-sm font-medium">Marker Files</Label>
                  
                  {/* Display existing marker files */}
                  {markerFiles.length > 0 && (
                    <div className="space-y-2">
                      {markerFiles.map((file: SubmissionFile) => (
                        <div
                          key={file.id}
                          className="flex items-center justify-between p-2 border rounded-md bg-gray-50"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">
                                {file.originalFileName || file.fileName}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {file.fileSize} •{" "}
                                {format(new Date(file.uploadedAt), "MMM d, yyyy HH:mm")}
                              </p>
                            </div>
                          </div>
                          {isAdmin ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="flex-shrink-0"
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() =>
                                    handleDownloadFile(
                                      submissionId!,
                                      file.id,
                                      file.originalFileName || file.fileName
                                    )
                                  }
                                  className="cursor-pointer"
                                >
                                  <Download className="w-4 h-4 mr-2" />
                                  Download
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setFileToDelete({
                                      id: file.id,
                                      fileName: file.originalFileName || file.fileName,
                                    });
                                    setShowDeleteConfirm(true);
                                  }}
                                  className="text-destructive focus:text-destructive cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                handleDownloadFile(
                                  submissionId!,
                                  file.id,
                                  file.originalFileName || file.fileName
                                )
                              }
                              className="flex-shrink-0"
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* File input for new marker files */}
                  <div className="space-y-2">
                    <Input
                      ref={markerFileInputRef}
                      type="file"
                      multiple
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        setSelectedMarkerFiles(files);
                      }}
                      className="cursor-pointer"
                      accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png"
                    />
                    {selectedMarkerFiles.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">
                          Selected files:
                        </p>
                        {selectedMarkerFiles.map((file, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between text-xs p-1 bg-gray-50 rounded"
                          >
                            <span className="truncate flex-1">{file.name}</span>
                            <span className="text-muted-foreground ml-2">
                              {(file.size / 1024 / 1024).toFixed(2)} MB
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        if (selectedMarkerFiles.length === 0) {
                          toast({
                            title: "No files selected",
                            description: "Please select at least one file to upload",
                            variant: "destructive",
                          });
                          return;
                        }
                        uploadMarkerFilesMutation.mutate(selectedMarkerFiles);
                      }}
                      disabled={uploadMarkerFilesMutation.isPending || selectedMarkerFiles.length === 0}
                      className="w-full"
                    >
                      {uploadMarkerFilesMutation.isPending
                        ? "Uploading..."
                        : "Upload Feedback Files"}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Files and Assessment Marking */}
        <div className="lg:col-span-2 space-y-6">
          {/* Submitted Files */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Submitted Files ({learnerFiles.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {learnerFiles.length === 0 ? (
                <p
                  className="text-gray-500 text-center py-4"
                  data-testid="no-files"
                >
                  No files uploaded
                </p>
              ) : (
                <div className="space-y-3">
                  {learnerFiles.map(
                    (file: SubmissionFile, index: number) => (
                      <div
                        key={file.id}
                        className="border rounded-lg p-4"
                        data-testid={`file-${index}`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p
                                className="text-sm font-medium truncate"
                                data-testid={`file-name-${index}`}
                                title={file.originalFileName}
                              >
                                {file.originalFileName}
                              </p>
                              <p className="text-xs text-gray-500">
                                {file.fileSize}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2 flex-shrink-0 ml-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                handleDownloadFile(
                                  submissionDetails.submission.id,
                                  file.id,
                                  file.originalFileName
                                )
                              }
                              data-testid={`download-button-${index}`}
                            >
                              <Download className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>

                        {/* TurnItIn Status Section */}
                        <div className="border-t pt-3">
                          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="text-sm font-medium text-gray-700">
                                TurnItIn Status:
                              </span>
                              {getTurnitinStatusBadge(file.turnitinStatus)}
                              {file.turnitinSimilarityScore !== undefined && (
                                <span className="text-sm text-gray-600">
                                  Similarity: {file.turnitinSimilarityScore}%
                                </span>
                              )}
                            </div>

                            <div className="flex gap-2 flex-wrap">
                              {/* View Report Button */}
                              {file.turnitinStatus === "complete" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    handleViewTurnitinReport(file.id)
                                  }
                                  data-testid={`turnitin-report-${index}`}
                                >
                                  <Eye className="w-3 h-3 mr-1" />
                                  View Report
                                </Button>
                              )}

                              {/* Download PDF Report Button */}
                              {file.turnitinStatus === "complete" &&
                                file.turnitinPdfStatus === "complete" &&
                                file.turnitinPdfUrl && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      handleDownloadTurnitinPdf(file.id)
                                    }
                                    data-testid={`turnitin-pdf-${index}`}
                                  >
                                    <Download className="w-3 h-3 mr-1" />
                                    PDF Report
                                  </Button>
                                )}

                              {/* PDF Status Indicator */}
                              {file.turnitinStatus === "complete" &&
                                file.turnitinPdfStatus &&
                                file.turnitinPdfStatus !== "complete" && (
                                  <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full">
                                    PDF: {file.turnitinPdfStatus}
                                  </span>
                                )}

                              {/* Retry Button (Admin Only) */}
                              {isAdmin && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleRetryTurnitin(file.id)}
                                  disabled={retryTurnitinMutation.isPending}
                                  data-testid={`turnitin-retry-${index}`}
                                >
                                  <RotateCcw className="w-3 h-3 mr-1" />
                                  {retryTurnitinMutation.isPending
                                    ? "Retrying..."
                                    : "Retry TurnItIn"}
                                </Button>
                              )}
                            </div>
                          </div>

                          {/* Error Message */}
                          {file.turnitinStatus === "error" &&
                            file.turnitinErrorMessage && (
                              <div className="flex items-start gap-2 mt-2 p-2 bg-red-50 rounded text-sm text-red-700">
                                <AlertCircle className="w-4 h-4 mt-0.5" />
                                <span>{file.turnitinErrorMessage}</span>
                              </div>
                            )}
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Previous Attempts - Only visible to admins and superadmins */}
          {isAdmin &&
            previousAttemptsData?.attempts &&
            previousAttemptsData.attempts.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Previous Attempts
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {previousAttemptsData.attempts.map((attempt) => {
                      const isSkipped =
                        attempt.markingStatus === "marking_skipped";
                      return (
                        <a
                          key={attempt.submissionId}
                          href={`/submissions/${attempt.submissionId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors"
                          data-testid={`link-previous-attempt-${attempt.attemptNumber}`}
                        >
                          <div className="flex items-center gap-2">
                            {isSkipped ? (
                              <span className="font-medium text-sm">
                                Skipped
                              </span>
                            ) : (
                              <>
                                <span className="font-medium text-sm">
                                  Attempt {attempt.attemptNumber}
                                </span>
                                {attempt.overallGrade && (
                                  <>
                                    <span className="text-sm text-gray-500">
                                      –
                                    </span>
                                    <Badge
                                      className={`text-xs ${
                                        attempt.overallGrade === "Refer"
                                          ? "bg-red-600 text-white hover:bg-red-700"
                                          : "bg-green-600 text-white hover:bg-green-700"
                                      }`}
                                    >
                                      {attempt.overallGrade}
                                    </Badge>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                          <ExternalLink className="h-4 w-4 text-gray-400" />
                        </a>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

          {/* Assessment Marking */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Assessment Marking</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {submissionDetails.assessmentSections &&
              submissionDetails.assessmentSections.length > 0 ? (
                <>
                  {submissionDetails.assessmentSections.map(
                    (section: AssessmentSection, index: number) => (
                      <div
                        key={section.id}
                        className="space-y-4 p-4 border rounded-lg"
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                Q{index + 1}
                              </Badge>
                              <h3
                                className="font-semibold text-lg"
                                data-testid={`section-name-${index}`}
                              >
                                {section.questionText ||
                                  `Question ${index + 1}`}
                              </h3>
                            </div>
                            <span className="text-sm text-gray-500">
                              {section.markingOptions.reduce(
                                (acc, option) =>
                                  option.marks > acc ? option.marks : acc,
                                0
                              )}{" "}
                              marks
                            </span>
                          </div>
                        </div>

                        <div className="space-y-4">
                          {/* Marking Options Display */}
                          <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                            <Label className="text-sm font-medium text-blue-900 mb-2 block">
                              Marking Options Available:
                            </Label>
                            <div className="flex flex-wrap gap-2">
                              {section.markingOptions.map((option) => (
                                <Badge
                                  key={option.id}
                                  variant="outline"
                                  className="text-xs"
                                >
                                  {option.label}: {option.marks} marks
                                </Badge>
                              ))}
                            </div>
                          </div>

                          {/* Previous Attempts feedback and marks Display */}
                          {previousAttemptsData?.attempts &&
                            previousAttemptsData.attempts.length > 0 && (
                              <div className="space-y-2">
                                {previousAttemptsData.attempts
                                  .filter(
                                    (attempt) =>
                                      attempt.sectionMarks[section.id]
                                  )
                                  .map((attempt) => {
                                    const sectionMark =
                                      attempt.sectionMarks[section.id];
                                    const maxMarks =
                                      section.markingOptions.length > 0
                                        ? Math.max(
                                            ...section.markingOptions.map(
                                              (opt) => opt.marks
                                            )
                                          )
                                        : 0;

                                    return (
                                      <PreviousAttemptCollapsible
                                        key={attempt.submissionId}
                                        attempt={attempt}
                                        sectionMark={sectionMark}
                                        sectionId={section.id}
                                        maxMarks={maxMarks}
                                      />
                                    );
                                  })}
                              </div>
                            )}

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <Label
                                htmlFor={`feedback-${section.id}`}
                                className="text-sm font-medium"
                              >
                                Attempt #
                                {submissionDetails.submission.attemptNumber ||
                                  1}{" "}
                                Marker Feedback{" "}
                                <span className="text-red-500">*</span>
                              </Label>
                              <Textarea
                                id={`feedback-${section.id}`}
                                placeholder="Enter feedback for this section..."
                                value={
                                  markingData.sectionMarks[section.id]
                                    ?.feedback || ""
                                }
                                onChange={(e) =>
                                  updateSectionMark(
                                    section.id,
                                    "feedback",
                                    e.target.value
                                  )
                                }
                                rows={4}
                                data-testid={`section-feedback-${index}`}
                                required
                              />
                            </div>

                            <div>
                              <Label
                                htmlFor={`marks-${section.id}`}
                                className="text-sm font-medium"
                              >
                                Attempt #
                                {submissionDetails.submission.attemptNumber ||
                                  1}{" "}
                                Marks Awarded{" "}
                                <span className="text-red-500">*</span>
                              </Label>
                              <Input
                                id={`marks-${section.id}`}
                                type="number"
                                placeholder="Enter marks"
                                min={
                                  section.markingOptions.length > 0
                                    ? Math.min(
                                        ...section.markingOptions.map(
                                          (opt) => opt.marks
                                        )
                                      )
                                    : 0
                                }
                                max={
                                  section.markingOptions.length > 0
                                    ? Math.max(
                                        ...section.markingOptions.map(
                                          (opt) => opt.marks
                                        )
                                      )
                                    : 0
                                }
                                step="1"
                                value={
                                  markingData.sectionMarks[section.id]
                                    ?.marksAwarded ?? ""
                                }
                                onChange={(e) => {
                                  const inputValue = e.target.value;
                                  // If empty, set to undefined to trigger validation
                                  if (inputValue === "") {
                                    updateSectionMark(
                                      section.id,
                                      "marksAwarded",
                                      undefined
                                    );
                                    updateSectionMark(
                                      section.id,
                                      "selectedOptionId",
                                      null
                                    );
                                    return;
                                  }

                                  const marks = parseFloat(inputValue);
                                  // Only update if it's a valid number
                                  if (!isNaN(marks)) {
                                    updateSectionMark(
                                      section.id,
                                      "marksAwarded",
                                      marks
                                    );
                                    // Find matching option based on marks
                                    const matchingOption =
                                      section.markingOptions.find(
                                        (opt) => opt.marks === marks
                                      );
                                    if (matchingOption) {
                                      updateSectionMark(
                                        section.id,
                                        "selectedOptionId",
                                        matchingOption.id
                                      );
                                    } else {
                                      updateSectionMark(
                                        section.id,
                                        "selectedOptionId",
                                        null
                                      );
                                    }
                                  }
                                }}
                                data-testid={`section-marks-${index}`}
                                required
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  )}

                  <Separator />

                  {/* Overall Summary */}
                  <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
                    {/* Previous Attempts overall summary Display */}
                    {previousAttemptsData?.attempts &&
                      previousAttemptsData.attempts.length > 0 && (
                        <div className="space-y-2">
                          {previousAttemptsData.attempts
                            .filter(
                              (attempt) =>
                                attempt.markingStatus !== "marking_skipped"
                            )
                            .map((attempt) => (
                              <PreviousOverallSummaryCollapsible
                                key={attempt.submissionId}
                                attempt={attempt}
                              />
                            ))}
                        </div>
                      )}
                    <h3 className="font-semibold text-lg">
                      Attempt #{submissionDetails.submission.attemptNumber || 1}{" "}
                      Overall Feedback
                    </h3>
                    <div>
                      <Label
                        htmlFor="overall-summary"
                        className="text-sm font-medium"
                      >
                        General Feedback for Submission Attempt #
                        {submissionDetails.submission.attemptNumber || 1}{" "}
                        <span className="text-red-500">*</span>
                      </Label>
                      <Textarea
                        id="overall-summary"
                        value={markingData.overallGrade.overallSummary || ""}
                        onChange={(e) =>
                          updateOverallGrade("overallSummary", e.target.value)
                        }
                        placeholder="Provide overall feedback and summary for this submission..."
                        rows={6}
                        data-testid="overall-summary"
                        className="mt-2"
                        required
                      />
                    </div>
                  </div>

                  {/* Complete Marking Button */}
                  <div className="flex justify-end pt-4 gap-2">
                    <Button
                      onClick={handleSaveMarking}
                      disabled={saveMarkingMutation.isPending}
                      data-testid="save-marking"
                      variant="outline"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {saveMarkingMutation.isPending
                        ? "Saving..."
                        : "Save Marking"}
                    </Button>
                    <Button
                      onClick={handleCompleteMarking}
                      disabled={completeMarkingMutation.isPending}
                      data-testid="complete-marking"
                      className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 text-lg"
                    >
                      {completeMarkingMutation.isPending
                        ? "Completing..."
                        : "Complete Marking"}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500">
                    No assessment sections found for this submission.
                  </p>
                  {!submissionDetails.assessment && (
                    <p className="text-sm text-gray-400 mt-2">
                      Assessment code:{" "}
                      {submissionDetails.submission.customAssessmentCode}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Malpractice Confirmation Dialog */}
      <AlertDialog
        open={showMalpracticeConfirm}
        onOpenChange={setShowMalpracticeConfirm}
      >
        <AlertDialogContent data-testid="malpractice-confirmation-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Confirm Malpractice Level Application
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              {malpracticeConfirmData?.type === "moderate" && (
                <>
                  <p className="font-semibold text-yellow-600">
                    You are applying "{malpracticeConfirmData.level}"
                    malpractice level.
                  </p>
                  <p>
                    This will automatically mark the current submission as{" "}
                    <strong>Fail/Refer</strong>. The student will still have any
                    remaining attempts available (up to the standard 3-attempt
                    limit).
                  </p>
                  <p className="text-sm text-gray-600">
                    Are you sure you want to proceed with this action?
                  </p>
                </>
              )}
              {malpracticeConfirmData?.type === "considerable" && (
                <>
                  <p className="font-semibold text-orange-600">
                    You are applying "{malpracticeConfirmData.level}"
                    malpractice level.
                  </p>
                  <p>
                    This will automatically mark the current submission as{" "}
                    <strong>Fail/Refer</strong> and allow only{" "}
                    <strong>1 further attempt</strong>. The student will not be
                    able to submit after their next attempt.
                  </p>
                  <p className="text-sm text-gray-600">
                    Are you sure you want to proceed with this action?
                  </p>
                </>
              )}
              {malpracticeConfirmData?.type === "severe" && (
                <>
                  <p className="font-semibold text-red-600">
                    You are applying "{malpracticeConfirmData.level}"
                    malpractice level.
                  </p>
                  <p>
                    This will automatically mark the current submission as{" "}
                    <strong>Fail/Refer</strong> and{" "}
                    <strong>block all further submission attempts</strong>. The
                    student will not be able to submit any more attempts for
                    this assessment.
                  </p>
                  <p className="text-sm text-gray-600">
                    This is a permanent action. Are you sure you want to
                    proceed?
                  </p>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="cancel-malpractice">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCompleteMarking}
              data-testid="confirm-malpractice"
              className={
                malpracticeConfirmData?.type === "severe"
                  ? "bg-red-600 hover:bg-red-700"
                  : malpracticeConfirmData?.type === "considerable"
                  ? "bg-orange-600 hover:bg-orange-700"
                  : "bg-yellow-600 hover:bg-yellow-700"
              }
            >
              Confirm and Complete Marking
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Marker File Confirmation Dialog */}
      <AlertDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Marker File</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{fileToDelete?.fileName}"? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setShowDeleteConfirm(false);
                setFileToDelete(null);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (fileToDelete) {
                  deleteMarkerFileMutation.mutate(fileToDelete.id);
                }
              }}
              disabled={deleteMarkerFileMutation.isPending}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleteMarkerFileMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
