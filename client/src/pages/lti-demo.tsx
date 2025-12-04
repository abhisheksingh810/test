import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { ExternalLink, Settings, Rocket } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

export default function LtiDemo() {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    oauth_consumer_key: 'demo_consumer_key',
    user_id: 'student123',
    lis_person_contact_email_primary: 'student@thoughtindustries.com',
    lis_person_name_full: 'John Doe',
    context_title: 'Introduction to Web Development',
    resource_link_title: 'Final Project Assignment',
    launch_presentation_return_url: 'https://thoughtindustries.com/courses/web-dev/assignments',
    resource_link_id: 'assignment_001',
    context_id: 'course_webdev_2025',
    tool_consumer_instance_guid: 'thoughtindustries.com',
    custom_assignment_id: '',
    custom_action: 'exercise_attempt',
    cis: '368c13cc-9345-44a2-b572-a162dcd11c89', // Custom instruction set parameter
    cas: '3CO02_25_PQA1' // Custom assessment code parameter
  });

  const launchMutation = useMutation({
    mutationFn: async (ltiData: typeof formData) => {
      const params = new URLSearchParams();
      Object.entries(ltiData).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });
      
      const response = await fetch('/api/lti/launch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return response;
    },
    onSuccess: (data: any) => {
      // Since the API now redirects directly, we'll handle this differently
      // The demo will simulate opening the assignment page directly
      toast({
        title: "LTI Launch Successful", 
        description: "In a real LMS, you would be redirected to the assignment page.",
      });
      
      // For demo purposes, open a sample assignment page
      setTimeout(() => {
        window.open('/lti-demo-assignment', '_blank', 'width=800,height=600');
      }, 1000);
    },
    onError: (error: any) => {
      toast({
        title: "LTI Launch Failed",
        description: error.message || "Failed to launch LTI session.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    launchMutation.mutate(formData);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Rocket className="h-6 w-6 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">LTI Integration Demo</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Test the Learning Tools Interoperability integration with Thought Industries LMS
          </p>
        </div>
      </div>

      <Alert>
        <Settings className="h-4 w-4" />
        <AlertDescription>
          This demo simulates how Thought Industries LMS would launch assignment submissions in our platform.
          Make sure the LTI consumer key in system settings matches the one below.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>LTI Launch Parameters</CardTitle>
          <CardDescription>
            These parameters would normally be sent automatically by the LMS when launching the tool.
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="consumer_key">Consumer Key</Label>
                <Input
                  id="consumer_key"
                  value={formData.oauth_consumer_key}
                  onChange={(e) => handleInputChange('oauth_consumer_key', e.target.value)}
                  placeholder="LTI consumer key"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="user_id">User ID</Label>
                <Input
                  id="user_id"
                  value={formData.user_id}
                  onChange={(e) => handleInputChange('user_id', e.target.value)}
                  placeholder="Student user ID"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="email">Student Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.lis_person_contact_email_primary}
                  onChange={(e) => handleInputChange('lis_person_contact_email_primary', e.target.value)}
                  placeholder="student@thoughtindustries.com"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="name">Student Name</Label>
                <Input
                  id="name"
                  value={formData.lis_person_name_full}
                  onChange={(e) => handleInputChange('lis_person_name_full', e.target.value)}
                  placeholder="Student full name"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="course">Course Title</Label>
                <Input
                  id="course"
                  value={formData.context_title}
                  onChange={(e) => handleInputChange('context_title', e.target.value)}
                  placeholder="Course name"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="assignment">Assignment Title</Label>
                <Input
                  id="assignment"
                  value={formData.resource_link_title}
                  onChange={(e) => handleInputChange('resource_link_title', e.target.value)}
                  placeholder="Assignment name"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="return_url">Return URL</Label>
              <Input
                id="return_url"
                value={formData.launch_presentation_return_url}
                onChange={(e) => handleInputChange('launch_presentation_return_url', e.target.value)}
                placeholder="URL to return to after submission"
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="resource_link_id">Resource Link ID</Label>
                <Input
                  id="resource_link_id"
                  value={formData.resource_link_id}
                  onChange={(e) => handleInputChange('resource_link_id', e.target.value)}
                  placeholder="Unique assignment identifier"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="context_id">Context ID</Label>
                <Input
                  id="context_id"
                  value={formData.context_id}
                  onChange={(e) => handleInputChange('context_id', e.target.value)}
                  placeholder="Course context identifier"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="custom_action">Custom Action</Label>
                <Input
                  id="custom_action"
                  value={formData.custom_action}
                  onChange={(e) => handleInputChange('custom_action', e.target.value)}
                  placeholder="exercise_attempt"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="cis">Custom Instruction Set (cis)</Label>
                <Input
                  id="cis"
                  value={formData.cis}
                  onChange={(e) => handleInputChange('cis', e.target.value)}
                  placeholder="Instruction Set ID, slug, or assessment code"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="cas">Custom Assessment Code (cas)</Label>
                <Input
                  id="cas"
                  value={formData.cas}
                  onChange={(e) => handleInputChange('cas', e.target.value)}
                  placeholder="Assessment code from Course Management System"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={launchMutation.isPending}
              className="w-full"
            >
              {launchMutation.isPending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Launching...
                </>
              ) : (
                <>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Launch Assignment Submission
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How it Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="flex flex-col items-center text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold mb-2">1</div>
              <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-1">LMS Launch</h3>
              <p className="text-blue-700 dark:text-blue-300">
                Thought Industries LMS sends student to our platform with assignment context
              </p>
            </div>
            
            <div className="flex flex-col items-center text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <div className="w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold mb-2">2</div>
              <h3 className="font-semibold text-green-800 dark:text-green-200 mb-1">Submission</h3>
              <p className="text-green-700 dark:text-green-300">
                Student uploads assignment file through our secure interface
              </p>
            </div>
            
            <div className="flex flex-col items-center text-center p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
              <div className="w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold mb-2">3</div>
              <h3 className="font-semibold text-purple-800 dark:text-purple-200 mb-1">Return</h3>
              <p className="text-purple-700 dark:text-purple-300">
                Student is redirected back to LMS with submission confirmation
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}