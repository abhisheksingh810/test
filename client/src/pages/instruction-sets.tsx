import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
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
  DialogTrigger,
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
import { Badge } from "@/components/ui/badge";
import type { InstructionSet } from "@shared/schema";
import { Plus, Edit, Trash2, Copy, ExternalLink, Settings } from "lucide-react";

export default function InstructionSetsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingSet, setEditingSet] = useState<InstructionSet | null>(null);
  const [newSet, setNewSet] = useState({
    name: "",
    slug: "",
    instructionSetCode: "",
    description: "",
  });

  // Get all instruction sets
  const { data: instructionSets, isLoading } = useQuery({
    queryKey: ["/api/instruction-sets"],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const sets: InstructionSet[] = (instructionSets as InstructionSet[]) || [];

  // Create instruction set mutation
  const createMutation = useMutation({
    mutationFn: async (setData: typeof newSet) => {
      return await apiRequest(`/api/instruction-sets`, "POST", {
        ...setData,
        isActive: "true",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/instruction-sets"] });
      setIsCreateDialogOpen(false);
      setNewSet({
        name: "",
        slug: "",
        instructionSetCode: "",
        description: "",
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
  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<InstructionSet>;
    }) => {
      return await apiRequest(`/api/instruction-sets/${id}`, "PUT", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/instruction-sets"] });
      setIsEditDialogOpen(false);
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
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/instruction-sets/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/instruction-sets"] });
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

  const handleCreate = () => {
    if (!newSet.name.trim() || !newSet.slug.trim()) {
      toast({
        title: "Validation Error",
        description: "Name and slug are required.",
        variant: "destructive",
      });
      return;
    }

    // Generate slug from name if not provided
    const slug =
      newSet.slug ||
      newSet.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

    createMutation.mutate({
      ...newSet,
      slug,
    });
  };

  const handleEdit = (set: InstructionSet) => {
    setEditingSet(set);
    setIsEditDialogOpen(true);
  };

  const handleUpdate = () => {
    if (!editingSet) return;

    updateMutation.mutate({
      id: editingSet.id,
      data: editingSet,
    });
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  const copyLtiUrl = (slug: string) => {
    const baseUrl = window.location.origin;
    const url = `${baseUrl}/lti/assignment/[LAUNCH_ID]?set=${slug}`;
    navigator.clipboard.writeText(url);
    toast({
      title: "URL Copied",
      description:
        "LTI URL template copied to clipboard. Replace [LAUNCH_ID] with actual launch ID.",
    });
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading instruction sets...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Instruction Sets</h1>
          <p className="text-gray-600 mt-2">
            Manage different sets of instructional content for various courses
            and assignments.
          </p>
        </div>

        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Instruction Set
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Create New Instruction Set</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={newSet.name}
                  onChange={(e) =>
                    setNewSet({ ...newSet, name: e.target.value })
                  }
                  placeholder="e.g., Physics Lab Reports"
                />
              </div>
              <div>
                <Label htmlFor="slug">Slug</Label>
                <Input
                  id="slug"
                  value={newSet.slug}
                  onChange={(e) =>
                    setNewSet({ ...newSet, slug: e.target.value })
                  }
                  placeholder="e.g., physics-lab (used in URLs)"
                />
                <p className="text-sm text-gray-500 mt-1">
                  Used in URLs. Leave empty to auto-generate from name.
                </p>
              </div>
              <div>
                <Label htmlFor="instructionSetCode">Instruction Set Code</Label>
                <Input
                  id="instructionSetCode"
                  value={newSet.instructionSetCode}
                  onChange={(e) =>
                    setNewSet({ ...newSet, instructionSetCode: e.target.value })
                  }
                  placeholder="e.g., 3CO02_25_PQA1 (for LTI integration)"
                />
                <p className="text-sm text-gray-500 mt-1">
                  Used by LMS systems to identify this instruction set. Must be
                  unique.
                </p>
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={newSet.description}
                  onChange={(e) =>
                    setNewSet({ ...newSet, description: e.target.value })
                  }
                  placeholder="Brief description of this instruction set..."
                />
              </div>
              <div className="flex justify-end space-x-2">
                <Button
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? "Creating..." : "Create"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {sets.map((set) => (
          <Card key={set.id} className="relative">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg">{set.name}</CardTitle>
                  <div className="mt-1 space-y-1">
                    {(set as any).instructionSetCode ? (
                      <Badge variant="secondary">
                        {(set as any).instructionSetCode}
                      </Badge>
                    ) : (
                      <Badge variant="outline">{set.slug}</Badge>
                    )}
                  </div>
                </div>
                <div className="flex space-x-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyLtiUrl(set.slug)}
                    title="Copy LTI URL"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(set)}
                    title="Edit"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" title="Delete">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Delete Instruction Set
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          This will delete "{set.name}" and all its associated
                          instruction steps. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(set.id)}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {set.description && (
                <p className="text-gray-600 mb-4">{set.description}</p>
              )}
              <div className="flex items-center justify-between text-sm text-gray-500">
                <span>
                  Created:{" "}
                  {set.createdAt
                    ? new Date(set.createdAt).toLocaleDateString()
                    : "N/A"}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    window.open(
                      `/system-settings?tab=instructions&set=${set.id}`,
                      "_blank",
                    )
                  }
                >
                  <Settings className="h-4 w-4 mr-1" />
                  Manage Steps
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {sets.length === 0 && (
          <Card className="md:col-span-2 lg:col-span-3">
            <CardContent className="text-center py-12">
              <div className="text-gray-400 mb-4">
                <Settings className="h-12 w-12 mx-auto" />
              </div>
              <h3 className="text-lg font-semibold mb-2">
                No instruction sets yet
              </h3>
              <p className="text-gray-600 mb-4">
                Create your first instruction set to organize different sets of
                instructional content.
              </p>
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create First Instruction Set
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Edit Instruction Set</DialogTitle>
          </DialogHeader>
          {editingSet && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-name">Name</Label>
                <Input
                  id="edit-name"
                  value={editingSet.name}
                  onChange={(e) =>
                    setEditingSet({ ...editingSet, name: e.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor="edit-slug">Slug</Label>
                <Input
                  id="edit-slug"
                  value={editingSet.slug}
                  onChange={(e) =>
                    setEditingSet({ ...editingSet, slug: e.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor="edit-instruction-set-code">
                  Instruction Set Code
                </Label>
                <Input
                  id="edit-assessment-code"
                  value={(editingSet as any).instructionSetCode || ""}
                  onChange={(e) =>
                    setEditingSet({
                      ...editingSet,
                      instructionSetCode: e.target.value,
                    } as any)
                  }
                  placeholder="e.g., 3CO02_25_PQA1"
                />
              </div>
              <div>
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  value={editingSet.description || ""}
                  onChange={(e) =>
                    setEditingSet({
                      ...editingSet,
                      description: e.target.value,
                    })
                  }
                />
              </div>
              <div className="flex justify-end space-x-2">
                <Button
                  variant="outline"
                  onClick={() => setIsEditDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleUpdate}
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
