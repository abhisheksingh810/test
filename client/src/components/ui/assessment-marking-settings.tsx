import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { ChevronUp, ChevronDown, Trash2, Plus, GripVertical, Copy } from 'lucide-react';
import type { 
  Assessment,
  AssessmentSection, 
  InsertAssessmentSection,
  SectionMarkingOption,
  InsertSectionMarkingOption,
  AssessmentGradeBoundary,
  InsertAssessmentGradeBoundary
} from '@shared/schema';

interface AssessmentMarkingSettingsProps {
  assessment: Assessment;
  onClose: () => void;
}

export default function AssessmentMarkingSettings({ 
  assessment, 
  onClose 
}: AssessmentMarkingSettingsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [localAssessment, setLocalAssessment] = useState(assessment);

  // Fetch assessment sections
  const { data: sections = [], isLoading: sectionsLoading } = useQuery<AssessmentSection[]>({
    queryKey: ['/api/assessments', localAssessment.id, 'sections'],
    queryFn: async () => {
      const response = await fetch(`/api/assessments/${localAssessment.id}/sections`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch sections');
      return response.json();
    },
    enabled: !!localAssessment.id
  });

  // Fetch grade boundaries
  const { data: gradeBoundaries = [], isLoading: boundariesLoading } = useQuery<AssessmentGradeBoundary[]>({
    queryKey: ['/api/assessments', localAssessment.id, 'grade-boundaries'],
    queryFn: async () => {
      const response = await fetch(`/api/assessments/${localAssessment.id}/grade-boundaries`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch grade boundaries');
      return response.json();
    },
    enabled: !!localAssessment.id
  });

  // Section mutations
  const createSectionMutation = useMutation({
    mutationFn: async (data: InsertAssessmentSection) => {
      const response = await fetch(`/api/assessments/${localAssessment.id}/sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Failed to create section');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/assessments', localAssessment.id, 'sections'] });
      toast({ title: "Section created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create section", variant: "destructive" });
    }
  });

  const updateSectionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string, data: Partial<InsertAssessmentSection> }) => {
      const response = await fetch(`/api/assessments/sections/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Failed to update section');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/assessments', localAssessment.id, 'sections'] });
      toast({ title: "Section updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update section", variant: "destructive" });
    }
  });

  const deleteSectionMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/assessments/sections/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to delete section');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/assessments', localAssessment.id, 'sections'] });
      toast({ title: "Section deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete section", variant: "destructive" });
    }
  });

  const cloneSectionMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/assessments/sections/${id}/clone`, {
        method: 'POST',
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to clone section');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/assessments', localAssessment.id, 'sections'] });
      toast({ title: "Section cloned successfully" });
    },
    onError: () => {
      toast({ title: "Failed to clone section", variant: "destructive" });
    }
  });

  // Grade boundary mutations
  const createBoundaryMutation = useMutation({
    mutationFn: async (data: InsertAssessmentGradeBoundary) => {
      const response = await fetch(`/api/assessments/${localAssessment.id}/grade-boundaries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Failed to create grade boundary');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/assessments', localAssessment.id, 'grade-boundaries'] });
      toast({ title: "Grade boundary created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create grade boundary", variant: "destructive" });
    }
  });

  const updateBoundaryMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string, data: Partial<InsertAssessmentGradeBoundary> }) => {
      const response = await fetch(`/api/assessments/grade-boundaries/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Failed to update grade boundary');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/assessments', localAssessment.id, 'grade-boundaries'] });
      toast({ title: "Grade boundary updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update grade boundary", variant: "destructive" });
    }
  });

  const deleteBoundaryMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/assessments/grade-boundaries/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to delete grade boundary');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/assessments', localAssessment.id, 'grade-boundaries'] });
      toast({ title: "Grade boundary deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete grade boundary", variant: "destructive" });
    }
  });

  const recalculateTotalMarksMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/assessments/${localAssessment.id}/recalculate-total-marks`, {
        method: 'PUT',
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to recalculate total marks');
      return response.json();
    },
    onSuccess: async () => {
      // Fetch the updated assessment data to get the new total marks
      const response = await fetch(`/api/assessments`, {
        credentials: 'include'
      });
      if (response.ok) {
        const assessments = await response.json();
        const updatedAssessment = assessments.find((a: Assessment) => a.id === localAssessment.id);
        if (updatedAssessment) {
          // Update the local assessment state to immediately reflect the changes
          setLocalAssessment(updatedAssessment);
        }
      }
      
      // Invalidate all assessment-related queries
      await queryClient.invalidateQueries({ queryKey: ['/api/assessments'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/assessments', localAssessment.id] });
      await queryClient.invalidateQueries({ queryKey: ['/api/assessments', localAssessment.id, 'grade-boundaries'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/assessments', localAssessment.id, 'sections'] });
      
      // Force a complete refetch of assessment data to ensure UI updates immediately
      await queryClient.refetchQueries({ queryKey: ['/api/assessments'] });
      
      toast({ title: "Total marks recalculated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to recalculate total marks", variant: "destructive" });
    }
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg w-full max-w-6xl h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b dark:border-gray-700 flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Marking Settings</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Configure marking sections and grade boundaries for: <strong>{assessment.name}</strong>
            </p>
          </div>
          <Button variant="outline" onClick={onClose} data-testid="button-close-marking-settings">
            Close
          </Button>
        </div>

        <div className="flex-1 overflow-hidden p-6">
          <Tabs defaultValue="sections" className="w-full h-full flex flex-col">
            <TabsList className="grid w-full grid-cols-2 flex-shrink-0">
              <TabsTrigger value="sections" data-testid="tab-sections">Sections & Marking</TabsTrigger>
              <TabsTrigger value="boundaries" data-testid="tab-boundaries">Grade Boundaries</TabsTrigger>
            </TabsList>

            <TabsContent value="sections" className="mt-6 flex-1 overflow-auto">
              <SectionsTab
                assessmentId={assessment.id}
                sections={sections}
                sectionsLoading={sectionsLoading}
                createSectionMutation={createSectionMutation}
                updateSectionMutation={updateSectionMutation}
                deleteSectionMutation={deleteSectionMutation}
                cloneSectionMutation={cloneSectionMutation}
              />
            </TabsContent>

            <TabsContent value="boundaries" className="mt-6 flex-1 overflow-auto">
              <GradeBoundariesTab
                assessment={localAssessment}
                sections={sections}
                gradeBoundaries={gradeBoundaries}
                boundariesLoading={boundariesLoading}
                createBoundaryMutation={createBoundaryMutation}
                updateBoundaryMutation={updateBoundaryMutation}
                deleteBoundaryMutation={deleteBoundaryMutation}
                recalculateTotalMarksMutation={recalculateTotalMarksMutation}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

interface SectionsTabProps {
  assessmentId: string;
  sections: AssessmentSection[];
  sectionsLoading: boolean;
  createSectionMutation: any;
  updateSectionMutation: any;
  deleteSectionMutation: any;
  cloneSectionMutation: any;
}

function SectionsTab({ 
  assessmentId, 
  sections, 
  sectionsLoading,
  createSectionMutation,
  updateSectionMutation,
  deleteSectionMutation,
  cloneSectionMutation
}: SectionsTabProps) {
  const [newSection, setNewSection] = useState({
    name: '',
    questionText: '',
    questions: 1
  });

  const handleCreateSection = () => {
    if (!newSection.name.trim()) return;
    
    const nextOrder = sections.length > 0 ? Math.max(...sections.map(s => s.order)) + 1 : 1;
    
    createSectionMutation.mutate({
      assessmentId,
      name: newSection.name,
      questionText: newSection.questionText,
      questions: newSection.questions,
      order: nextOrder,
      isActive: 'true'
    });
    
    setNewSection({ name: '', questionText: '', questions: 1 });
  };

  if (sectionsLoading) {
    return <div className="text-center py-8">Loading sections...</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Add New Section</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="section-name">Section Name</Label>
              <Input
                id="section-name"
                value={newSection.name}
                onChange={(e) => setNewSection({ ...newSection, name: e.target.value })}
                placeholder="e.g., Written Response"
                data-testid="input-section-name"
              />
            </div>
            <div>
              <Label htmlFor="section-questions">Number of Questions</Label>
              <Input
                id="section-questions"
                type="number"
                min="1"
                value={newSection.questions}
                onChange={(e) => setNewSection({ ...newSection, questions: parseInt(e.target.value) || 1 })}
                data-testid="input-section-questions"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="question-text">Question Text</Label>
            <Textarea
              id="question-text"
              value={newSection.questionText}
              onChange={(e) => setNewSection({ ...newSection, questionText: e.target.value })}
              placeholder="Enter the question or instructions for this section..."
              rows={3}
              data-testid="textarea-question-text"
            />
          </div>
          <Button 
            onClick={handleCreateSection}
            disabled={!newSection.name.trim() || createSectionMutation.isPending}
            data-testid="button-add-section"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Section
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {sections.map((section) => (
          <SectionCard
            key={section.id}
            section={section}
            updateSectionMutation={updateSectionMutation}
            deleteSectionMutation={deleteSectionMutation}
            cloneSectionMutation={cloneSectionMutation}
          />
        ))}
        
        {sections.length === 0 && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No sections configured yet. Add a section to get started.
          </div>
        )}
      </div>
    </div>
  );
}

interface SectionCardProps {
  section: AssessmentSection;
  updateSectionMutation: any;
  deleteSectionMutation: any;
  cloneSectionMutation: any;
}

function SectionCard({ section, updateSectionMutation, deleteSectionMutation, cloneSectionMutation }: SectionCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [showMarkingOptions, setShowMarkingOptions] = useState(false);
  const [editData, setEditData] = useState({
    name: section.name,
    questionText: section.questionText || '',
    questions: section.questions
  });

  const handleSave = () => {
    updateSectionMutation.mutate({
      id: section.id,
      data: editData
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditData({
      name: section.name,
      questionText: section.questionText || '',
      questions: section.questions
    });
    setIsEditing(false);
  };

  return (
    <div className="border rounded-lg p-4 bg-white dark:bg-gray-800 dark:border-gray-700">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1">
          <GripVertical className="h-4 w-4 text-gray-400" />
          
          {isEditing ? (
            <div className="flex-1 space-y-3">
              <Input
                value={editData.name}
                onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                className="font-medium"
                data-testid={`input-edit-section-name-${section.id}`}
              />
              <div className="space-y-3">
                <Textarea
                  value={editData.questionText}
                  onChange={(e) => setEditData({ ...editData, questionText: e.target.value })}
                  placeholder="Enter the question or instructions for this section..."
                  rows={3}
                  data-testid={`textarea-edit-question-text-${section.id}`}
                />
                <div className="flex items-center gap-2">
                  <Label>Questions:</Label>
                  <Input
                    type="number"
                    min="1"
                    value={editData.questions}
                    onChange={(e) => setEditData({ ...editData, questions: parseInt(e.target.value) || 1 })}
                    className="w-20"
                    data-testid={`input-edit-section-questions-${section.id}`}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSave} data-testid={`button-save-section-${section.id}`}>
                  Save
                </Button>
                <Button size="sm" variant="outline" onClick={handleCancel} data-testid={`button-cancel-section-${section.id}`}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-4">
                <h3 className="font-medium text-base">{section.name}</h3>
                <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                  <span>{section.questions} questions</span>
                  <span>Order: {section.order}</span>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => setShowMarkingOptions(!showMarkingOptions)}
                  data-testid={`button-toggle-marking-options-${section.id}`}
                >
                  {showMarkingOptions ? 'Hide Options' : 'Edit Options'}
                </Button>
                <Button 
                  size="sm" 
                  variant="ghost"
                  onClick={() => cloneSectionMutation.mutate(section.id)}
                  data-testid={`button-clone-section-${section.id}`}
                  title="Clone Section"
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button 
                  size="sm" 
                  variant="ghost"
                  onClick={() => setIsEditing(true)}
                  data-testid={`button-edit-section-${section.id}`}
                >
                  Edit
                </Button>
                <Button 
                  size="sm" 
                  variant="ghost"
                  onClick={() => deleteSectionMutation.mutate(section.id)}
                  data-testid={`button-delete-section-${section.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Question text shown compactly if exists */}
      {!isEditing && section.questionText && (
        <div className="mt-2 ml-7 text-sm text-gray-600 dark:text-gray-400">
          {section.questionText}
        </div>
      )}
      
      {/* Marking options - only shown when toggled */}
      {!isEditing && showMarkingOptions && (
        <div className="mt-4 ml-7">
          <MarkingOptionsSection sectionId={section.id} />
        </div>
      )}
    </div>
  );
}

interface MarkingOptionsSectionProps {
  sectionId: string;
}

function MarkingOptionsSection({ sectionId }: MarkingOptionsSectionProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [showAddForm, setShowAddForm] = useState(false);
  const [newOption, setNewOption] = useState({
    label: '',
    marks: 0
  });

  // Fetch marking options for this section
  const { data: markingOptions = [], isLoading } = useQuery<SectionMarkingOption[]>({
    queryKey: ['/api/sections', sectionId, 'marking-options'],
    queryFn: async () => {
      const response = await fetch(`/api/sections/${sectionId}/marking-options`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch marking options');
      return response.json();
    },
    enabled: !!sectionId
  });

  // Marking option mutations
  const createOptionMutation = useMutation({
    mutationFn: async (data: InsertSectionMarkingOption) => {
      const response = await fetch(`/api/sections/${sectionId}/marking-options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Failed to create marking option');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sections', sectionId, 'marking-options'] });
      toast({ title: "Marking option created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create marking option", variant: "destructive" });
    }
  });

  const updateOptionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string, data: Partial<InsertSectionMarkingOption> }) => {
      const response = await fetch(`/api/sections/marking-options/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Failed to update marking option');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sections', sectionId, 'marking-options'] });
      toast({ title: "Marking option updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update marking option", variant: "destructive" });
    }
  });

  const deleteOptionMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/sections/marking-options/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to delete marking option');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sections', sectionId, 'marking-options'] });
      toast({ title: "Marking option deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete marking option", variant: "destructive" });
    }
  });

  const handleCreateOption = () => {
    if (!newOption.label.trim() || newOption.marks < 0) return;
    
    const nextOrder = markingOptions.length > 0 ? Math.max(...markingOptions.map(o => o.order)) + 1 : 1;
    
    createOptionMutation.mutate({
      sectionId,
      label: newOption.label,
      marks: newOption.marks,
      order: nextOrder,
      isActive: 'true'
    });
    
    setNewOption({ label: '', marks: 0 });
    setShowAddForm(false);
  };

  if (isLoading) {
    return <div className="text-sm text-gray-500">Loading marking options...</div>;
  }

  return (
    <div className="space-y-3">
      <Separator />
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-medium text-sm">Marking Options ({markingOptions.length})</h4>
          {!showAddForm && (
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => setShowAddForm(true)}
              data-testid={`button-show-add-form-${sectionId}`}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Option
            </Button>
          )}
        </div>
        
        {/* Add new marking option - only shown when toggled */}
        {showAddForm && (
          <div className="flex items-end gap-3 mb-3 p-3 bg-gray-50 dark:bg-gray-900 rounded border">
            <div className="flex-1">
              <Label htmlFor={`option-label-${sectionId}`}>Option Label</Label>
              <Input
                id={`option-label-${sectionId}`}
                value={newOption.label}
                onChange={(e) => setNewOption({ ...newOption, label: e.target.value })}
                placeholder="e.g., Excellent"
                data-testid={`input-option-label-${sectionId}`}
              />
            </div>
            <div className="w-24">
              <Label htmlFor={`option-marks-${sectionId}`}>Marks</Label>
              <Input
                id={`option-marks-${sectionId}`}
                type="number"
                min="0"
                value={newOption.marks}
                onChange={(e) => setNewOption({ ...newOption, marks: parseInt(e.target.value) || 0 })}
                data-testid={`input-option-marks-${sectionId}`}
              />
            </div>
            <Button 
              size="sm" 
              onClick={handleCreateOption}
              disabled={!newOption.label.trim() || createOptionMutation.isPending}
              data-testid={`button-add-option-${sectionId}`}
            >
              Add
            </Button>
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => {
                setShowAddForm(false);
                setNewOption({ label: '', marks: 0 });
              }}
              data-testid={`button-cancel-add-option-${sectionId}`}
            >
              Cancel
            </Button>
          </div>
        )}

        {/* Existing marking options */}
        <div className="space-y-1">
          {markingOptions.map((option: SectionMarkingOption) => (
            <MarkingOptionItem
              key={option.id}
              option={option}
              updateOptionMutation={updateOptionMutation}
              deleteOptionMutation={deleteOptionMutation}
            />
          ))}
          
          {markingOptions.length === 0 && !showAddForm && (
            <div className="text-sm text-gray-500 py-2 text-center italic">
              No marking options configured yet. Click "Add Option" to get started.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface MarkingOptionItemProps {
  option: SectionMarkingOption;
  updateOptionMutation: any;
  deleteOptionMutation: any;
}

function MarkingOptionItem({ option, updateOptionMutation, deleteOptionMutation }: MarkingOptionItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    label: option.label,
    marks: option.marks
  });

  const handleSave = () => {
    updateOptionMutation.mutate({
      id: option.id,
      data: editData
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditData({
      label: option.label,
      marks: option.marks
    });
    setIsEditing(false);
  };

  return (
    <div className="flex items-center gap-3 p-2 border rounded bg-gray-50 dark:bg-gray-900 dark:border-gray-600">
      <GripVertical className="h-3 w-3 text-gray-400" />
      
      {isEditing ? (
        <div className="flex-1 flex items-center gap-2">
          <Input
            value={editData.label}
            onChange={(e) => setEditData({ ...editData, label: e.target.value })}
            className="flex-1 h-8"
            data-testid={`input-edit-option-label-${option.id}`}
          />
          <Input
            type="number"
            min="0"
            value={editData.marks}
            onChange={(e) => setEditData({ ...editData, marks: parseInt(e.target.value) || 0 })}
            className="w-20 h-8"
            data-testid={`input-edit-option-marks-${option.id}`}
          />
          <div className="flex gap-1">
            <Button size="sm" onClick={handleSave} data-testid={`button-save-option-${option.id}`}>
              Save
            </Button>
            <Button size="sm" variant="outline" onClick={handleCancel} data-testid={`button-cancel-option-${option.id}`}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-medium text-sm">{option.label}</span>
            <span className="text-xs text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 px-2 py-1 rounded">
              {option.marks} marks
            </span>
          </div>
          <div className="flex gap-1">
            <Button 
              size="sm" 
              variant="ghost"
              onClick={() => setIsEditing(true)}
              data-testid={`button-edit-option-${option.id}`}
              className="h-7 px-2"
            >
              Edit
            </Button>
            <Button 
              size="sm" 
              variant="ghost"
              onClick={() => deleteOptionMutation.mutate(option.id)}
              data-testid={`button-delete-option-${option.id}`}
              className="h-7 px-2"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

interface GradeBoundariesTabProps {
  assessment: Assessment;
  sections: AssessmentSection[];
  gradeBoundaries: AssessmentGradeBoundary[];
  boundariesLoading: boolean;
  createBoundaryMutation: any;
  updateBoundaryMutation: any;
  deleteBoundaryMutation: any;
  recalculateTotalMarksMutation: any;
}

function GradeBoundariesTab({ 
  assessment,
  sections,
  gradeBoundaries,
  boundariesLoading,
  createBoundaryMutation,
  updateBoundaryMutation,
  deleteBoundaryMutation,
  recalculateTotalMarksMutation
}: GradeBoundariesTabProps) {
  const [newBoundary, setNewBoundary] = useState({
    gradeLabel: '',
    percentageFrom: 0,
    percentageTo: 0,
    isPass: false
  });

  // Get total marks from the assessment
  const getTotalMarks = () => {
    return assessment.totalMarks || 0;
  };

  const handleCreateBoundary = () => {
    if (!newBoundary.gradeLabel.trim()) return;
    
    const nextOrder = gradeBoundaries.length > 0 ? Math.max(...gradeBoundaries.map(b => b.order)) + 1 : 1;
    
    createBoundaryMutation.mutate({
      assessmentId: assessment.id,
      gradeLabel: newBoundary.gradeLabel,
      percentageFrom: newBoundary.percentageFrom,
      percentageTo: newBoundary.percentageTo,
      isPass: newBoundary.isPass,
      order: nextOrder,
      isActive: 'true'
    });
    
    setNewBoundary({ gradeLabel: '', percentageFrom: 0, percentageTo: 0, isPass: false });
  };

  if (boundariesLoading) {
    return <div className="text-center py-8">Loading grade boundaries...</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Assessment Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Total Sections</Label>
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{sections.length}</div>
            </div>
            <div>
              <Label>Total Marks Available</Label>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">{getTotalMarks()}</div>
            </div>
            <div className="flex items-end">
              <Button 
                onClick={() => recalculateTotalMarksMutation.mutate()}
                disabled={recalculateTotalMarksMutation.isPending}
                variant="outline"
                size="sm"
                data-testid="button-recalculate-total-marks"
              >
                Recalculate Total Marks
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add Grade Boundary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="boundary-label">Grade Label</Label>
              <Input
                id="boundary-label"
                value={newBoundary.gradeLabel}
                onChange={(e) => setNewBoundary({ ...newBoundary, gradeLabel: e.target.value })}
                placeholder="e.g., Distinction"
                data-testid="input-boundary-label"
              />
            </div>
            <div>
              <Label htmlFor="boundary-from">% From</Label>
              <Input
                id="boundary-from"
                type="number"
                min="0"
                max="100"
                value={newBoundary.percentageFrom}
                onChange={(e) => setNewBoundary({ ...newBoundary, percentageFrom: parseInt(e.target.value) || 0 })}
                data-testid="input-boundary-from"
              />
            </div>
            <div>
              <Label htmlFor="boundary-to">% To</Label>
              <Input
                id="boundary-to"
                type="number"
                min="0"
                max="100"
                value={newBoundary.percentageTo}
                onChange={(e) => setNewBoundary({ ...newBoundary, percentageTo: parseInt(e.target.value) || 0 })}
                data-testid="input-boundary-to"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="boundary-is-pass"
                checked={newBoundary.isPass}
                onCheckedChange={(checked) => setNewBoundary({ ...newBoundary, isPass: !!checked })}
                data-testid="checkbox-boundary-is-pass"
              />
              <Label htmlFor="boundary-is-pass">Is Pass Grade</Label>
            </div>
          </div>
          <Button 
            onClick={handleCreateBoundary}
            disabled={!newBoundary.gradeLabel.trim() || createBoundaryMutation.isPending}
            data-testid="button-add-boundary"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Grade Boundary
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {gradeBoundaries.map((boundary) => (
          <GradeBoundaryCard
            key={boundary.id}
            boundary={boundary}
            updateBoundaryMutation={updateBoundaryMutation}
            deleteBoundaryMutation={deleteBoundaryMutation}
          />
        ))}
        
        {gradeBoundaries.length === 0 && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No grade boundaries configured yet. Add a boundary to get started.
          </div>
        )}
      </div>
    </div>
  );
}

interface GradeBoundaryCardProps {
  boundary: AssessmentGradeBoundary;
  updateBoundaryMutation: any;
  deleteBoundaryMutation: any;
}

function GradeBoundaryCard({ boundary, updateBoundaryMutation, deleteBoundaryMutation }: GradeBoundaryCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    gradeLabel: boundary.gradeLabel,
    percentageFrom: boundary.percentageFrom,
    percentageTo: boundary.percentageTo,
    isPass: boundary.isPass
  });

  const handleSave = () => {
    updateBoundaryMutation.mutate({
      id: boundary.id,
      data: editData
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditData({
      gradeLabel: boundary.gradeLabel,
      percentageFrom: boundary.percentageFrom,
      percentageTo: boundary.percentageTo,
      isPass: boundary.isPass
    });
    setIsEditing(false);
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <GripVertical className="h-4 w-4 text-gray-400" />
            <div className="flex-1">
              {isEditing ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <Input
                      value={editData.gradeLabel}
                      onChange={(e) => setEditData({ ...editData, gradeLabel: e.target.value })}
                      placeholder="Grade Label"
                      data-testid={`input-edit-boundary-label-${boundary.id}`}
                    />
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={editData.percentageFrom}
                      onChange={(e) => setEditData({ ...editData, percentageFrom: parseInt(e.target.value) || 0 })}
                      placeholder="% From"
                      data-testid={`input-edit-boundary-from-${boundary.id}`}
                    />
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={editData.percentageTo}
                      onChange={(e) => setEditData({ ...editData, percentageTo: parseInt(e.target.value) || 0 })}
                      placeholder="% To"
                      data-testid={`input-edit-boundary-to-${boundary.id}`}
                    />
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editData.isPass}
                        onCheckedChange={(checked) => setEditData({ ...editData, isPass: !!checked })}
                        data-testid={`checkbox-edit-boundary-is-pass-${boundary.id}`}
                      />
                      <Label>Is Pass</Label>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSave} data-testid={`button-save-boundary-${boundary.id}`}>
                      Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleCancel} data-testid={`button-cancel-boundary-${boundary.id}`}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  <h3 className="font-medium text-lg flex items-center gap-2">
                    {boundary.gradeLabel}
                    {boundary.isPass && <span className="text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-2 py-1 rounded">PASS</span>}
                  </h3>
                  <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                    <span>{boundary.percentageFrom}% - {boundary.percentageTo}%</span>
                    <span>Order: {boundary.order}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {!isEditing && (
            <div className="flex items-center gap-2">
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => setIsEditing(true)}
                data-testid={`button-edit-boundary-${boundary.id}`}
              >
                Edit
              </Button>
              <Button 
                size="sm" 
                variant="destructive"
                onClick={() => deleteBoundaryMutation.mutate(boundary.id)}
                data-testid={`button-delete-boundary-${boundary.id}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}