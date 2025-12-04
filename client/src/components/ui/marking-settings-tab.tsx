import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { SkipReason, InsertSkipReason, MalpracticeLevel, InsertMalpracticeLevel } from "@shared/schema";
import { Plus, Edit, Trash2, Save, X, AlertTriangle, CheckCircle, GripVertical } from "lucide-react";

export function MarkingSettingsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Skip Reason States
  const [isCreateSkipReasonDialogOpen, setIsCreateSkipReasonDialogOpen] = useState(false);
  const [editingSkipReason, setEditingSkipReason] = useState<SkipReason | null>(null);
  const [isEditSkipReasonDialogOpen, setIsEditSkipReasonDialogOpen] = useState(false);
  const [newSkipReason, setNewSkipReason] = useState<InsertSkipReason>({
    reasonText: '',
    isActive: 'true'
  });
  const [draggedSkipReasonId, setDraggedSkipReasonId] = useState<string | null>(null);
  const [dragOverSkipReasonId, setDragOverSkipReasonId] = useState<string | null>(null);

  // Malpractice Level States
  const [isCreateMalpracticeLevelDialogOpen, setIsCreateMalpracticeLevelDialogOpen] = useState(false);
  const [editingMalpracticeLevel, setEditingMalpracticeLevel] = useState<MalpracticeLevel | null>(null);
  const [isEditMalpracticeLevelDialogOpen, setIsEditMalpracticeLevelDialogOpen] = useState(false);
  const [newMalpracticeLevel, setNewMalpracticeLevel] = useState<InsertMalpracticeLevel>({
    levelText: '',
    description: '',
    isActive: 'true'
  });
  const [draggedMalpracticeLevelId, setDraggedMalpracticeLevelId] = useState<string | null>(null);
  const [dragOverMalpracticeLevelId, setDragOverMalpracticeLevelId] = useState<string | null>(null);

  // Queries
  const { data: skipReasons, isLoading: isLoadingSkipReasons } = useQuery<SkipReason[]>({
    queryKey: ['/api/skip-reasons'],
    staleTime: 5 * 60 * 1000
  });

  const { data: malpracticeLevels, isLoading: isLoadingMalpracticeLevels } = useQuery<MalpracticeLevel[]>({
    queryKey: ['/api/malpractice-levels'],
    staleTime: 5 * 60 * 1000
  });

  // Skip Reason Mutations
  const createSkipReasonMutation = useMutation({
    mutationFn: async (data: InsertSkipReason) => {
      const response = await apiRequest('POST', '/api/skip-reasons', data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create skip reason');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Skip Reason Created",
        description: "Skip reason created successfully",
      });
      setIsCreateSkipReasonDialogOpen(false);
      setNewSkipReason({ reasonText: '', isActive: 'true' });
      queryClient.invalidateQueries({ queryKey: ['/api/skip-reasons'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Creation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateSkipReasonMutation = useMutation({
    mutationFn: async ({ id, ...data }: Partial<InsertSkipReason> & { id: string }) => {
      const response = await apiRequest('PUT', `/api/skip-reasons/${id}`, data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update skip reason');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Skip Reason Updated",
        description: "Skip reason updated successfully",
      });
      setIsEditSkipReasonDialogOpen(false);
      setEditingSkipReason(null);
      queryClient.invalidateQueries({ queryKey: ['/api/skip-reasons'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteSkipReasonMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('DELETE', `/api/skip-reasons/${id}`, {});
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete skip reason');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Skip Reason Deleted",
        description: "Skip reason deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/skip-reasons'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Deletion Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Malpractice Level Mutations
  const createMalpracticeLevelMutation = useMutation({
    mutationFn: async (data: InsertMalpracticeLevel) => {
      const response = await apiRequest('POST', '/api/malpractice-levels', data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create malpractice level');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Malpractice Level Created",
        description: "Malpractice level created successfully",
      });
      setIsCreateMalpracticeLevelDialogOpen(false);
      setNewMalpracticeLevel({ levelText: '', description: '', isActive: 'true' });
      queryClient.invalidateQueries({ queryKey: ['/api/malpractice-levels'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Creation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMalpracticeLevelMutation = useMutation({
    mutationFn: async ({ id, ...data }: Partial<InsertMalpracticeLevel> & { id: string }) => {
      const response = await apiRequest('PUT', `/api/malpractice-levels/${id}`, data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update malpractice level');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Malpractice Level Updated",
        description: "Malpractice level updated successfully",
      });
      setIsEditMalpracticeLevelDialogOpen(false);
      setEditingMalpracticeLevel(null);
      queryClient.invalidateQueries({ queryKey: ['/api/malpractice-levels'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMalpracticeLevelMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('DELETE', `/api/malpractice-levels/${id}`, {});
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete malpractice level');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Malpractice Level Deleted",
        description: "Malpractice level deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/malpractice-levels'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Deletion Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const reorderSkipReasonsMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const response = await apiRequest('POST', '/api/skip-reasons/reorder', { orderedIds });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to reorder skip reasons');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/skip-reasons'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Reordering Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const reorderMalpracticeLevelsMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const response = await apiRequest('POST', '/api/malpractice-levels/reorder', { orderedIds });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to reorder malpractice levels');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/malpractice-levels'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Reordering Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handler functions
  const handleCreateSkipReason = () => {
    createSkipReasonMutation.mutate(newSkipReason);
  };

  const handleUpdateSkipReason = () => {
    if (editingSkipReason) {
      updateSkipReasonMutation.mutate({
        id: editingSkipReason.id,
        reasonText: editingSkipReason.reasonText,
        isActive: editingSkipReason.isActive
      });
    }
  };

  const handleEditSkipReason = (skipReason: SkipReason) => {
    setEditingSkipReason(skipReason);
    setIsEditSkipReasonDialogOpen(true);
  };

  const handleDeleteSkipReason = (id: string) => {
    if (confirm('Are you sure you want to delete this skip reason?')) {
      deleteSkipReasonMutation.mutate(id);
    }
  };

  const handleCreateMalpracticeLevel = () => {
    createMalpracticeLevelMutation.mutate(newMalpracticeLevel);
  };

  const handleUpdateMalpracticeLevel = () => {
    if (editingMalpracticeLevel) {
      updateMalpracticeLevelMutation.mutate({
        id: editingMalpracticeLevel.id,
        levelText: editingMalpracticeLevel.levelText,
        description: editingMalpracticeLevel.description || undefined,
        isActive: editingMalpracticeLevel.isActive
      });
    }
  };

  const handleEditMalpracticeLevel = (level: MalpracticeLevel) => {
    setEditingMalpracticeLevel(level);
    setIsEditMalpracticeLevelDialogOpen(true);
  };

  const handleDeleteMalpracticeLevel = (id: string) => {
    if (confirm('Are you sure you want to delete this malpractice level?')) {
      deleteMalpracticeLevelMutation.mutate(id);
    }
  };

  // Skip Reason Drag Handlers
  const handleSkipReasonDragStart = (e: React.DragEvent, id: string) => {
    setDraggedSkipReasonId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleSkipReasonDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverSkipReasonId(id);
  };

  const handleSkipReasonDragLeave = () => {
    setDragOverSkipReasonId(null);
  };

  const handleSkipReasonDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedSkipReasonId || draggedSkipReasonId === targetId || !skipReasons) return;

    const draggedIndex = skipReasons.findIndex(r => r.id === draggedSkipReasonId);
    const targetIndex = skipReasons.findIndex(r => r.id === targetId);

    const reordered = [...skipReasons];
    const [removed] = reordered.splice(draggedIndex, 1);
    reordered.splice(targetIndex, 0, removed);

    const orderedIds = reordered.map(r => r.id);
    reorderSkipReasonsMutation.mutate(orderedIds);

    setDraggedSkipReasonId(null);
    setDragOverSkipReasonId(null);
  };

  // Malpractice Level Drag Handlers
  const handleMalpracticeLevelDragStart = (e: React.DragEvent, id: string) => {
    setDraggedMalpracticeLevelId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleMalpracticeLevelDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverMalpracticeLevelId(id);
  };

  const handleMalpracticeLevelDragLeave = () => {
    setDragOverMalpracticeLevelId(null);
  };

  const handleMalpracticeLevelDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedMalpracticeLevelId || draggedMalpracticeLevelId === targetId || !malpracticeLevels) return;

    const draggedIndex = malpracticeLevels.findIndex(l => l.id === draggedMalpracticeLevelId);
    const targetIndex = malpracticeLevels.findIndex(l => l.id === targetId);

    const reordered = [...malpracticeLevels];
    const [removed] = reordered.splice(draggedIndex, 1);
    reordered.splice(targetIndex, 0, removed);

    const orderedIds = reordered.map(l => l.id);
    reorderMalpracticeLevelsMutation.mutate(orderedIds);

    setDraggedMalpracticeLevelId(null);
    setDragOverMalpracticeLevelId(null);
  };

  return (
    <div className="space-y-6">
      {/* Skip Reasons Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center">
                <CheckCircle className="mr-2" size={20} />
                Skip Reasons
              </CardTitle>
              <CardDescription>
                Manage reasons for skipping marking an assessment
              </CardDescription>
            </div>
            <Dialog open={isCreateSkipReasonDialogOpen} onOpenChange={setIsCreateSkipReasonDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" data-testid="button-create-skip-reason">
                  <Plus className="mr-2" size={16} />
                  Add Skip Reason
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Skip Reason</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="skip-reason-text">Reason Text</Label>
                    <Textarea
                      id="skip-reason-text"
                      data-testid="input-skip-reason-text"
                      value={newSkipReason.reasonText}
                      onChange={(e) => setNewSkipReason({ ...newSkipReason, reasonText: e.target.value })}
                      placeholder="Enter the reason for skipping marking"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="skip-reason-status">Status</Label>
                    <Select
                      value={newSkipReason.isActive}
                      onValueChange={(value) => setNewSkipReason({ ...newSkipReason, isActive: value })}
                    >
                      <SelectTrigger id="skip-reason-status" data-testid="select-skip-reason-status">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Active</SelectItem>
                        <SelectItem value="false">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-end space-x-2">
                    <Button
                      variant="outline"
                      onClick={() => setIsCreateSkipReasonDialogOpen(false)}
                      data-testid="button-cancel-skip-reason"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleCreateSkipReason}
                      disabled={createSkipReasonMutation.isPending || !newSkipReason.reasonText}
                      data-testid="button-save-skip-reason"
                    >
                      {createSkipReasonMutation.isPending ? 'Creating...' : 'Create'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingSkipReasons ? (
            <div className="text-center py-8" data-testid="loading-skip-reasons">Loading skip reasons...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {skipReasons && skipReasons.length > 0 ? (
                  skipReasons.map((skipReason) => (
                    <TableRow
                      key={skipReason.id}
                      data-testid={`row-skip-reason-${skipReason.id}`}
                      draggable
                      onDragStart={(e) => handleSkipReasonDragStart(e, skipReason.id)}
                      onDragOver={(e) => handleSkipReasonDragOver(e, skipReason.id)}
                      onDragLeave={handleSkipReasonDragLeave}
                      onDrop={(e) => handleSkipReasonDrop(e, skipReason.id)}
                      className={`${
                        draggedSkipReasonId === skipReason.id ? 'opacity-50' : ''
                      } ${
                        dragOverSkipReasonId === skipReason.id ? 'border-t-2 border-blue-500' : ''
                      } cursor-move`}
                    >
                      <TableCell>
                        <GripVertical className="h-4 w-4 text-gray-400" data-testid={`drag-handle-skip-reason-${skipReason.id}`} />
                      </TableCell>
                      <TableCell data-testid={`text-skip-reason-${skipReason.id}`}>{skipReason.reasonText}</TableCell>
                      <TableCell>
                        <Badge variant={skipReason.isActive === 'true' ? 'default' : 'secondary'} data-testid={`badge-skip-reason-status-${skipReason.id}`}>
                          {skipReason.isActive === 'true' ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditSkipReason(skipReason)}
                            data-testid={`button-edit-skip-reason-${skipReason.id}`}
                          >
                            <Edit size={16} />
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteSkipReason(skipReason.id)}
                            data-testid={`button-delete-skip-reason-${skipReason.id}`}
                          >
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-gray-500">
                      No skip reasons found. Create one to get started.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Skip Reason Dialog */}
      <Dialog open={isEditSkipReasonDialogOpen} onOpenChange={setIsEditSkipReasonDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Skip Reason</DialogTitle>
          </DialogHeader>
          {editingSkipReason && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-skip-reason-text">Reason Text</Label>
                <Textarea
                  id="edit-skip-reason-text"
                  data-testid="input-edit-skip-reason-text"
                  value={editingSkipReason.reasonText}
                  onChange={(e) => setEditingSkipReason({ ...editingSkipReason, reasonText: e.target.value })}
                  placeholder="Enter the reason for skipping marking"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-skip-reason-status">Status</Label>
                <Select
                  value={editingSkipReason.isActive}
                  onValueChange={(value) => setEditingSkipReason({ ...editingSkipReason, isActive: value })}
                >
                  <SelectTrigger id="edit-skip-reason-status" data-testid="select-edit-skip-reason-status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Active</SelectItem>
                    <SelectItem value="false">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end space-x-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsEditSkipReasonDialogOpen(false);
                    setEditingSkipReason(null);
                  }}
                  data-testid="button-cancel-edit-skip-reason"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleUpdateSkipReason}
                  disabled={updateSkipReasonMutation.isPending || !editingSkipReason.reasonText}
                  data-testid="button-update-skip-reason"
                >
                  {updateSkipReasonMutation.isPending ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Malpractice Levels Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center">
                <AlertTriangle className="mr-2" size={20} />
                Malpractice Levels
              </CardTitle>
              <CardDescription>
                Manage malpractice detection levels
              </CardDescription>
            </div>
            <Dialog open={isCreateMalpracticeLevelDialogOpen} onOpenChange={setIsCreateMalpracticeLevelDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" data-testid="button-create-malpractice-level">
                  <Plus className="mr-2" size={16} />
                  Add Malpractice Level
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Malpractice Level</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="malpractice-level-text">Level Text</Label>
                    <Input
                      id="malpractice-level-text"
                      data-testid="input-malpractice-level-text"
                      value={newMalpracticeLevel.levelText}
                      onChange={(e) => setNewMalpracticeLevel({ ...newMalpracticeLevel, levelText: e.target.value })}
                      placeholder="e.g., Minor Infraction, Major Violation"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="malpractice-description">Description (Optional)</Label>
                    <Textarea
                      id="malpractice-description"
                      data-testid="input-malpractice-description"
                      value={newMalpracticeLevel.description || ''}
                      onChange={(e) => setNewMalpracticeLevel({ ...newMalpracticeLevel, description: e.target.value })}
                      placeholder="Enter additional details about this level"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="malpractice-level-status">Status</Label>
                    <Select
                      value={newMalpracticeLevel.isActive}
                      onValueChange={(value) => setNewMalpracticeLevel({ ...newMalpracticeLevel, isActive: value })}
                    >
                      <SelectTrigger id="malpractice-level-status" data-testid="select-malpractice-level-status">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Active</SelectItem>
                        <SelectItem value="false">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-end space-x-2">
                    <Button
                      variant="outline"
                      onClick={() => setIsCreateMalpracticeLevelDialogOpen(false)}
                      data-testid="button-cancel-malpractice-level"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleCreateMalpracticeLevel}
                      disabled={createMalpracticeLevelMutation.isPending || !newMalpracticeLevel.levelText}
                      data-testid="button-save-malpractice-level"
                    >
                      {createMalpracticeLevelMutation.isPending ? 'Creating...' : 'Create'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingMalpracticeLevels ? (
            <div className="text-center py-8" data-testid="loading-malpractice-levels">Loading malpractice levels...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Level Text</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {malpracticeLevels && malpracticeLevels.length > 0 ? (
                  malpracticeLevels.map((level) => (
                    <TableRow
                      key={level.id}
                      data-testid={`row-malpractice-level-${level.id}`}
                      draggable
                      onDragStart={(e) => handleMalpracticeLevelDragStart(e, level.id)}
                      onDragOver={(e) => handleMalpracticeLevelDragOver(e, level.id)}
                      onDragLeave={handleMalpracticeLevelDragLeave}
                      onDrop={(e) => handleMalpracticeLevelDrop(e, level.id)}
                      className={`${
                        draggedMalpracticeLevelId === level.id ? 'opacity-50' : ''
                      } ${
                        dragOverMalpracticeLevelId === level.id ? 'border-t-2 border-blue-500' : ''
                      } cursor-move`}
                    >
                      <TableCell>
                        <GripVertical className="h-4 w-4 text-gray-400" data-testid={`drag-handle-malpractice-level-${level.id}`} />
                      </TableCell>
                      <TableCell data-testid={`text-malpractice-level-${level.id}`}>{level.levelText}</TableCell>
                      <TableCell className="max-w-xs truncate">{level.description || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={level.isActive === 'true' ? 'default' : 'secondary'} data-testid={`badge-malpractice-status-${level.id}`}>
                          {level.isActive === 'true' ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditMalpracticeLevel(level)}
                            data-testid={`button-edit-malpractice-level-${level.id}`}
                          >
                            <Edit size={16} />
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteMalpracticeLevel(level.id)}
                            data-testid={`button-delete-malpractice-level-${level.id}`}
                          >
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                      No malpractice levels found. Create one to get started.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Malpractice Level Dialog */}
      <Dialog open={isEditMalpracticeLevelDialogOpen} onOpenChange={setIsEditMalpracticeLevelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Malpractice Level</DialogTitle>
          </DialogHeader>
          {editingMalpracticeLevel && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-malpractice-level-text">Level Text</Label>
                <Input
                  id="edit-malpractice-level-text"
                  data-testid="input-edit-malpractice-level-text"
                  value={editingMalpracticeLevel.levelText}
                  onChange={(e) => setEditingMalpracticeLevel({ ...editingMalpracticeLevel, levelText: e.target.value })}
                  placeholder="e.g., Minor Infraction, Major Violation"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-malpractice-description">Description (Optional)</Label>
                <Textarea
                  id="edit-malpractice-description"
                  data-testid="input-edit-malpractice-description"
                  value={editingMalpracticeLevel.description || ''}
                  onChange={(e) => setEditingMalpracticeLevel({ ...editingMalpracticeLevel, description: e.target.value })}
                  placeholder="Enter additional details about this level"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-malpractice-level-status">Status</Label>
                <Select
                  value={editingMalpracticeLevel.isActive}
                  onValueChange={(value) => setEditingMalpracticeLevel({ ...editingMalpracticeLevel, isActive: value })}
                >
                  <SelectTrigger id="edit-malpractice-level-status" data-testid="select-edit-malpractice-level-status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Active</SelectItem>
                    <SelectItem value="false">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end space-x-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsEditMalpracticeLevelDialogOpen(false);
                    setEditingMalpracticeLevel(null);
                  }}
                  data-testid="button-cancel-edit-malpractice-level"
                >
                  <X className="mr-2" size={16} />
                  Cancel
                </Button>
                <Button
                  onClick={handleUpdateMalpracticeLevel}
                  disabled={updateMalpracticeLevelMutation.isPending || !editingMalpracticeLevel.levelText}
                  data-testid="button-update-malpractice-level"
                >
                  <Save className="mr-2" size={16} />
                  {updateMalpracticeLevelMutation.isPending ? 'Updating...' : 'Update'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
