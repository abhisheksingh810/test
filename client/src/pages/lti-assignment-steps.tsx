import { useState } from "react";
import { useParams, useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { createSafeHtml } from "@/lib/html-sanitizer";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import type { LtiLaunchSession, InstructionStep } from "@shared/schema";
import { 
  ChevronRight, 
  ChevronLeft, 
  Upload, 
  FileText, 
  CheckCircle,
  AlertCircle,
  Loader,
  X,
} from "lucide-react";

export default function LtiAssignmentSteps() {
  const { launchId } = useParams<{ launchId: string }>();
  const search = useSearch();
  const { toast } = useToast();
  
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [checkboxStates, setCheckboxStates] = useState<{ [stepId: string]: { [itemIndex: number]: boolean } }>({});
  const [turnitinAgreed, setTurnitinAgreed] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Extract parameters from URL
  const searchParams = new URLSearchParams(search);
  const cisParam = searchParams.get('cis'); // Custom instruction set parameter

  // Get LTI session data
  const { data: sessionData, isLoading: sessionLoading, error: sessionError } = useQuery({
    queryKey: [`/api/lti/session/${launchId}`],
    enabled: !!launchId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const session: LtiLaunchSession | null = (sessionData as any)?.session || null;

  // Extract instruction set ID from session custom params
  let instructionSetId: string | null = null;
  if (session?.customParams) {
    try {
      const customParams = JSON.parse(session.customParams);
      // Priority: cis parameter > instruction_set_id
      instructionSetId = customParams.cis || customParams.instruction_set_id || cisParam;
    } catch {
      instructionSetId = cisParam;
    }
  } else {
    instructionSetId = cisParam;
  }

  // Get instruction steps for the specified instruction set
  const { data: instructionSteps, isLoading: stepsLoading, error: stepsError } = useQuery({
    queryKey: [`/api/instruction-steps/${instructionSetId}`],
    enabled: !!instructionSetId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const steps: InstructionStep[] = (instructionSteps as InstructionStep[]) || [];

  // Check submission eligibility before showing instructions
  const { data: eligibilityData, isLoading: eligibilityLoading, error: eligibilityError } = useQuery({
    queryKey: [`/api/lti/validate-eligibility/${launchId}`],
    queryFn: async () => {
      const res = await fetch(`/api/lti/validate-eligibility/${launchId}`, {
        credentials: "include",
      });

      if (!res.ok) {
        const errorData = await res.json();
        const error: any = new Error(errorData.message || res.statusText);
        error.status = res.status;
        error.data = errorData;
        throw error;
      }

      return res.json();
    },
    enabled: !!launchId,
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Extract assessment information for completion message
  const getAssessmentInfoFromSession = () => {
    if (!session?.customParams) {
      return {
        assessmentCode: null,
        instructionSetId: cisParam
      };
    }
    
    try {
      const customParams = JSON.parse(session.customParams);
      return {
        assessmentCode: customParams.cas || customParams.assessment_code,
        instructionSetId: customParams.cis || customParams.instruction_set_id || cisParam
      };
    } catch {
      return {
        assessmentCode: null,
        instructionSetId: cisParam
      };
    }
  };

  const assessmentInfo = getAssessmentInfoFromSession();
  const finalAssessmentCode = assessmentInfo.assessmentCode;

  // Get completion message for the instruction set (use instructionSetId instead of assessmentCode)
  const { data: completionMessageData } = useQuery({
    queryKey: ['/api/completion-message', instructionSetId],
    queryFn: async () => {
      if (!instructionSetId) return null;
      
      const response = await fetch(`/api/completion-message/${encodeURIComponent(instructionSetId)}`);
      if (!response.ok) return null;
      
      return response.json();
    },
    enabled: isSubmitted && !!instructionSetId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Submit assignment mutation for multiple files
  const submitMutation = useMutation({
    mutationFn: async () => {
      if (selectedFiles.length === 0) throw new Error('No files selected');

      // Simulate file upload progress
      setUploadProgress(0);
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      // Convert all files to base64
      const filesData = await Promise.all(
        selectedFiles.map(async (file, index) => {
          const fileData = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          });

          return {
            fileName: file.name,
            fileSize: `${(file.size / 1024 / 1024).toFixed(2)}MB`,
            fileType: file.name.split('.').pop()?.toLowerCase(),
            fileData,
            uploadOrder: index + 1
          };
        })
      );

      // Make the fetch request directly to capture the full error response
      const response = await fetch('/api/lti/submit', {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ launchId, files: filesData }),
        credentials: "include",
      });

      clearInterval(progressInterval);
      setUploadProgress(100);
      
      const result = await response.json();
      
      // Check for errors and throw with full error data
      if (!response.ok) {
        const error: any = new Error(result.message || 'Submission failed');
        error.status = response.status;
        error.data = result;
        throw error;
      }
      
      return result;
    },
    onSuccess: (data) => {
      setIsSubmitted(true);
      setShowConfirmDialog(false);
    },
    onError: (error: any) => {
      setUploadProgress(0);
      setShowConfirmDialog(false);
      
      // Handle 403 errors (both unmarked submission and attempt limit)
      if (error.status === 403 && error.data) {
        // Check if it's an unmarked previous submission error
        if (error.data.previousSubmissionStatus) {
          const status = error.data.previousSubmissionStatus;
          let title = "Previous Submission Pending";
          let description = error.message || "Your previous submission must be reviewed before you can submit again.";
          
          if (status === 'marking_skipped') {
            title = "Previous Submission Skipped";
            description = "Your previous submission was skipped and is awaiting resubmission approval. Please wait for your instructor to review it before submitting again.";
          } else if (status === 'on_hold') {
            title = "Previous Submission On Hold";
            description = "Your previous submission is currently on hold. Please wait for your instructor to review it before submitting again.";
          } else if (status === 'being_marked') {
            title = "Marking in Progress";
            description = "Your previous submission is currently being marked. Please wait for the marking to be completed before submitting again.";
          } else if (status === 'waiting') {
            title = "Awaiting Review";
            description = "Your previous submission is waiting to be marked. Please wait for your instructor to review it before submitting again.";
          }
          
          toast({
            title,
            description,
            variant: "destructive",
          });
        } 
        // Check if it's an attempt limit error
        else if (error.data.attemptCount !== undefined) {
          const { attemptCount, maxAttempts, attemptsRemaining } = error.data;
          
          toast({
            title: "Submission Limit Reached",
            description: error?.message || "You have used all your attempts.",
            variant: "destructive",
            duration: 10000, // 10 seconds
            
          });
        }
        // Generic 403 error
        else {
          toast({
            title: "Submission Not Allowed",
            description: error.message || "You are not allowed to submit at this time. Please contact your instructor if you believe this is an error.",
            variant: "destructive",
            duration: 10000, // 10 seconds
          });
        }
      } else {
        // Handle other errors
        toast({
          title: "Submission Failed",
          description: error.message || "Failed to submit assignment. Please try again.",
          variant: "destructive",
          duration: 10000, // 10 seconds
        });
      }
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const validFiles: File[] = [];
      const invalidFiles: string[] = [];

      Array.from(files).forEach(file => {
        // Check file size (10MB limit per file)
        if (file.size > 10 * 1024 * 1024) {
          invalidFiles.push(`${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
        } else {
          validFiles.push(file);
        }
      });

      if (invalidFiles.length > 0) {
        toast({
          title: "Some Files Too Large",
          description: `Files over 10MB were skipped: ${invalidFiles.join(', ')}`,
          variant: "destructive",
        });
      }

      if (validFiles.length > 0) {
        setSelectedFiles(prev => [...prev, ...validFiles]);
      }
    }
    
    // Reset input value so same files can be selected again
    event.target.value = '';
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const canSubmit = () => {
    return selectedFiles.length > 0 && turnitinAgreed;
  };

  const handleTurnitinAgreement = async (checked: boolean) => {
    setTurnitinAgreed(checked);

    // Persist TurnItIn agreement to database for audit purposes
    if (checked && launchId && instructionSetId) {
      try {
        await apiRequest('POST', '/api/user-agreements/turnitin', {
          ltiLaunchId: launchId,
          instructionSetId: instructionSetId
        });
        console.log(`✅ Recorded TurnItIn agreement`);
      } catch (error) {
        console.error('Failed to record TurnItIn agreement:', error);
        toast({
          title: "Agreement Recording Issue", 
          description: "Your TurnItIn agreement was noted but may not be fully recorded. Please try again if needed.",
          variant: "destructive",
        });
      }
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    
    if (selectedFiles.length === 0) {
      toast({
        title: "No Files Selected",
        description: "Please select at least one file to submit.",
        variant: "destructive",
      });
      return;
    }

    if (!turnitinAgreed) {
      toast({
        title: "Agreement Required",
        description: "Please agree to the TurnItIn end user agreement before submitting.",
        variant: "destructive",
      });
      return;
    }
    
    // Show confirmation dialog
    setShowConfirmDialog(true);
  };

  const confirmSubmission = async () => {
    // Record final submission timestamp for audit purposes
    if (launchId && instructionSetId) {
      try {
        await apiRequest('POST', '/api/user-agreements/submission', {
          ltiLaunchId: launchId,
          instructionSetId: instructionSetId
        });
        console.log('✅ Recorded final submission timestamp');
      } catch (error) {
        console.error('Failed to record final submission timestamp:', error);
        // Don't prevent submission if logging fails
      }
    }
    
    submitMutation.mutate();
  };

  const canProceedFromCurrentStep = () => {
    if (!steps[currentStep]) return false;
    
    const step = steps[currentStep];
    
    if (step.stepType === 'checkbox' && step.checkboxItems) {
      const stepCheckboxes = checkboxStates[step.id] || {};
      // All checkboxes must be checked
      return step.checkboxItems.every((_, index) => stepCheckboxes[index] === true);
    }
    
    return true; // For 'info' type steps, always allow proceeding
  };

  const handleCheckboxChange = (stepId: string, itemIndex: number, checked: boolean) => {
    // Only update local state - API call happens when user clicks "Next"
    setCheckboxStates(prev => ({
      ...prev,
      [stepId]: {
        ...prev[stepId],
        [itemIndex]: checked
      }
    }));
  };

  const nextStep = async () => {
    const currentStepData = steps[currentStep];
    
    // Record step agreement when leaving a checkbox step with all checkboxes checked
    if (currentStepData?.stepType === 'checkbox' && canProceedFromCurrentStep()) {
      if (launchId && instructionSetId) {
        try {
          await apiRequest('POST', '/api/user-agreements/step', {
            ltiLaunchId: launchId,
            instructionSetId: instructionSetId,
            stepId: currentStepData.id,
            checkboxIndex: 0 // Since we simplified to single timestamp per step
          });
          console.log(`✅ Recorded step agreement for step ${currentStepData.id}`);
        } catch (error) {
          console.error('Failed to record step agreement:', error);
          toast({
            title: "Agreement Recording Issue",
            description: "Your agreement was noted but may not be fully recorded. Please try again if needed.",
            variant: "destructive",
          });
        }
      }
    }
    
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  if (sessionLoading || stepsLoading || eligibilityLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="pt-6">
            <div className="text-center">
              <Loader className="h-12 w-12 mx-auto mb-4 animate-spin" style={{ color: '#453878' }} />
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Loading Assignment</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Please wait while we prepare your assignment...
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Check eligibility error (403 response means not eligible)
  if (eligibilityError) {
    const errorData = (eligibilityError as any)?.response?.data || (eligibilityError as any)?.data;
    const errorMessage = errorData?.message || "You are not eligible to submit a new attempt at this time.";
    const blockingType = errorData?.blockingType;

    let title = "Submission Not Allowed";
    if (blockingType === 'passed_previous') {
      title = "Already Passed";
    } else if (blockingType === 'unmarked_submission') {
      title = "Previous Submission Unmarked";
    } else if (blockingType === 'attempt_limit') {
      title = "Attempt Limit Reached";
    } else if (blockingType === 'malpractice_limit') {
      title = "Malpractice Enforcement";
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">{title}</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {errorMessage}
              </p>
              {blockingType === 'passed_previous' && (
                <p className="text-sm text-green-600 font-semibold mt-4">
                  Congratulations on passing!
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (sessionError || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Session Not Found</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                This assignment session has expired or is invalid.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (stepsError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Error Loading Instructions</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                There was an error loading the assignment instructions.
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                Please try refreshing the page or contact support if the issue persists.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isSubmitted) {
    const customMessage = (completionMessageData as any)?.message;
    const customSubmissionTitle = (completionMessageData as any)?.submissionTitle;
    
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#453878' }}>
        <Card className="w-full max-w-md mx-4 border-white shadow-2xl">
          <CardContent className="pt-8 pb-8">
            <div className="text-center">
              <CheckCircle className="h-16 w-16 mx-auto mb-6" style={{ color: '#453878' }} />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                {customSubmissionTitle || "Your assignment has been submitted"}
              </h1>
              {customMessage ? (
                <div 
                  className="text-gray-600 dark:text-gray-400 text-base leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: customMessage }}
                />
              ) : (
                <p className="text-gray-600 dark:text-gray-400 text-base leading-relaxed">
                  Thank you for completing your assignment. Your submission has been received and will be reviewed.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // If no steps configured, show the upload interface directly
  if (!steps.length) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="w-full px-2 sm:px-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg">
            {/* Header */}
            <div className="bg-[#453878] text-white px-6 py-3">
              <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold truncate mr-4">Upload Assignment</h1>
                <Button 
                  onClick={handleSubmit} 
                  disabled={!canSubmit() || submitMutation.isPending}
                  className="bg-black text-white hover:bg-gray-800 rounded-none"
                  data-testid="button-submit"
                >
                  Submit
                </Button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* File Upload Section */}
                <div>
                  <Label htmlFor="file-multiple" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Select Files to Upload
                  </Label>
                  <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 dark:border-gray-600 border-dashed rounded-md hover:border-gray-400 dark:hover:border-gray-500 transition-colors">
                    <div className="space-y-1 text-center">
                      <Upload className="mx-auto h-12 w-12 text-gray-400" />
                      <div className="flex text-sm text-gray-600 dark:text-gray-400">
                        <Label
                          htmlFor="file-multiple"
                          className="relative cursor-pointer bg-white dark:bg-gray-800 rounded-md font-medium focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2"
                          style={{ color: '#453878' }}
                        >
                          <span>Upload files</span>
                          <Input
                            id="file-multiple"
                            name="files"
                            type="file"
                            multiple
                            className="sr-only"
                            onChange={handleFileSelect}
                            accept=".pdf,.doc,.docx,.txt"
                            data-testid="input-files"
                          />
                        </Label>
                        <p className="pl-1">or drag and drop</p>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-500">
                        PDF, DOC, DOCX, TXT up to 10MB each
                      </p>
                    </div>
                  </div>
                  
                  {/* Selected Files List */}
                  {selectedFiles.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Selected Files ({selectedFiles.length})
                      </h3>
                      <div className="space-y-2">
                        {selectedFiles.map((file, index) => (
                          <div 
                            key={`${file.name}-${index}`} 
                            className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-md"
                            data-testid={`selected-file-${index}`}
                          >
                            <div className="flex items-center space-x-2">
                              <FileText className="h-4 w-4 text-gray-500" />
                              <span className="text-sm text-gray-700 dark:text-gray-300">
                                {file.name}
                              </span>
                              <span className="text-xs text-gray-500">
                                ({(file.size / 1024 / 1024).toFixed(2)}MB)
                              </span>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeFile(index)}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50"
                              data-testid={`button-remove-file-${index}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* TurnItIn Agreement Section */}
                <div className="space-y-4">
                  <Separator />
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                      End User License Agreement
                    </h3>
                    
                    {/* TurnItIn Agreement iframe */}
                    <div className="border border-gray-300 dark:border-gray-600 rounded-md">
                      <iframe
                        src="https://www.turnitin.com/agreement.asp"
                        className="w-full h-64 rounded-md"
                        title="TurnItIn End User Agreement"
                        data-testid="iframe-turnitin-agreement"
                      />
                    </div>
                    
                    {/* Agreement Checkbox */}
                    <div className="mt-4 flex items-start space-x-3">
                      <Checkbox
                        id="turnitin-agreement"
                        checked={turnitinAgreed}
                        onCheckedChange={(checked) => handleTurnitinAgreement(!!checked)}
                        className="mt-1"
                        data-testid="checkbox-turnitin-agreement"
                      />
                      <Label 
                        htmlFor="turnitin-agreement"
                        className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed cursor-pointer"
                      >
                        I understand and accept the end-user agreement
                      </Label>
                    </div>
                    
                    {!turnitinAgreed && selectedFiles.length > 0 && (
                      <Alert className="mt-4">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          You must accept the end-user agreement before submitting your files.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                </div>

                {uploadProgress > 0 && uploadProgress < 100 && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Uploading...</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <Progress value={uploadProgress} className="w-full" />
                  </div>
                )}
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Multi-step interface
  const isUploadStep = currentStep >= steps.length;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="w-full px-2 sm:px-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg">
          {/* Header */}
          <div className="bg-[#453878] text-white px-6 py-3">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold truncate mr-4">Upload Assignment</h1>
              {isUploadStep ? (
                <Button 
                  onClick={handleSubmit} 
                  disabled={!canSubmit() || submitMutation.isPending}
                  className="bg-black text-white hover:bg-gray-800 rounded-none"
                  data-testid="button-submit"
                >
                  Submit
                </Button>
              ) : (
                <Button 
                  onClick={nextStep}
                  disabled={!canProceedFromCurrentStep()}
                  className="bg-black text-white hover:bg-gray-800 rounded-none"
                >
                  Next <ChevronRight className="ml-1" size={16} />
                </Button>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {!isUploadStep ? (
              /* Instruction Step */
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                    {steps[currentStep]?.title}
                  </h2>
                  <div 
                    className="prose prose-sm max-w-none text-gray-700 dark:text-gray-300"
                    dangerouslySetInnerHTML={createSafeHtml(steps[currentStep]?.content || '')}
                  />
                </div>

                {steps[currentStep]?.stepType === 'checkbox' && steps[currentStep]?.checkboxItems && (
                  <div className="space-y-4">
                    <Separator />
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                        Please confirm agreement to the statement(s):
                      </h3>
                      <div className="space-y-3">
                        {steps[currentStep].checkboxItems!.map((item, index) => (
                          <div key={index} className="flex items-start space-x-3">
                            <Checkbox
                              id={`checkbox-${currentStep}-${index}`}
                              checked={checkboxStates[steps[currentStep].id]?.[index] || false}
                              onCheckedChange={(checked) => 
                                handleCheckboxChange(steps[currentStep].id, index, !!checked)
                              }
                              className="mt-1"
                            />
                            <Label 
                              htmlFor={`checkbox-${currentStep}-${index}`}
                              className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed cursor-pointer"
                            >
                              {item}
                            </Label>
                          </div>
                        ))}
                      </div>
                      
                      {steps[currentStep].stepType === 'checkbox' && !canProceedFromCurrentStep() && (
                        <Alert className="mt-4">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>
                            You must check all boxes to continue.
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Upload Step */
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                    Upload Your Assignment
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400">
                    Please select your assignment files to submit.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* File Upload Section */}
                  <div>
                    <Label htmlFor="file-step" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Select Files to Upload
                    </Label>
                    <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 dark:border-gray-600 border-dashed rounded-md hover:border-gray-400 dark:hover:border-gray-500 transition-colors">
                      <div className="space-y-1 text-center">
                        <Upload className="mx-auto h-12 w-12 text-gray-400" />
                        <div className="flex text-sm text-gray-600 dark:text-gray-400">
                          <Label
                            htmlFor="file-step"
                            className="relative cursor-pointer bg-white dark:bg-gray-800 rounded-md font-medium focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2"
                            style={{ color: '#453878' }}
                          >
                            <span>Upload files</span>
                            <Input
                              id="file-step"
                              name="files"
                              type="file"
                              multiple
                              className="sr-only"
                              onChange={handleFileSelect}
                              accept=".pdf,.doc,.docx,.txt"
                              data-testid="input-files"
                            />
                          </Label>
                          <p className="pl-1">or drag and drop</p>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-500">
                          PDF, DOC, DOCX, TXT up to 10MB each
                        </p>
                      </div>
                    </div>
                    
                    {/* Selected Files List */}
                    {selectedFiles.length > 0 && (
                      <div className="mt-4 space-y-2">
                        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Selected Files ({selectedFiles.length})
                        </h3>
                        <div className="space-y-2">
                          {selectedFiles.map((file, index) => (
                            <div 
                              key={`${file.name}-${index}`} 
                              className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-md"
                              data-testid={`selected-file-${index}`}
                            >
                              <div className="flex items-center space-x-2">
                                <FileText className="h-4 w-4 text-gray-500" />
                                <span className="text-sm text-gray-700 dark:text-gray-300">
                                  {file.name}
                                </span>
                                <span className="text-xs text-gray-500">
                                  ({(file.size / 1024 / 1024).toFixed(2)}MB)
                                </span>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeFile(index)}
                                className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                data-testid={`button-remove-file-${index}`}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* TurnItIn Agreement Section */}
                  <div className="space-y-4">
                    <Separator />
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                        End User License Agreement
                      </h3>
                      
                      {/* TurnItIn Agreement iframe */}
                      <div className="border border-gray-300 dark:border-gray-600 rounded-md">
                        <iframe
                          src="https://www.turnitin.com/agreement.asp"
                          className="w-full h-64 rounded-md"
                          title="TurnItIn End User Agreement"
                          data-testid="iframe-turnitin-agreement"
                        />
                      </div>
                      
                      {/* Agreement Checkbox */}
                      <div className="mt-4 flex items-start space-x-3">
                        <Checkbox
                          id="turnitin-agreement-step"
                          checked={turnitinAgreed}
                          onCheckedChange={(checked) => handleTurnitinAgreement(!!checked)}
                          className="mt-1"
                          data-testid="checkbox-turnitin-agreement"
                        />
                        <Label 
                          htmlFor="turnitin-agreement-step"
                          className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed cursor-pointer"
                        >
                          I understand and accept the end-user agreement
                        </Label>
                      </div>
                      
                      {!turnitinAgreed && selectedFiles.length > 0 && (
                        <Alert className="mt-4">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>
                            You must accept the end-user agreement before submitting your files.
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  </div>

                  {uploadProgress > 0 && uploadProgress < 100 && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Uploading...</span>
                        <span>{uploadProgress}%</span>
                      </div>
                      <Progress value={uploadProgress} className="w-full" />
                    </div>
                  )}
                </form>
              </div>
            )}

            {/* Navigation */}
            <div className="bg-[#453878] text-white px-6 py-3 flex justify-between items-center">
              <Button
                variant="outline"
                onClick={prevStep}
                disabled={currentStep === 0}
                className="flex items-center bg-black text-white hover:bg-gray-800 rounded-none border-none"
              >
                <ChevronLeft className="mr-1" size={16} />
                Back
              </Button>
              
              {!isUploadStep && (
                <Button 
                  onClick={nextStep}
                  disabled={!canProceedFromCurrentStep()}
                  className="flex items-center bg-black text-white hover:bg-gray-800 rounded-none"
                >
                  Next <ChevronRight className="ml-1" size={16} />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent data-testid="dialog-confirm-submission">
          <DialogHeader>
            <DialogTitle>Confirm Submission</DialogTitle>
            <DialogDescription>
              Are you sure you want to submit and end this assessment?
              <br />
              <br />
              <strong>WARNING:</strong> You will not be able to access this screen again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowConfirmDialog(false)}
              data-testid="button-cancel-submission"
            >
              Cancel
            </Button>
            <Button 
              onClick={confirmSubmission}
              disabled={submitMutation.isPending}
              data-testid="button-confirm-submission"
            >
              {submitMutation.isPending ? 'Submitting...' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}