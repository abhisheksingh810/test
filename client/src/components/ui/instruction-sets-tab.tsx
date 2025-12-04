import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "./card";
import { Button } from "./button";
import { Input } from "./input";
import { Label } from "./label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";
import { Textarea } from "./textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";
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
import { WysiwygEditor } from "./wysiwyg-editor";
import { createSafeHtml, createSafePreview } from "@/lib/html-sanitizer";
import type { InstructionSet, InstructionStep } from "@shared/schema";
import {
  Plus,
  Edit,
  Trash2,
  Loader,
  Presentation,
  FileText,
} from "lucide-react";
import { prependHttpToLinks } from "@/lib/utils";

interface InstructionSetsTabProps {}

export function InstructionSetsTab({}: InstructionSetsTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Instruction sets management state
  const [selectedInstructionSet, setSelectedInstructionSet] = useState<
    string | null
  >(null);
  const [isCreateSetDialogOpen, setIsCreateSetDialogOpen] = useState(false);
  const [isEditSetDialogOpen, setIsEditSetDialogOpen] = useState(false);
  const [editingSet, setEditingSet] = useState<InstructionSet | null>(null);
  const [newSet, setNewSet] = useState({
    name: "",
    slug: "",
    instructionSetCode: "",
    description: "",
    submissionTitle: "",
    completionMessage: "",
  });

  // Instruction steps state for selected set
  const [showStepModal, setShowStepModal] = useState(false);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);

  // Delete confirmation dialogs state
  const [showDeleteSetDialog, setShowDeleteSetDialog] = useState(false);
  const [showDeleteStepDialog, setShowDeleteStepDialog] = useState(false);
  const [stepToDelete, setStepToDelete] = useState<InstructionStep | null>(
    null,
  );
  const [newStepData, setNewStepData] = useState<{
    stepNumber: string;
    title: string;
    content: string;
    stepType: "info" | "checkbox" | "upload";
    checkboxItems: string[];
    isActive: string;
    instructionSetId: string;
  }>({
    stepNumber: "",
    title: "",
    content: "",
    stepType: "info",
    checkboxItems: [],
    isActive: "true",
    instructionSetId: "",
  });

  // Instruction sets query
  const { data: instructionSets, isLoading: setsLoading } = useQuery({
    queryKey: ["/api/instruction-sets"],
    staleTime: 60 * 1000, // 1 minute
  });

  // Fetch instruction steps for the selected set
  const {
    data: currentInstructionSteps = [],
    isLoading: stepsLoading,
    refetch: refetchSteps,
  } = useQuery({
    queryKey: ["/api/instruction-steps", selectedInstructionSet],
    queryFn: async () => {
      if (!selectedInstructionSet) return [];
      const response = await fetch(
        `/api/instruction-steps/${selectedInstructionSet}`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch instruction steps");
      }
      return await response.json();
    },
    enabled: !!selectedInstructionSet,
  });

  const sets: InstructionSet[] = (instructionSets as InstructionSet[]) || [];

  // Save instruction steps mutation
  const saveInstructionStepsMutation = useMutation({
    mutationFn: async (steps: InstructionStep[]) => {
      const response = await apiRequest(
        "POST",
        "/api/instruction-steps",
        steps,
      );
      if (!response.ok) {
        throw new Error("Failed to save instruction steps");
      }
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/instruction-steps", selectedInstructionSet],
      });
      refetchSteps();
    },
  });

  // Create instruction set mutation
  const createSetMutation = useMutation({
    mutationFn: async (setData: typeof newSet) => {
      console.log("🚀 Creating instruction set with data:", setData);

      const response = await apiRequest("POST", `/api/instruction-sets`, {
        ...setData,
        isActive: "true",
      });

      console.log(
        "📥 Response received:",
        response.status,
        response.statusText,
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ API Error Response:", errorText);
        throw new Error(
          `Failed to create instruction set: ${response.status} ${errorText}`,
        );
      }

      const result = await response.json();
      console.log("✅ Success response:", result);
      return result;
    },
    onSuccess: (newSet: InstructionSet) => {
      queryClient.invalidateQueries({ queryKey: ["/api/instruction-sets"] });
      setIsCreateSetDialogOpen(false);
      setSelectedInstructionSet(newSet.id);
      setNewSet({
        name: "",
        slug: "",
        instructionSetCode: "",
        description: "",
        completionMessage: "",
        submissionTitle: "",
      });
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
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<InstructionSet>;
    }) => {
      const response = await apiRequest(
        "PUT",
        `/api/instruction-sets/${id}`,
        data,
      );
      if (!response.ok) {
        throw new Error("Failed to update instruction set");
      }
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/instruction-sets"] });
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
      const response = await apiRequest(
        "DELETE",
        `/api/instruction-sets/${id}`,
      );
      if (!response.ok) {
        throw new Error("Failed to delete instruction set");
      }
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/instruction-sets"] });
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

  // Save instruction step mutation - only saves steps for the selected set
  const saveStepMutation = useMutation({
    mutationFn: async (stepData: any) => {
      if (!selectedInstructionSet) {
        throw new Error("No instruction set selected");
      }

      // Work with current instruction steps for this set only
      const currentSetSteps = Array.isArray(currentInstructionSteps)
        ? currentInstructionSteps
        : [];

      stepData.content = prependHttpToLinks(stepData.content);
      console.log(stepData);
      let updatedStepsForSet;
      if (editingStepId) {
        // Update existing step within current set
        updatedStepsForSet = currentSetSteps.map((step) =>
          step.id === editingStepId
            ? { ...step, ...stepData, instructionSetId: selectedInstructionSet }
            : step,
        );
      } else {
        // Add new step to current set
        const newStep = {
          ...stepData,
          instructionSetId: selectedInstructionSet,
        };
        updatedStepsForSet = [...currentSetSteps, newStep];
      }

      // Only save steps for this specific instruction set
      return await saveInstructionStepsMutation.mutateAsync(updatedStepsForSet);
    },
    onSuccess: (data) => {
      setShowStepModal(false);
      setEditingStepId(null);
      setNewStepData({
        stepNumber: "",
        title: "",
        content: "",
        stepType: "info",
        checkboxItems: [],
        isActive: "true",
        instructionSetId: selectedInstructionSet || "",
      });
      toast({
        title: "Success",
        description: `Instruction step ${editingStepId ? "updated" : "created"} successfully.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save instruction step.",
        variant: "destructive",
      });
    },
  });

  const handleCreateNewInstructionSet = () => {
    if (!newSet.name.trim() || !newSet.instructionSetCode.trim()) {
      toast({
        title: "Validation Error",
        description: "Mandatory fields are required.",
        variant: "destructive",
      });
      return;
    }

    const formatSlug = (slug: string) => {
      return slug
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    };

    // Generate slug from name if not provided
    const slug = formatSlug(
      newSet.instructionSetCode.trim() || newSet.name.trim(),
    );

    createSetMutation.mutate({
      ...newSet,
      slug,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Presentation className="mr-2" size={20} />
            Instruction Sets Management
          </CardTitle>
          <CardDescription>
            Create and manage different sets of instructions for various courses
            and assignments. Each set can be accessed via URL parameters like
            ?set=physics.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-end mb-4">
            <Button
              onClick={() => setIsCreateSetDialogOpen(true)}
              className="inline-flex items-center"
            >
              <Plus className="mr-2" size={16} />
              Create New Set
            </Button>
          </div>

          {/* Instruction Sets List */}
          {sets.length > 0 ? (
            <div className="space-y-3">
              <Label className="text-sm font-medium">
                Available Instruction Sets:
              </Label>
              <div className="grid gap-3">
                {sets.map((set) => (
                  <div
                    key={set.id}
                    className={`p-4 border rounded-lg cursor-pointer transition-all hover:shadow-md ${
                      selectedInstructionSet === set.id
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                        : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                    }`}
                    onClick={() => setSelectedInstructionSet(set.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-gray-900 dark:text-gray-100">
                            {set.name}
                          </h4>
                          <span className="text-xs bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-300 px-2 py-1 rounded font-medium">
                            {(set as any).instructionSetCode || "No Code"}
                          </span>
                          {selectedInstructionSet === set.id && (
                            <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded">
                              Selected
                            </span>
                          )}
                        </div>
                        {set.description && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {set.description}
                          </p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          Instruction Set Code:{" "}
                          {(set as any).instructionSetCode || "Not set"}
                        </p>
                      </div>
                      {selectedInstructionSet === set.id && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingSet(set);
                            setNewSet({
                              name: set.name,
                              slug: set.slug,
                              instructionSetCode:
                                (set as any).instructionSetCode || "",
                              description: set.description || "",
                              completionMessage:
                                (set as any).completionMessage || "",
                              submissionTitle:
                                (set as any).submissionTitle || "",
                            });
                            setIsEditSetDialogOpen(true);
                          }}
                          className="ml-2"
                        >
                          <Edit className="mr-1" size={14} />
                          Edit
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <Presentation className="h-8 w-8 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">
                No instruction sets created yet.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Set Dialog */}
      <Dialog
        open={isCreateSetDialogOpen}
        onOpenChange={setIsCreateSetDialogOpen}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Instruction Set</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Create a new set of instructions that can be accessed via URL
              parameter.
            </p>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="set-name">Set Name</Label>
              <Input
                id="set-name"
                value={newSet.name}
                onChange={(e) =>
                  setNewSet((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="e.g., Physics Assignment Instructions"
                data-testid="input-set-name"
              />
            </div>
            <div>
              <Label htmlFor="set-instruction-set-code">
                Instruction Set Code
              </Label>
              <Input
                id="set-instruction-set-code"
                value={newSet.instructionSetCode}
                onChange={(e) =>
                  setNewSet((prev) => ({
                    ...prev,
                    instructionSetCode: e.target.value,
                  }))
                }
                placeholder="e.g., 3CO02_25_PQA1"
                data-testid="input-instruction-set-code"
              />
              <p className="text-xs text-gray-500 mt-1">
                This code will be used for LTI integration and assessment
                mapping
              </p>
            </div>
            <div>
              <Label htmlFor="set-description">Description (Optional)</Label>
              <Textarea
                id="set-description"
                value={newSet.description}
                onChange={(e) =>
                  setNewSet((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                placeholder="Describe this instruction set..."
                rows={3}
                data-testid="input-set-description"
              />
            </div>
            <div>
              <Label htmlFor="set-submission-title">
                Submission Completion Title (Optional)
              </Label>
              <Input
                id="set-submission-title"
                value={newSet.submissionTitle}
                onChange={(e) =>
                  setNewSet((prev) => ({
                    ...prev,
                    submissionTitle: e.target.value,
                  }))
                }
                placeholder="e.g., Your assignment has been submitted successfully!"
                data-testid="input-submission-title"
              />
              <p className="text-xs text-gray-500 mt-1">
                Custom title displayed on the completion screen. Leave empty for
                default: "Your assignment has been submitted"
              </p>
            </div>
            <div>
              <Label htmlFor="set-completion-message">
                File Submission Completion Message (Optional)
              </Label>
              <Textarea
                id="set-completion-message"
                value={newSet.completionMessage}
                onChange={(e) =>
                  setNewSet((prev) => ({
                    ...prev,
                    completionMessage: e.target.value,
                  }))
                }
                placeholder="Enter custom HTML completion message to show after file submission..."
                rows={4}
                data-testid="input-completion-message"
              />
              <p className="text-xs text-gray-500 mt-1">
                HTML message displayed to students after successful file
                submission. Leave empty for default message.
              </p>
            </div>
            <div className="flex gap-2 pt-4">
              <Button
                onClick={handleCreateNewInstructionSet}
                disabled={
                  !newSet.name ||
                  !newSet.instructionSetCode ||
                  createSetMutation.isPending
                }
                data-testid="button-create-set"
              >
                {createSetMutation.isPending ? (
                  <Loader className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {createSetMutation.isPending ? "Creating..." : "Create"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setIsCreateSetDialogOpen(false);
                  setNewSet({
                    name: "",
                    slug: "",
                    instructionSetCode: "",
                    description: "",
                    completionMessage: "",
                    submissionTitle: "",
                  });
                }}
                data-testid="button-cancel-create"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Set Dialog */}
      <Dialog
        open={isEditSetDialogOpen && editingSet !== null}
        onOpenChange={setIsEditSetDialogOpen}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Instruction Set</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Modify the instruction set details.
            </p>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-set-name">Set Name</Label>
              <Input
                id="edit-set-name"
                value={newSet.name}
                onChange={(e) =>
                  setNewSet((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="e.g., Physics Assignment Instructions"
                data-testid="input-edit-set-name"
              />
            </div>
            <div>
              <Label htmlFor="edit-set-instruction-set-code">
                Instruction Set Code (Read-only)
              </Label>
              <Input
                id="edit-set-instruction-set-code"
                value={newSet.instructionSetCode}
                disabled
                className="bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                data-testid="input-edit-instruction-set-code"
              />
              <p className="text-xs text-gray-500 mt-1">
                Assessment codes cannot be modified after creation to maintain
                LTI integration integrity
              </p>
            </div>
            <div>
              <Label htmlFor="edit-set-description">
                Description (Optional)
              </Label>
              <Textarea
                id="edit-set-description"
                value={newSet.description}
                onChange={(e) =>
                  setNewSet((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                placeholder="Describe this instruction set..."
                rows={3}
                data-testid="input-edit-set-description"
              />
            </div>
            <div>
              <Label htmlFor="edit-set-submission-title">
                Submission Completion Title (Optional)
              </Label>
              <Input
                id="edit-set-submission-title"
                value={newSet.submissionTitle}
                onChange={(e) =>
                  setNewSet((prev) => ({
                    ...prev,
                    submissionTitle: e.target.value,
                  }))
                }
                placeholder="e.g., Your assignment has been submitted successfully!"
                data-testid="input-edit-submission-title"
              />
              <p className="text-xs text-gray-500 mt-1">
                Custom title displayed on the completion screen. Leave empty for
                default: "Your assignment has been submitted"
              </p>
            </div>
            <div>
              <Label htmlFor="edit-set-completion-message">
                File Submission Completion Message (Optional)
              </Label>
              <Textarea
                id="edit-set-completion-message"
                value={newSet.completionMessage}
                onChange={(e) =>
                  setNewSet((prev) => ({
                    ...prev,
                    completionMessage: e.target.value,
                  }))
                }
                placeholder="Enter custom HTML completion message to show after file submission..."
                rows={4}
                data-testid="input-edit-completion-message"
              />
              <p className="text-xs text-gray-500 mt-1">
                HTML message displayed to students after successful file
                submission. Leave empty for default message.
              </p>
            </div>
            <div className="flex gap-2 pt-4">
              <Button
                onClick={() =>
                  editingSet &&
                  updateSetMutation.mutate({
                    id: editingSet.id,
                    data: newSet,
                  })
                }
                disabled={!newSet.name || updateSetMutation.isPending}
                data-testid="button-update-set"
              >
                {updateSetMutation.isPending ? (
                  <Loader className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Update Set
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (editingSet) {
                    setShowDeleteSetDialog(true);
                  }
                }}
                disabled={deleteSetMutation.isPending}
                data-testid="button-delete-set"
              >
                {deleteSetMutation.isPending ? (
                  <Loader className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                Delete Set
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setIsEditSetDialogOpen(false);
                  setEditingSet(null);
                  setNewSet({
                    name: "",
                    slug: "",
                    instructionSetCode: "",
                    description: "",
                    completionMessage: "",
                    submissionTitle: "",
                  });
                }}
                data-testid="button-cancel-edit"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Empty State */}
      {sets.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <Presentation className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No instruction sets created yet.</p>
              <p className="text-sm text-gray-400 mb-4">
                Create your first instruction set to get started.
              </p>
              <Button
                onClick={() => setIsCreateSetDialogOpen(true)}
                className="inline-flex items-center"
              >
                <Plus className="mr-2" size={16} />
                Create First Instruction Set
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Instruction Steps for Selected Set */}
      {selectedInstructionSet && sets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <FileText className="mr-2" size={20} />
              Instruction Steps
              <span className="ml-2 text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded">
                {sets.find((s) => s.id === selectedInstructionSet)?.name ||
                  "Selected Set"}
              </span>
            </CardTitle>
            <CardDescription>
              Configure the multi-step flow that students will see for this
              instruction set.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {!Array.isArray(currentInstructionSteps) ||
              currentInstructionSteps.length === 0 ? (
                <div className="text-center py-8">
                  <Presentation className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">
                    No instruction steps configured yet for this set.
                  </p>
                  <p className="text-sm text-gray-400">
                    Add steps to create a guided experience for students.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {currentInstructionSteps.map((step, index) => (
                    <Card key={step.id} className="border">
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2 py-1 rounded">
                                Step {step.stepNumber}
                              </span>
                              <span className="bg-gray-100 text-gray-800 text-xs font-medium px-2 py-1 rounded">
                                {step.stepType}
                              </span>
                            </div>
                            <h4 className="font-semibold text-gray-900">
                              {step.title}
                            </h4>
                            <div
                              className="text-sm text-gray-600 mt-2"
                              dangerouslySetInnerHTML={createSafePreview(
                                step.content,
                                200,
                              )}
                            />
                            {step.stepType === "checkbox" &&
                              step.checkboxItems && (
                                <div className="mt-2">
                                  <p className="text-sm text-gray-500">
                                    {step.checkboxItems.length} confirmation
                                    item(s)
                                  </p>
                                </div>
                              )}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditingStepId(step.id!);
                                setNewStepData({
                                  stepNumber: step.stepNumber,
                                  title: step.title,
                                  content: step.content,
                                  stepType: step.stepType,
                                  checkboxItems: step.checkboxItems || [],
                                  isActive: step.isActive,
                                  instructionSetId:
                                    selectedInstructionSet || "",
                                });
                                setShowStepModal(true);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setStepToDelete(step);
                                setShowDeleteStepDialog(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              <div className="flex justify-center pt-4">
                <Button
                  className="inline-flex items-center"
                  onClick={() => {
                    setEditingStepId(null);
                    setNewStepData({
                      stepNumber: "",
                      title: "",
                      content: "",
                      stepType: "info",
                      checkboxItems: [],
                      isActive: "true",
                      instructionSetId: selectedInstructionSet || "",
                    });
                    setShowStepModal(true);
                  }}
                >
                  <Plus className="mr-2" size={16} />
                  Add Instruction Step
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Instruction Step Modal */}
      <Dialog open={showStepModal} onOpenChange={setShowStepModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingStepId
                ? "Edit Instruction Step"
                : "Add New Instruction Step"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="stepNumber">Step Number</Label>
              <Input
                id="stepNumber"
                value={newStepData.stepNumber}
                onChange={(e) =>
                  setNewStepData((prev) => ({
                    ...prev,
                    stepNumber: e.target.value,
                  }))
                }
                placeholder="1, 2, 3..."
              />
            </div>

            <div>
              <Label htmlFor="stepTitle">Title</Label>
              <Input
                id="stepTitle"
                value={newStepData.title}
                onChange={(e) =>
                  setNewStepData((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="Enter step title"
              />
            </div>

            <div>
              <Label htmlFor="stepType">Step Type</Label>
              <Select
                value={newStepData.stepType}
                onValueChange={(value) =>
                  setNewStepData((prev) => ({
                    ...prev,
                    stepType: value as "info" | "checkbox" | "upload",
                  }))
                }
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">Information</SelectItem>
                  <SelectItem value="checkbox">Checkbox</SelectItem>
                  <SelectItem value="upload">Upload</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="stepContent">Content</Label>
              <WysiwygEditor
                value={newStepData.content}
                onChange={(content) =>
                  setNewStepData((prev) => ({ ...prev, content }))
                }
                placeholder="Enter content for this step..."
                minHeight="200px"
              />
            </div>

            {newStepData.stepType === "checkbox" && (
              <div>
                <Label>Checkbox Items</Label>
                <div className="space-y-2">
                  {newStepData.checkboxItems.map((item, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        value={item}
                        onChange={(e) => {
                          const updated = [...newStepData.checkboxItems];
                          updated[index] = e.target.value;
                          setNewStepData((prev) => ({
                            ...prev,
                            checkboxItems: updated,
                          }));
                        }}
                        placeholder="Enter checkbox item text"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const updated = newStepData.checkboxItems.filter(
                            (_, i) => i !== index,
                          );
                          setNewStepData((prev) => ({
                            ...prev,
                            checkboxItems: updated,
                          }));
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setNewStepData((prev) => ({
                        ...prev,
                        checkboxItems: [...prev.checkboxItems, ""],
                      }));
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Checkbox Item
                  </Button>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <Button
                onClick={() => saveStepMutation.mutate(newStepData)}
                disabled={
                  !newStepData.title ||
                  !newStepData.stepNumber ||
                  saveStepMutation.isPending
                }
              >
                {saveStepMutation.isPending ? (
                  <Loader className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {editingStepId ? "Update Step" : "Save Step"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowStepModal(false);
                  setEditingStepId(null);
                  setNewStepData({
                    stepNumber: "",
                    title: "",
                    content: "",
                    stepType: "info" as const,
                    checkboxItems: [],
                    isActive: "true",
                    instructionSetId: selectedInstructionSet || "",
                  });
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Set Confirmation Dialog */}
      <AlertDialog
        open={showDeleteSetDialog}
        onOpenChange={setShowDeleteSetDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Instruction Set</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this instruction set? All
              associated steps will also be deleted. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-set">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (editingSet) {
                  await deleteSetMutation.mutateAsync(editingSet.id);
                  setIsEditSetDialogOpen(false);
                  setEditingSet(null);
                  setShowDeleteSetDialog(false);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-set"
            >
              Delete Set
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Step Confirmation Dialog */}
      <AlertDialog
        open={showDeleteStepDialog}
        onOpenChange={setShowDeleteStepDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Instruction Step</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this instruction step? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-step">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (stepToDelete) {
                  try {
                    const currentSetSteps = Array.isArray(
                      currentInstructionSteps,
                    )
                      ? currentInstructionSteps
                      : [];
                    const updatedStepsForSet = currentSetSteps.filter(
                      (s) => s.id !== stepToDelete.id,
                    );

                    await saveInstructionStepsMutation.mutateAsync(
                      updatedStepsForSet,
                    );

                    toast({
                      title: "Success",
                      description: "Instruction step deleted successfully.",
                    });

                    setShowDeleteStepDialog(false);
                    setStepToDelete(null);
                  } catch (error) {
                    console.error("Error deleting step:", error);
                    toast({
                      title: "Error",
                      description: "Failed to delete instruction step.",
                      variant: "destructive",
                    });
                    setShowDeleteStepDialog(false);
                    setStepToDelete(null);
                  }
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-step"
            >
              Delete Step
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
