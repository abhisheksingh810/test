import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { TreeNavigation } from "@/components/ui/tree-navigation";
import {
  BreadcrumbNavigation,
  buildBreadcrumbTrail,
} from "@/components/ui/breadcrumb-navigation";
import { Plus, Trash2, Edit3 } from "lucide-react";
import type {
  CourseNode,
  Assessment,
  InstructionSet,
  AssessmentSection,
  SectionMarkingOption,
  AssessmentGradeBoundary,
  InsertSectionMarkingOption,
} from "@shared/schema";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

// Form schemas
const courseNodeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  parentId: z.string().optional(),
});

const assessmentSchema = z.object({
  courseNodeId: z.string().min(1, "Course node is required"),
  instructionSetId: z.string().optional(),
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  status: z.enum(["active", "inactive", "draft", "archived"]).default("active"),
});

const sectionSchema = z.object({
  questionText: z.string().min(1, "Question text is required"),
});

const gradeBoundarySchema = z.object({
  gradeLabel: z.string().min(1, "Grade label is required"),
  marksFrom: z.number().min(0, "Minimum Marks must be 0 or higher"),
  marksTo: z.number(),
  isPass: z.boolean().default(false),
});

type CourseNodeFormData = z.infer<typeof courseNodeSchema>;
type AssessmentFormData = z.infer<typeof assessmentSchema>;
type SectionFormData = z.infer<typeof sectionSchema>;
type GradeBoundaryFormData = z.infer<typeof gradeBoundarySchema>;

// Section Card Component with marking options
function SectionCard({
  section,
  onCopy,
  onEdit,
  onDelete,
}: {
  section: AssessmentSection;
  onCopy: (sectionData: SectionFormData) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="p-4 border rounded-md">
      <div className="flex items-center justify-between gap-1 mb-2">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {section.questionText}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onCopy({ questionText: section?.questionText || "" })}
          >
            Copy
          </Button>
          <Button variant="outline" size="sm" onClick={onEdit}>
            Edit
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm">
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete the
                  question.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete} className="bg-red-500">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      <MaxMarksDisplay sectionId={section.id} />
    </div>
  );
}

// Component to display the maximum marks for a section based on marking options
function MaxMarksDisplay({ sectionId }: { sectionId: string }) {
  const { data: markingOptions = [], isLoading } = useQuery<
    SectionMarkingOption[]
  >({
    queryKey: ["/api/sections", sectionId, "marking-options"],
    queryFn: async () => {
      const response = await fetch(
        `/api/sections/${sectionId}/marking-options`,
        {
          credentials: "include",
        },
      );
      if (!response.ok) throw new Error("Failed to fetch marking options");
      return response.json();
    },
    enabled: !!sectionId,
  });

  if (isLoading) {
    return <span>Max Marks: ...</span>;
  }

  const maxMarks =
    markingOptions.length > 0
      ? Math.max(...markingOptions.map((option) => option.marks))
      : 0;

  return <span>Max Marks: {maxMarks}</span>;
}

export const HierarchicalCourseManagement = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State management
  const [selectedNode, setSelectedNode] = useState<CourseNode | null>(null);
  const [selectedAssessment, setSelectedAssessment] =
    useState<Assessment | null>(null);
  const [editingNode, setEditingNode] = useState<CourseNode | null>(null);
  const [showNodeForm, setShowNodeForm] = useState(false);
  const [createNodeParentId, setCreateNodeParentId] = useState<
    string | undefined
  >(undefined);
  const [createAssessmentNodeId, setCreateAssessmentNodeId] = useState<
    string | undefined
  >(undefined);

  // Section and Grade Boundary state
  const [showSectionForm, setShowSectionForm] = useState(false);
  const [editingSection, setEditingSection] =
    useState<AssessmentSection | null>(null);
  const [showGradeBoundaryForm, setShowGradeBoundaryForm] = useState(false);
  const [editingGradeBoundary, setEditingGradeBoundary] =
    useState<AssessmentGradeBoundary | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Fetch data
  const { data: courseNodes = [], isLoading: loadingNodes } = useQuery<
    CourseNode[]
  >({
    queryKey: ["/api/course-nodes"],
  });

  const { data: assessments = [], isLoading: loadingAssessments } = useQuery<
    Assessment[]
  >({
    queryKey: ["/api/assessments"],
  });

  // Auto-update selectedAssessment when assessments data changes
  useEffect(() => {
    if (selectedAssessment && assessments.length > 0) {
      const updatedAssessment = assessments.find(
        (a) => a.id === selectedAssessment.id,
      );
      if (
        updatedAssessment &&
        updatedAssessment.totalMarks !== selectedAssessment.totalMarks
      ) {
        setSelectedAssessment(updatedAssessment);
      }
    }
  }, [assessments, selectedAssessment]);

  const { data: instructionSets = [] } = useQuery<InstructionSet[]>({
    queryKey: ["/api/instruction-sets"],
  });

  // Fetch assessment details when an assessment is selected
  const { data: assessmentSections = [] } = useQuery<AssessmentSection[]>({
    queryKey: ["/api/assessments", selectedAssessment?.id, "sections"],
    enabled: !!selectedAssessment?.id,
  });

  const { data: assessmentGradeBoundaries = [] } = useQuery<
    AssessmentGradeBoundary[]
  >({
    queryKey: ["/api/assessments", selectedAssessment?.id, "grade-boundaries"],
    enabled: !!selectedAssessment?.id,
  });

  // Forms
  const nodeForm = useForm<CourseNodeFormData>({
    resolver: zodResolver(courseNodeSchema),
    defaultValues: {
      name: "",
      parentId: undefined,
    },
  });

  const assessmentForm = useForm<AssessmentFormData>({
    resolver: zodResolver(assessmentSchema),
    defaultValues: {
      courseNodeId: "",
      instructionSetId: "none",
      code: "",
      name: "",
      description: "",
      status: "active",
    },
  });

  const sectionForm = useForm<SectionFormData>({
    resolver: zodResolver(sectionSchema),
    defaultValues: {
      questionText: "",
    },
  });

  const gradeBoundaryForm = useForm<GradeBoundaryFormData>({
    resolver: zodResolver(gradeBoundarySchema),
    defaultValues: {
      gradeLabel: "",
      marksFrom: 0,
      marksTo: 100,
      isPass: false,
    },
  });

  // Course Node Mutations
  const moveNodeMutation = useMutation({
    mutationFn: async ({
      nodeId,
      newParentId,
    }: {
      nodeId: string;
      newParentId: string | null;
    }) => {
      const res = await fetch(`/api/course-nodes/${nodeId}/move`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId: newParentId }),
        credentials: "include",
      });

      if (!res.ok) {
        const errorData = await res
          .json()
          .catch(() => ({ message: "Failed to move folder" }));
        throw new Error(errorData.message || "Failed to move folder");
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/course-nodes"] });
      toast({ title: "Folder moved successfully" });
    },
    onError: (error) => {
      console.error("Move folder error:", error);
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const createNodeMutation = useMutation({
    mutationFn: async (data: CourseNodeFormData) => {
      const res = await fetch("/api/course-nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });

      if (!res.ok) {
        const errorData = await res
          .json()
          .catch(() => ({ message: "Failed to create folder" }));
        throw new Error(errorData.message || "Failed to create folder");
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/course-nodes"] });
      setShowNodeForm(false);
      nodeForm.reset();
      toast({ title: "Folder created successfully" });
    },
    onError: (error) => {
      console.error("Create folder error:", error);
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const updateNodeMutation = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<CourseNodeFormData>;
    }) => {
      const res = await fetch(`/api/course-nodes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });

      if (!res.ok) {
        const errorData = await res
          .json()
          .catch(() => ({ message: "Failed to update folder" }));
        throw new Error(errorData.message || "Failed to update folder");
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/course-nodes"] });
      setShowNodeForm(false);
      setEditingNode(null);
      nodeForm.reset();
      toast({ title: "Folder updated successfully" });
    },
    onError: (error) => {
      console.error("Update folder error:", error);
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const deleteNodeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/course-nodes/${id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        const errorData = await res
          .json()
          .catch(() => ({ message: "Failed to delete folder" }));
        throw new Error(errorData.message || "Failed to delete folder");
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/course-nodes"] });
      toast({ title: "Folder deleted successfully" });
    },
    onError: (error) => {
      console.error("Delete folder error:", error);
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const duplicateNodeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/course-nodes/${id}/duplicate`, {
        method: "POST",
        credentials: "include",
      });

      if (!res.ok) {
        const errorData = await res
          .json()
          .catch(() => ({ message: "Failed to duplicate folder" }));
        throw new Error(errorData.message || "Failed to duplicate folder");
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/course-nodes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assessments"] });
      toast({ title: "Folder duplicated successfully" });
    },
    onError: (error) => {
      console.error("Duplicate folder error:", error);
      toast({ title: error.message, variant: "destructive" });
    },
  });

  // Assessment Mutations
  const moveAssessmentMutation = useMutation({
    mutationFn: async ({
      assessmentId,
      newNodeId,
    }: {
      assessmentId: string;
      newNodeId: string;
    }) => {
      const res = await fetch(`/api/assessments/${assessmentId}/move`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseNodeId: newNodeId }),
        credentials: "include",
      });

      if (!res.ok) {
        const errorData = await res
          .json()
          .catch(() => ({ message: "Failed to move assessment" }));
        throw new Error(errorData.message || "Failed to move assessment");
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assessments"] });
      toast({ title: "Assessment moved successfully" });
    },
    onError: (error) => {
      console.error("Move assessment error:", error);
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const createAssessmentMutation = useMutation({
    mutationFn: async (data: AssessmentFormData) => {
      const res = await fetch("/api/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });

      if (!res.ok) {
        const errorData = await res
          .json()
          .catch(() => ({ message: "Failed to create assessment" }));
        throw new Error(errorData.message || "Failed to create assessment");
      }

      return res.json();
    },
    onSuccess: (newAssessment) => {
      queryClient.invalidateQueries({ queryKey: ["/api/assessments"] });
      setCreateAssessmentNodeId(undefined);
      setSelectedAssessment(newAssessment); // Select the newly created assessment
      toast({ title: "Assessment created successfully" });
    },
    onError: (error) => {
      console.error("Create assessment error:", error);
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const updateAssessmentMutation = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<AssessmentFormData>;
    }) => {
      const res = await fetch(`/api/assessments/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });

      if (!res.ok) {
        const errorData = await res
          .json()
          .catch(() => ({ message: "Failed to update assessment" }));
        throw new Error(errorData.message || "Failed to update assessment");
      }

      return res.json();
    },
    onSuccess: (updatedAssessment) => {
      queryClient.invalidateQueries({ queryKey: ["/api/assessments"] });
      setSelectedAssessment(updatedAssessment); // Update the selected assessment with new data
      toast({ title: "Assessment updated successfully" });
    },
    onError: (error) => {
      console.error("Update assessment error:", error);
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const deleteAssessmentMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/assessments/${id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        const errorData = await res
          .json()
          .catch(() => ({ message: "Failed to delete assessment" }));
        throw new Error(errorData.message || "Failed to delete assessment");
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assessments"] });
      setSelectedAssessment(null); // Clear selection if the deleted assessment was selected
      toast({ title: "Assessment deleted successfully" });
    },
    onError: (error) => {
      console.error("Delete assessment error:", error);
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const duplicateAssessmentMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/assessments/${id}/clone`, {
        method: "POST",
        credentials: "include",
      });

      if (!res.ok) {
        const errorData = await res
          .json()
          .catch(() => ({ message: "Failed to duplicate assessment" }));
        throw new Error(errorData.message || "Failed to duplicate assessment");
      }

      return res.json();
    },
    onSuccess: (clonedAssessment) => {
      queryClient.invalidateQueries({ queryKey: ["/api/assessments"] });
      setSelectedAssessment(clonedAssessment); // Select the newly cloned assessment
      toast({ title: "Assessment duplicated successfully" });
    },
    onError: (error) => {
      console.error("Duplicate assessment error:", error);
      toast({ title: error.message, variant: "destructive" });
    },
  });

  // Assessment Section Mutations
  const createSectionMutation = useMutation({
    mutationFn: async (
      data: SectionFormData & { order: number; isActive: string },
    ) => {
      if (!selectedAssessment) throw new Error("No assessment selected");
      const res = await fetch(
        `/api/assessments/${selectedAssessment.id}/sections`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          credentials: "include",
        },
      );
      if (!res.ok) {
        const errorData = await res
          .json()
          .catch(() => ({ message: "Failed to create section" }));
        throw new Error(errorData.message || "Failed to create section");
      }
      return res.json();
    },
    onSuccess: (createdSectionData) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/assessments", selectedAssessment?.id, "sections"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/assessments"] });
      setEditingSection(createdSectionData);
      toast({ title: "Section created successfully" });
    },
    onError: (error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const updateSectionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: SectionFormData }) => {
      const res = await fetch(`/api/assessments/sections/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const errorData = await res
          .json()
          .catch(() => ({ message: "Failed to update section" }));
        throw new Error(errorData.message || "Failed to update section");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/assessments", selectedAssessment?.id, "sections"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/assessments"] });
      toast({ title: "Section updated successfully" });
    },
    onError: (error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const deleteSectionMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/assessments/sections/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const errorData = await res
          .json()
          .catch(() => ({ message: "Failed to delete section" }));
        throw new Error(errorData.message || "Failed to delete section");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/assessments", selectedAssessment?.id, "sections"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/assessments"] });
      toast({ title: "Section deleted successfully" });
    },
    onError: (error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  // Assessment Grade Boundary Mutations
  const createGradeBoundaryMutation = useMutation({
    mutationFn: async (
      data: GradeBoundaryFormData & { order: number; isActive: string },
    ) => {
      if (!selectedAssessment) throw new Error("No assessment selected");
      const res = await fetch(
        `/api/assessments/${selectedAssessment.id}/grade-boundaries`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          credentials: "include",
        },
      );
      if (!res.ok) {
        const errorData = await res
          .json()
          .catch(() => ({ message: "Failed to create grade boundary" }));
        throw new Error(errorData.message || "Failed to create grade boundary");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [
          "/api/assessments",
          selectedAssessment?.id,
          "grade-boundaries",
        ],
      });
      setShowGradeBoundaryForm(false);
      gradeBoundaryForm.reset();
      toast({ title: "Grade boundary created successfully" });
    },
    onError: (error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const updateGradeBoundaryMutation = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: GradeBoundaryFormData;
    }) => {
      const res = await fetch(`/api/assessments/grade-boundaries/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const errorData = await res
          .json()
          .catch(() => ({ message: "Failed to update grade boundary" }));
        throw new Error(errorData.message || "Failed to update grade boundary");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [
          "/api/assessments",
          selectedAssessment?.id,
          "grade-boundaries",
        ],
      });
      setShowGradeBoundaryForm(false);
      setEditingGradeBoundary(null);
      gradeBoundaryForm.reset();
      toast({ title: "Grade boundary updated successfully" });
    },
    onError: (error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const deleteGradeBoundaryMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/assessments/grade-boundaries/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const errorData = await res
          .json()
          .catch(() => ({ message: "Failed to delete grade boundary" }));
        throw new Error(errorData.message || "Failed to delete grade boundary");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [
          "/api/assessments",
          selectedAssessment?.id,
          "grade-boundaries",
        ],
      });
      toast({ title: "Grade boundary deleted successfully" });
    },
    onError: (error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  // Event handlers
  const handleNodeSelect = (node: CourseNode) => {
    setSelectedNode(node);
    setSelectedAssessment(null); // Clear assessment selection when selecting folder
    // Reset form when selecting different node
    nodeForm.reset({
      name: node.name,
      parentId: node.parentId || undefined,
    });
  };

  const handleCreateNode = (parentId?: string) => {
    setCreateNodeParentId(parentId);
    setEditingNode(null);
    nodeForm.reset({
      name: "",
      parentId: parentId,
    });
    setShowNodeForm(true);
  };

  const handleEditNode = (node: CourseNode) => {
    setEditingNode(node);
    setCreateNodeParentId(undefined);
    nodeForm.reset({
      name: node.name,
      parentId: node.parentId || undefined,
    });
    setShowNodeForm(true);
  };

  const handleDeleteNode = (node: CourseNode) => {
    deleteNodeMutation.mutate(node.id);
  };

  const handleDuplicateNode = (node: CourseNode) => {
    duplicateNodeMutation.mutate(node.id);
  };

  const handleMoveNode = (nodeId: string, newParentId: string | null) => {
    moveNodeMutation.mutate({ nodeId, newParentId });

    // Update selected node if it's the one being moved
    if (selectedNode && selectedNode.id === nodeId) {
      setSelectedNode({
        ...selectedNode,
        parentId: newParentId,
      });
    }
  };

  const handleMoveAssessment = (assessmentId: string, newNodeId: string) => {
    moveAssessmentMutation.mutate({ assessmentId, newNodeId });
  };

  const handleCreateAssessment = (nodeId: string) => {
    setCreateAssessmentNodeId(nodeId);
    setSelectedAssessment(null);
    setSelectedNode(null);
    assessmentForm.reset({
      courseNodeId: nodeId,
      instructionSetId: "none",
      code: "",
      name: "",
      description: "",
      status: "active",
    });
  };

  const handleEditAssessment = (assessment: Assessment) => {
    setSelectedAssessment(assessment);
    setSelectedNode(null); // Clear folder selection when selecting assessment
    assessmentForm.reset({
      courseNodeId: assessment.courseNodeId || "",
      instructionSetId: assessment.instructionSetId || "none",
      code: assessment.code,
      name: assessment.name,
      description: assessment.description || "",
      status: assessment.status,
    });
  };

  const handleDeleteAssessment = (assessment: Assessment) => {
    deleteAssessmentMutation.mutate(assessment.id);
  };

  const handleDuplicateAssessment = (assessment: Assessment) => {
    duplicateAssessmentMutation.mutate(assessment.id);
  };

  const handleBreadcrumbNavigate = (item: any) => {
    if (item.id === "root") {
      setSelectedNode(null);
    } else if (item.node) {
      setSelectedNode(item.node);
    }
  };

  const onSubmitNode = (data: CourseNodeFormData) => {
    if (editingNode) {
      updateNodeMutation.mutate({ id: editingNode.id, data });
    } else {
      createNodeMutation.mutate(data);
    }
  };

  const onSubmitAssessment = (data: AssessmentFormData) => {
    // Convert "none" back to empty string for instructionSetId, also handle undefined/null
    const processedData = {
      ...data,
      instructionSetId:
        !data.instructionSetId || data.instructionSetId === "none"
          ? undefined
          : data.instructionSetId,
    };

    if (selectedAssessment) {
      updateAssessmentMutation.mutate({
        id: selectedAssessment.id,
        data: processedData,
      });
    } else {
      createAssessmentMutation.mutate(processedData);
    }
  };

  const onSubmitSection = async (data: SectionFormData) => {
    if (editingSection) {
      updateSectionMutation.mutate({ id: editingSection.id, data });
    } else {
      // Calculate the next order value for new sections
      const nextOrder = assessmentSections.length + 1;
      const sectionData = {
        ...data,
        order: nextOrder,
        isActive: "true",
      };
      const createdSection =
        await createSectionMutation.mutateAsync(sectionData);

      // If we have copied options, use the bulk endpoint
      if (copiedMarkingOptions.length > 0) {
        await fetch(`/api/sections/${createdSection.id}/marking-options/bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(copiedMarkingOptions),
        });

        setCopiedMarkingOptions([]);
        queryClient.invalidateQueries({
          queryKey: ["/api/sections", createdSection.id, "marking-options"],
        });
      }
    }
  };

  const onSubmitGradeBoundary = (data: GradeBoundaryFormData) => {
    if (editingGradeBoundary) {
      updateGradeBoundaryMutation.mutate({ id: editingGradeBoundary.id, data });
    } else {
      // Calculate the next order value for new grade boundaries
      const nextOrder = assessmentGradeBoundaries.length + 1;
      const gradeBoundaryData = {
        ...data,
        order: nextOrder,
        isActive: "true",
      };
      createGradeBoundaryMutation.mutate(gradeBoundaryData);
    }
  };

  // Section and Grade Boundary handlers
  const handleAddSection = () => {
    setEditingSection(null);
    sectionForm.reset({
      questionText: "",
    });
    setShowSectionForm(true);
  };

  const [copiedMarkingOptions, setCopiedMarkingOptions] = useState<
    SectionMarkingOption[]
  >([]);

  const handleCopySection = async (section: AssessmentSection) => {
    // Prefill form with existing question text
    sectionForm.reset({
      questionText: section.questionText || "",
    });
    setEditingSection(null); // ensure it's treated as "new"
    setShowSectionForm(true);

    // Fetch marking options for the section
    try {
      const response = await fetch(
        `/api/sections/${section.id}/marking-options`,
        {
          credentials: "include",
        },
      );
      if (!response.ok) throw new Error("Failed to fetch marking options");
      const options = await response.json();
      setCopiedMarkingOptions(options);
    } catch (err) {
      console.error(err);
      setCopiedMarkingOptions([]);
    }
  };

  const handleEditSection = (section: AssessmentSection) => {
    setEditingSection(section);
    sectionForm.reset({
      questionText: section.questionText || "",
    });
    setShowSectionForm(true);
  };

  const handleDeleteSection = async (sectionId: string) => {
    deleteSectionMutation.mutate(sectionId);
  };

  const handleAddGradeBoundary = () => {
    setEditingGradeBoundary(null);
    gradeBoundaryForm.reset();
    setShowGradeBoundaryForm(true);
  };

  const handleEditGradeBoundary = (boundary: AssessmentGradeBoundary) => {
    setEditingGradeBoundary(boundary);
    gradeBoundaryForm.reset({
      gradeLabel: boundary.gradeLabel,
      marksFrom: boundary.marksFrom,
      marksTo: boundary.marksTo,
      isPass: boundary.isPass,
    });
    setShowGradeBoundaryForm(true);
  };

  const handleDeleteGradeBoundary = (boundary: AssessmentGradeBoundary) => {
      deleteGradeBoundaryMutation.mutate(boundary.id);
  };

  const breadcrumbItems = selectedNode
    ? buildBreadcrumbTrail(selectedNode, courseNodes)
    : [];

  if (loadingNodes || loadingAssessments) {
    return <div className="flex justify-center p-8">Loading...</div>;
  }

  return (
    <div className="space-y-6" data-testid="hierarchical-course-management">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Course Management</h2>
      </div>

      {/* Breadcrumb Navigation */}
      {breadcrumbItems.length > 0 && (
        <BreadcrumbNavigation
          items={breadcrumbItems}
          onNavigate={handleBreadcrumbNavigate}
          className="mb-4"
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tree Navigation */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Course Structure</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <TreeNavigation
                nodes={courseNodes}
                assessments={assessments}
                selectedNodeId={selectedNode?.id}
                selectedAssessmentId={selectedAssessment?.id}
                selectedNode={selectedNode}
                onNodeSelect={handleNodeSelect}
                onCreateNode={handleCreateNode}
                onEditNode={handleEditNode}
                onDeleteNode={handleDeleteNode}
                onDuplicateNode={handleDuplicateNode}
                onCreateAssessment={handleCreateAssessment}
                onEditAssessment={handleEditAssessment}
                onDeleteAssessment={handleDeleteAssessment}
                onDuplicateAssessment={handleDuplicateAssessment}
                onMoveNode={handleMoveNode}
                onMoveAssessment={handleMoveAssessment}
              />
            </CardContent>
          </Card>
        </div>

        {/* Content Area */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>
                {selectedAssessment
                  ? `${selectedAssessment.name} Details`
                  : selectedNode
                    ? `${selectedNode.name} Details`
                    : "Course Management"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedAssessment ? (
                <div className="space-y-6">
                  {/* Assessment Basic Information */}
                  <div>
                    <h3 className="font-medium mb-4">Assessment Information</h3>
                    <Form {...assessmentForm}>
                      <form
                        onSubmit={assessmentForm.handleSubmit(
                          onSubmitAssessment,
                        )}
                        className="space-y-4"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <FormField
                            control={assessmentForm.control}
                            name="name"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Assessment Name</FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    data-testid="assessment-name-input"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={assessmentForm.control}
                            name="code"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Assessment Code</FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    data-testid="assessment-code-input"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <FormField
                          control={assessmentForm.control}
                          name="description"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Description</FormLabel>
                              <FormControl>
                                <Textarea
                                  {...field}
                                  data-testid="assessment-description-input"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <FormField
                            control={assessmentForm.control}
                            name="courseNodeId"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Folder</FormLabel>
                                <Select
                                  onValueChange={field.onChange}
                                  value={field.value}
                                >
                                  <FormControl>
                                    <SelectTrigger data-testid="assessment-folder-select">
                                      <SelectValue placeholder="Select folder" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {courseNodes.map((node) => (
                                      <SelectItem key={node.id} value={node.id}>
                                        {node.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={assessmentForm.control}
                            name="status"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Status</FormLabel>
                                <Select
                                  onValueChange={field.onChange}
                                  value={field.value}
                                >
                                  <FormControl>
                                    <SelectTrigger data-testid="assessment-status-select">
                                      <SelectValue />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="active">
                                      Active
                                    </SelectItem>
                                    <SelectItem value="inactive">
                                      Inactive
                                    </SelectItem>
                                    <SelectItem value="draft">Draft</SelectItem>
                                    <SelectItem value="archived">
                                      Archived
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <FormField
                          control={assessmentForm.control}
                          name="instructionSetId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Instruction Set (Optional)</FormLabel>
                              <Select
                                onValueChange={(value) =>
                                  field.onChange(value === "none" ? "" : value)
                                }
                                value={field.value || "none"}
                              >
                                <FormControl>
                                  <SelectTrigger data-testid="assessment-instruction-set-select">
                                    <SelectValue placeholder="Select instruction set" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="none">None</SelectItem>
                                  {instructionSets.map((instructionSet) => (
                                    <SelectItem
                                      key={instructionSet.id}
                                      value={instructionSet.id}
                                    >
                                      {instructionSet.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="flex justify-end">
                          <Button
                            type="submit"
                            disabled={
                              createAssessmentMutation.isPending ||
                              updateAssessmentMutation.isPending
                            }
                            data-testid="save-assessment-button"
                          >
                            {createAssessmentMutation.isPending ||
                            updateAssessmentMutation.isPending
                              ? "Saving..."
                              : "Save Assessment"}
                          </Button>
                        </div>
                      </form>
                    </Form>
                  </div>

                  {/* Assessment Sections */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-medium">Assessment Sections</h3>
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={() => {
                            // Trigger total marks recalculation
                            const recalculateMarks = async () => {
                              try {
                                const response = await fetch(
                                  `/api/assessments/${selectedAssessment.id}/recalculate-total-marks`,
                                  {
                                    method: "PUT",
                                    credentials: "include",
                                  },
                                );
                                if (!response.ok)
                                  throw new Error(
                                    "Failed to recalculate total marks",
                                  );

                                // The backend now automatically recalculates, just refresh data
                                queryClient.invalidateQueries({
                                  queryKey: ["/api/assessments"],
                                });
                                toast({
                                  title:
                                    "Total marks recalculated successfully",
                                });
                              } catch (error) {
                                toast({
                                  title: "Failed to recalculate total marks",
                                  variant: "destructive",
                                });
                              }
                            };
                            recalculateMarks();
                          }}
                          variant="outline"
                          size="sm"
                          data-testid="recalculate-marks-button"
                        >
                          Recalculate Marks
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleAddSection}
                          data-testid="add-assessment-section"
                        >
                          Add Question
                        </Button>
                      </div>
                    </div>

                    {/* Total marks display */}
                    {selectedAssessment.totalMarks !== undefined && (
                      <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">
                            Total Marks Available:
                          </span>
                          <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                            {selectedAssessment.totalMarks}
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="space-y-3">
                      {assessmentSections.map((section) => (
                        <SectionCard
                          key={section.id}
                          section={section}
                          onCopy={() => handleCopySection(section)}
                          onEdit={() => handleEditSection(section)}
                          onDelete={() => handleDeleteSection(section.id)}
                        />
                      ))}
                      {assessmentSections.length === 0 && (
                        <p className="text-gray-500 text-center py-4">
                          No sections added yet
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Grade Boundaries */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-medium">Grade Boundaries</h3>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleAddGradeBoundary}
                        data-testid="add-grade-boundary"
                      >
                        Add Grade Boundary
                      </Button>
                    </div>
                    <div className="space-y-3">
                      {assessmentGradeBoundaries.map((boundary) => (
                        <div
                          key={boundary.id}
                          className="p-4 border rounded-md"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="font-medium">
                                {boundary.gradeLabel}
                              </h4>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                {boundary.marksFrom} -{" "}
                                {boundary.marksTo}
                                {boundary.isPass && " (Pass)"}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  handleEditGradeBoundary(boundary)
                                }
                              >
                                Edit
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="outline" size="sm">
                                    Delete
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This action cannot be undone. This will permanently delete the grade boundary.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() =>
                                        handleDeleteGradeBoundary(boundary)
                                      } className="bg-red-500">
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>
                        </div>
                      ))}
                      {assessmentGradeBoundaries.length === 0 && (
                        <p className="text-gray-500 text-center py-4">
                          No grade boundaries set yet
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ) : selectedNode ? (
                <div className="space-y-4">
                  <div>
                    <h3 className="font-medium mb-2">Folder Information</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Name: {selectedNode.name}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Created:{" "}
                      {selectedNode.createdAt
                        ? new Date(selectedNode.createdAt).toLocaleString()
                        : "Unknown"}
                    </p>

                    {/* Parent Selection */}
                    <div className="mt-4">
                      <Label
                        htmlFor="parent-select"
                        className="text-sm font-medium"
                      >
                        Parent Folder
                      </Label>
                      <Select
                        value={selectedNode.parentId || "root"}
                        onValueChange={(value) => {
                          const newParentId = value === "root" ? null : value;
                          if (newParentId !== selectedNode.parentId) {
                            handleMoveNode(selectedNode.id, newParentId);
                          }
                        }}
                      >
                        <SelectTrigger
                          className="mt-1"
                          data-testid="parent-select"
                        >
                          <SelectValue placeholder="Select parent folder" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="root">Root (No Parent)</SelectItem>
                          {courseNodes
                            .filter((node) => {
                              // Filter out the current node and its children to prevent circular references
                              const isCurrentNode = node.id === selectedNode.id;
                              const isChildOfCurrent = (
                                nodeId: string,
                              ): boolean => {
                                const childNode = courseNodes.find(
                                  (n) => n.id === nodeId,
                                );
                                if (!childNode || !childNode.parentId)
                                  return false;
                                if (childNode.parentId === selectedNode.id)
                                  return true;
                                return isChildOfCurrent(childNode.parentId);
                              };
                              return (
                                !isCurrentNode && !isChildOfCurrent(node.id)
                              );
                            })
                            .map((node) => (
                              <SelectItem key={node.id} value={node.id}>
                                {node.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-medium mb-2">
                      Assessments in this folder
                    </h3>
                    <div className="space-y-2">
                      {assessments
                        .filter(
                          (assessment) =>
                            assessment.courseNodeId === selectedNode.id,
                        )
                        .map((assessment) => (
                          <div
                            key={assessment.id}
                            className="p-3 border rounded-md"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium">{assessment.name}</p>
                                <p className="text-sm text-gray-600">
                                  {assessment.code}
                                </p>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEditAssessment(assessment)}
                                data-testid={`edit-assessment-${assessment.id}`}
                              >
                                Edit
                              </Button>
                            </div>
                          </div>
                        ))}

                      <Button
                        variant="outline"
                        onClick={() => handleCreateAssessment(selectedNode.id)}
                        data-testid={`add-assessment-to-${selectedNode.id}`}
                      >
                        Add Assessment
                      </Button>
                    </div>
                  </div>
                </div>
              ) : createAssessmentNodeId ? (
                <div className="space-y-6">
                  {/* Creating New Assessment */}
                  <div>
                    <h3 className="font-medium mb-4">Create New Assessment</h3>
                    <Form {...assessmentForm}>
                      <form
                        onSubmit={assessmentForm.handleSubmit(
                          onSubmitAssessment,
                        )}
                        className="space-y-4"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <FormField
                            control={assessmentForm.control}
                            name="name"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Assessment Name</FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    data-testid="assessment-name-input"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={assessmentForm.control}
                            name="code"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Assessment Code</FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    data-testid="assessment-code-input"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <FormField
                          control={assessmentForm.control}
                          name="description"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Description</FormLabel>
                              <FormControl>
                                <Textarea
                                  {...field}
                                  data-testid="assessment-description-input"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <FormField
                            control={assessmentForm.control}
                            name="courseNodeId"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Folder</FormLabel>
                                <Select
                                  onValueChange={field.onChange}
                                  value={field.value}
                                >
                                  <FormControl>
                                    <SelectTrigger data-testid="assessment-folder-select">
                                      <SelectValue placeholder="Select folder" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {courseNodes.map((node) => (
                                      <SelectItem key={node.id} value={node.id}>
                                        {node.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={assessmentForm.control}
                            name="status"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Status</FormLabel>
                                <Select
                                  onValueChange={field.onChange}
                                  value={field.value}
                                >
                                  <FormControl>
                                    <SelectTrigger data-testid="assessment-status-select">
                                      <SelectValue />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="active">
                                      Active
                                    </SelectItem>
                                    <SelectItem value="inactive">
                                      Inactive
                                    </SelectItem>
                                    <SelectItem value="draft">Draft</SelectItem>
                                    <SelectItem value="archived">
                                      Archived
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <FormField
                          control={assessmentForm.control}
                          name="instructionSetId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Instruction Set (Optional)</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                value={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger data-testid="assessment-instruction-set-select">
                                    <SelectValue placeholder="Select instruction set" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="none">None</SelectItem>
                                  {instructionSets.map((instructionSet) => (
                                    <SelectItem
                                      key={instructionSet.id}
                                      value={instructionSet.id}
                                    >
                                      {instructionSet.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setCreateAssessmentNodeId(undefined);
                              assessmentForm.reset();
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="submit"
                            disabled={createAssessmentMutation.isPending}
                            data-testid="save-assessment-button"
                          >
                            {createAssessmentMutation.isPending
                              ? "Creating..."
                              : "Create Assessment"}
                          </Button>
                        </div>
                      </form>
                    </Form>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400 mb-4">
                    Select a folder or assessment from the tree to view its
                    details, or create a new folder to get started.
                  </p>
                  <Button onClick={() => handleCreateNode()}>
                    Create Folder
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Course Node Form Dialog */}
      <Dialog open={showNodeForm} onOpenChange={setShowNodeForm}>
        <DialogContent data-testid="node-form-dialog">
          <DialogHeader>
            <DialogTitle>
              {editingNode ? "Edit Folder" : "Create New Folder"}
            </DialogTitle>
          </DialogHeader>
          <Form {...nodeForm}>
            <form
              onSubmit={nodeForm.handleSubmit(onSubmitNode)}
              className="space-y-4"
            >
              <FormField
                control={nodeForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Folder Name</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="node-name-input" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {createNodeParentId && (
                <FormField
                  control={nodeForm.control}
                  name="parentId"
                  render={({ field }) => {
                    const parentNode = courseNodes.find(
                      (node) => node.id === createNodeParentId,
                    );
                    return (
                      <FormItem>
                        <FormLabel>Parent Folder</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            disabled
                            value={parentNode?.name || "Root"}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
              )}

              <div className="flex justify-end space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowNodeForm(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    createNodeMutation.isPending || updateNodeMutation.isPending
                  }
                  data-testid="save-node-button"
                >
                  {editingNode ? "Update" : "Create"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Section Form Dialog */}
      <Dialog open={showSectionForm} onOpenChange={setShowSectionForm}>
        <DialogContent className="max-h-[100dvh] overflow-y-scroll">
          <DialogHeader>
            <DialogTitle>
              {editingSection ? "Edit Section" : "Add Section"}
            </DialogTitle>
          </DialogHeader>
          <Form {...sectionForm}>
            <form
              onSubmit={sectionForm.handleSubmit(onSubmitSection)}
              className="space-y-4"
            >
              <FormField
                control={sectionForm.control}
                name="questionText"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Question Text</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        data-testid="section-question-text-input"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Marking Options Section */}
              {editingSection && (
                <div className="space-y-4 border-t pt-4">
                  <h4 className="text-sm font-medium">Marking Options</h4>
                  <SectionMarkingOptionsDisplay
                    sectionId={editingSection.id}
                    showAddForm={showAddForm}
                    setShowAddForm={setShowAddForm}
                  />
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowSectionForm(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    createSectionMutation.isPending ||
                    updateSectionMutation.isPending
                  }
                >
                  {createSectionMutation.isPending ||
                  updateSectionMutation.isPending
                    ? "Saving..."
                    : "Save"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Grade Boundary Form Dialog */}
      <Dialog
        open={showGradeBoundaryForm}
        onOpenChange={setShowGradeBoundaryForm}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingGradeBoundary
                ? "Edit Grade Boundary"
                : "Add Grade Boundary"}
            </DialogTitle>
          </DialogHeader>
          <Form {...gradeBoundaryForm}>
            <form
              onSubmit={gradeBoundaryForm.handleSubmit(onSubmitGradeBoundary)}
              className="space-y-4"
            >
              <FormField
                control={gradeBoundaryForm.control}
                name="gradeLabel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Grade Label</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="e.g., A+, B, Pass"
                        data-testid="grade-label-input"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={gradeBoundaryForm.control}
                  name="marksFrom"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Marks From</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          min="0"
                          onChange={(e) =>
                            field.onChange(parseFloat(e.target.value) || 0)
                          }
                          data-testid="percentage-from-input"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={gradeBoundaryForm.control}
                  name="marksTo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Marks To</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          min="0"
                          onChange={(e) =>
                            field.onChange(parseFloat(e.target.value) || 100)
                          }
                          data-testid="percentage-to-input"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={gradeBoundaryForm.control}
                name="isPass"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                    <FormControl>
                      <input
                        type="checkbox"
                        checked={field.value}
                        onChange={field.onChange}
                        data-testid="is-pass-checkbox"
                        className="mt-1"
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Is this a passing grade?</FormLabel>
                    </div>
                  </FormItem>
                )}
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowGradeBoundaryForm(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    createGradeBoundaryMutation.isPending ||
                    updateGradeBoundaryMutation.isPending
                  }
                >
                  {createGradeBoundaryMutation.isPending ||
                  updateGradeBoundaryMutation.isPending
                    ? "Saving..."
                    : "Save"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Simple component to display marking options for a section in the edit dialog
function SectionMarkingOptionsDisplay({
  sectionId,
  showAddForm,
  setShowAddForm,
}: {
  sectionId: string;
  showAddForm: boolean;
  setShowAddForm: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [markingOptions, setMarkingOptions] = useState<SectionMarkingOption[]>(
    [],
  );
  const [newOption, setNewOption] = useState({ label: "", marks: 0 });

  // Fetch marking options
  const { data: options = [], isLoading } = useQuery<SectionMarkingOption[]>({
    queryKey: ["/api/sections", sectionId, "marking-options"],
    queryFn: async () => {
      const response = await fetch(
        `/api/sections/${sectionId}/marking-options`,
        {
          credentials: "include",
        },
      );
      if (!response.ok) throw new Error("Failed to fetch marking options");
      return response.json();
    },
    enabled: !!sectionId,
  });

  useEffect(() => {
    if (options) {
      setMarkingOptions(options);
    }
  }, [options]);

  const addOption = async () => {
    if (!newOption.label.trim() || newOption.marks < 0) {
      toast({
        title: "Please enter valid label and marks",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch(
        `/api/sections/${sectionId}/marking-options`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            sectionId,
            label: newOption.label,
            marks: newOption.marks,
            order: markingOptions.length + 1,
            isActive: "true",
          }),
        },
      );

      const data = await response.json();
      if (response.ok) {
        setMarkingOptions([...markingOptions, data]);
        setNewOption({ label: "", marks: 0 });
        setShowAddForm(false);
        queryClient.invalidateQueries({
          queryKey: ["/api/sections", sectionId, "marking-options"],
        });
        toast({ title: "Marking option added successfully" });
      } else {
        throw new Error(data?.message || "Failed to create marking option");
      }
    } catch (error: any) {
      toast({ title: error?.message, variant: "destructive" });
    }
  };

  const deleteOption = async (optionId: string) => {
    try {
      const response = await fetch(
        `/api/sections/marking-options/${optionId}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );

      if (response.ok) {
        setMarkingOptions(markingOptions.filter((opt) => opt.id !== optionId));
        queryClient.invalidateQueries({
          queryKey: ["/api/sections", sectionId, "marking-options"],
        });
        toast({ title: "Marking option deleted successfully" });
      } else {
        throw new Error("Failed to delete marking option");
      }
    } catch (error) {
      toast({
        title: "Failed to delete marking option",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="text-sm text-gray-500">Loading marking options...</div>
    );
  }

  return (
    <div className="space-y-3">
      {markingOptions.length > 0 ? (
        <div className="space-y-2">
          {markingOptions.map((option) => (
            <div
              key={option.id}
              className="flex items-center justify-between p-2 border rounded bg-gray-50 dark:bg-gray-700"
            >
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">#{option.order}</span>
                <span className="font-medium">{option.label}</span>
                <Badge variant="outline">{option.marks} marks</Badge>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => deleteOption(option.id)}
                className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500">No marking options defined yet.</p>
      )}

      {showAddForm ? (
        <div className="border rounded p-3 space-y-3 bg-gray-50 dark:bg-gray-700">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Option Label</Label>
              <Input
                placeholder="e.g., Fail, Pass"
                value={newOption.label}
                onChange={(e) =>
                  setNewOption({ ...newOption, label: e.target.value })
                }
                className="h-8"
              />
            </div>
            <div>
              <Label className="text-xs">Marks</Label>
              <Input
                type="number"
                min="0"
                step="0.1"
                value={newOption.marks}
                onChange={(e) =>
                  setNewOption({
                    ...newOption,
                    marks: parseFloat(e.target.value) || 0,
                  })
                }
                className="h-8"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" type="button" onClick={addOption}>
              Add
            </Button>
            <Button
              size="sm"
              type="button"
              variant="outline"
              onClick={() => {
                setNewOption({ label: "", marks: 0 });
                setShowAddForm(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          type="button"
          variant="outline"
          onClick={() => setShowAddForm(true)}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Marking Option
        </Button>
      )}
    </div>
  );
}
