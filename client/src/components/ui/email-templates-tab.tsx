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
import { WysiwygEditor } from "@/components/ui/wysiwyg-editor";
import type { EmailTemplate, InsertEmailTemplate } from "@shared/schema";
import { Mail, Plus, Edit, Trash2, Save, X } from "lucide-react";

export function EmailTemplatesTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const [newTemplate, setNewTemplate] = useState<InsertEmailTemplate>({
    templateKey: '',
    hubspotEmailId: '',
    templateName: '',
    description: '',
    subject: '',
    htmlContent: '',
    isActive: 'true'
  });

  // Query for email templates
  const { data: emailTemplates, isLoading } = useQuery<EmailTemplate[]>({
    queryKey: ['/api/email-templates'],
    staleTime: 5 * 60 * 1000 // 5 minutes
  });

  // Create template mutation
  const createTemplateMutation = useMutation({
    mutationFn: async (templateData: InsertEmailTemplate) => {
      const response = await apiRequest('POST', '/api/email-templates', templateData);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create template');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Template Created",
        description: "Email template created successfully",
      });
      setIsCreateDialogOpen(false);
      setNewTemplate({
        templateKey: '',
        hubspotEmailId: '',
        templateName: '',
        description: '',
        subject: '',
        htmlContent: '',
        isActive: 'true'
      });
      queryClient.invalidateQueries({ queryKey: ['/api/email-templates'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Creation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update template mutation
  const updateTemplateMutation = useMutation({
    mutationFn: async ({ id, ...templateData }: Partial<InsertEmailTemplate> & { id: string }) => {
      const response = await apiRequest('PUT', `/api/email-templates/${id}`, templateData);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update template');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Template Updated",
        description: "Email template updated successfully",
      });
      setIsEditDialogOpen(false);
      setEditingTemplate(null);
      queryClient.invalidateQueries({ queryKey: ['/api/email-templates'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('DELETE', `/api/email-templates/${id}`, {});
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete template');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Template Deleted",
        description: "Email template deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/email-templates'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Deletion Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCreateTemplate = () => {
    createTemplateMutation.mutate(newTemplate);
  };

  const handleEditTemplate = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setIsEditDialogOpen(true);
  };

  const handleUpdateTemplate = () => {
    if (editingTemplate) {
      updateTemplateMutation.mutate({
        id: editingTemplate.id,
        templateKey: editingTemplate.templateKey,
        hubspotEmailId: editingTemplate.hubspotEmailId,
        templateName: editingTemplate.templateName,
        description: editingTemplate.description,
        subject: editingTemplate.subject,
        htmlContent: editingTemplate.htmlContent,
        isActive: editingTemplate.isActive
      });
    }
  };

  const handleDeleteTemplate = (id: string) => {
    if (confirm('Are you sure you want to delete this email template?')) {
      deleteTemplateMutation.mutate(id);
    }
  };

  const templateKeyOptions = [
    { value: 'invite_user', label: 'User Invitation' },
    { value: 'forgot_password', label: 'Forgot Password' },
    { value: 'welcome', label: 'Welcome Email' },
    { value: 'assignment_notification', label: 'Assignment Notification' },
    { value: 'grade_notification', label: 'Grade Notification' }
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-64 mb-4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center">
              <Mail className="mr-2" size={20} />
              Email Templates Management
            </div>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2" size={16} />
                  Add Template
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create Email Template</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="templateKey">Template Key</Label>
                      <Select
                        value={newTemplate.templateKey}
                        onValueChange={(value) => setNewTemplate({ ...newTemplate, templateKey: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select template type" />
                        </SelectTrigger>
                        <SelectContent>
                          {templateKeyOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="hubspotEmailId">HubSpot Email ID</Label>
                      <Input
                        id="hubspotEmailId"
                        type="text"
                        placeholder="Enter HubSpot email template ID"
                        value={newTemplate.hubspotEmailId || ''}
                        onChange={(e) => setNewTemplate({ ...newTemplate, hubspotEmailId: e.target.value })}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="templateName">Template Name</Label>
                    <Input
                      id="templateName"
                      type="text"
                      placeholder="Enter template name"
                      value={newTemplate.templateName}
                      onChange={(e) => setNewTemplate({ ...newTemplate, templateName: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      placeholder="Enter template description"
                      value={newTemplate.description || ''}
                      onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="subject">Email Subject</Label>
                    <Input
                      id="subject"
                      type="text"
                      placeholder="Enter email subject line"
                      value={newTemplate.subject || ''}
                      onChange={(e) => setNewTemplate({ ...newTemplate, subject: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="htmlContent">Email Content</Label>
                    <WysiwygEditor
                      value={newTemplate.htmlContent || ''}
                      onChange={(value) => setNewTemplate({ ...newTemplate, htmlContent: value })}
                      placeholder="Enter HTML email content. Use variables like {{ user_name }}, {{ login_url }}, etc."
                      minHeight="400px"
                      className="mt-2"
                    />
                    <p className="text-sm text-gray-500 mt-2">
                      Available variables: {`{{ user_name }}, {{ user_role }}, {{ temp_password }}, {{ login_url }}, {{ platform_name }}, {{ reset_url }}`}
                    </p>
                  </div>
                  <div className="flex justify-end space-x-2">
                    <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                      <X className="mr-2" size={16} />
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleCreateTemplate}
                      disabled={createTemplateMutation.isPending || !newTemplate.templateKey || !newTemplate.templateName || (!newTemplate.hubspotEmailId && !newTemplate.htmlContent)}
                    >
                      <Save className="mr-2" size={16} />
                      {createTemplateMutation.isPending ? 'Creating...' : 'Create Template'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </CardTitle>
          <CardDescription>
            Create and manage email templates with custom HTML content or HubSpot integration. Each template corresponds to a specific email type and supports variable substitution.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {emailTemplates && emailTemplates.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Template Key</TableHead>
                  <TableHead>Template Name</TableHead>
                  <TableHead>Content Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {emailTemplates.map((template: EmailTemplate) => (
                  <TableRow key={template.id}>
                    <TableCell>
                      <Badge variant="outline">{template.templateKey}</Badge>
                    </TableCell>
                    <TableCell>{template.templateName}</TableCell>
                    <TableCell>
                      {template.htmlContent ? (
                        <Badge variant="secondary">Custom HTML</Badge>
                      ) : template.hubspotEmailId ? (
                        <Badge variant="outline">HubSpot ID: {template.hubspotEmailId}</Badge>
                      ) : (
                        <Badge variant="destructive">Not Configured</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={template.isActive === 'true' ? 'default' : 'secondary'}>
                        {template.isActive === 'true' ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleEditTemplate(template)}
                        >
                          <Edit size={16} />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleDeleteTemplate(template.id)}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8">
              <Mail className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No email templates</h3>
              <p className="mt-1 text-sm text-gray-500">Get started by creating your first email template.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Template Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Email Template</DialogTitle>
          </DialogHeader>
          {editingTemplate && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="editTemplateKey">Template Key</Label>
                  <Select
                    value={editingTemplate.templateKey}
                    onValueChange={(value) => setEditingTemplate({ ...editingTemplate, templateKey: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {templateKeyOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="editHubspotEmailId">HubSpot Email ID</Label>
                  <Input
                    id="editHubspotEmailId"
                    type="text"
                    value={editingTemplate.hubspotEmailId || ''}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, hubspotEmailId: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="editTemplateName">Template Name</Label>
                <Input
                  id="editTemplateName"
                  type="text"
                  value={editingTemplate.templateName}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, templateName: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="editDescription">Description</Label>
                <Textarea
                  id="editDescription"
                  value={editingTemplate.description || ''}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, description: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="editSubject">Email Subject</Label>
                <Input
                  id="editSubject"
                  type="text"
                  placeholder="Enter email subject line"
                  value={editingTemplate.subject || ''}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, subject: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="editHtmlContent">Email Content</Label>
                <WysiwygEditor
                  value={editingTemplate.htmlContent || ''}
                  onChange={(value) => setEditingTemplate({ ...editingTemplate, htmlContent: value })}
                  placeholder="Enter HTML email content. Use variables like {{ user_name }}, {{ login_url }}, etc."
                  minHeight="400px"
                  className="mt-2"
                />
                <p className="text-sm text-gray-500 mt-2">
                  Available variables: {`{{ user_name }}, {{ user_role }}, {{ temp_password }}, {{ login_url }}, {{ platform_name }}, {{ reset_url }}`}
                </p>
              </div>
              <div>
                <Label htmlFor="editIsActive">Status</Label>
                <Select
                  value={editingTemplate.isActive}
                  onValueChange={(value) => setEditingTemplate({ ...editingTemplate, isActive: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Active</SelectItem>
                    <SelectItem value="false">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                  <X className="mr-2" size={16} />
                  Cancel
                </Button>
                <Button 
                  onClick={handleUpdateTemplate}
                  disabled={updateTemplateMutation.isPending}
                >
                  <Save className="mr-2" size={16} />
                  {updateTemplateMutation.isPending ? 'Updating...' : 'Update Template'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}