import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, FileText, Download, List } from "lucide-react";
import { format } from "date-fns";
import { useMemo } from "react";

interface SubmissionFile {
  id: string;
  fileName: string;
  originalFileName: string;
  fileSize: string;
  fileType?: string;
  uploadOrder: number;
  uploadedAt: string;
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

interface SectionMark {
  sectionId: string;
  marksAwarded: number;
  feedback: string | null;
  selectedOptionId: string | null;
}

interface SubmissionDetails {
  submission: {
    id: string;
    ltiLaunchId: string;
    submittedAt: string;
    attemptNumber: number | null;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    customAssessmentCode: string | null;
  };
  files: SubmissionFile[];
  assessmentSections: AssessmentSection[];
  existingGrade: {
    overallSummary: string | null;
    totalMarksAwarded: number | null;
    totalMarksPossible: number | null;
    finalGrade: string | null;
    percentageScore: number | null;
  } | null;
  existingSectionMarks: {
    id: string;
    submissionId: string;
    sectionId: string;
    markerId: string;
    selectedOptionId: string | null;
    feedback: string | null;
    marksAwarded: number;
    markingCriterias: any;
    createdAt: string;
    updatedAt: string;
  }[];
}

export default function LtiLearnerSubmission() {
  const [, params] = useRoute("/lti/submission/:id");

  const submissionId = params?.id;

  const searchParams = new URLSearchParams(window.location.search);
  const launchId = searchParams.get("launchId");
  const token = searchParams.get("token");
  
  // Preserve return params (page, limit, search) for back navigation
  const page = searchParams.get("page");
  const limit = searchParams.get("limit");
  const search = searchParams.get("search");
  
  // Build back URL with preserved params
  const buildBackUrl = () => {
    if (!launchId) return "";
    const backParams = new URLSearchParams();
    if (page) backParams.set("page", page);
    if (limit) backParams.set("limit", limit);
    if (search) backParams.set("search", search);
    const queryString = backParams.toString();
    return `/lti/results/${launchId}${queryString ? `?${queryString}` : ""}`;
  };
  
  const backUrl = buildBackUrl();

  // This component is for LTI learners only - requires viewer token
  // Fetch submission details using viewer token API
  const { data: submissionDetails, isLoading, error } = useQuery<SubmissionDetails>({
    queryKey: ["/api/lti/viewer/submission", submissionId, token],
    queryFn: async () => {
      if (!submissionId || !token) {
        throw new Error("Missing submission ID or viewer token");
      }
      
      // Use viewer token API
      const response = await fetch(`/api/lti/viewer/submission/${submissionId}?token=${token}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to fetch submission details");
      }
      const data = await response.json();
      
      // Transform viewer API response to match SubmissionDetails interface
      return {
        submission: {
          id: data.submission.id,
          ltiLaunchId: data.submission.ltiLaunchId || "",
          submittedAt: data.submission.submittedAt,
          attemptNumber: data.submission.attemptNumber,
          firstName: data.submission.fullName?.split(' ')[0] || null,
          lastName: data.submission.fullName?.split(' ').slice(1).join(' ') || null,
          email: data.submission.email,
          customAssessmentCode: data.submission.customAssessmentCode,
        },
        files: data.files,
        assessmentSections: data.assessmentSections,
        existingGrade: data.grade ? {
          overallSummary: data.grade.overallSummary,
          totalMarksAwarded: data.grade.totalMarksAwarded,
          totalMarksPossible: data.assessment?.totalMarks || null,
          finalGrade: data.grade.finalGrade,
          percentageScore: data.grade.percentageScore,
        } : null,
        existingSectionMarks: data.sectionMarks,
      };
    },
    enabled: !!submissionId && !!token,
  });

  const handleDownloadFile = async (
    submissionId: string,
    fileId: string,
    fileName: string,
  ) => {
    try {
      if (!token) {
        throw new Error("No viewer token available");
      }

      // Always use viewer token API for file downloads
      const downloadUrl = `/api/lti/viewer/submission/${submissionId}/files/${fileId}/download?token=${token}`;
      
      const response = await fetch(downloadUrl);
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("File download error:", error);
    }
  };

  // Create a map of section marks from existingSectionMarks
  const sectionMarksMap = new Map<string, { marksAwarded: number; feedback: string | null }>();
  submissionDetails?.existingSectionMarks?.forEach((mark) => {
    sectionMarksMap.set(mark.sectionId, {
      marksAwarded: mark.marksAwarded,
      feedback: mark.feedback,
    });
  });

  // Calculate total marks possible as the sum of maximum marking options for each section
  const totalMarksPossible = useMemo(() => {
    if (!submissionDetails?.assessmentSections) return 0;
    return submissionDetails.assessmentSections.reduce((total, section) => {
      const maxMarks = section.markingOptions.reduce(
        (max, option) => Math.max(max, option.marks),
        0
      );
      return total + maxMarks;
    }, 0);
  }, [submissionDetails?.assessmentSections]);

  // Check for missing token or submission ID
  if (!token || !submissionId) {
    return (
      <div className="w-full p-6">
        <div className="py-8 text-center">
          <p className="text-red-500 font-medium">Access Denied</p>
          <p className="mt-2 text-gray-500">
            Missing viewer token or submission ID. Please access this page through your LMS.
          </p>
          {backUrl && (
            <Link href={backUrl}>
              <Button className="mt-4">
                <List className="w-4 h-4 mr-2" />
                All Submissions
              </Button>
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="w-full p-6">
        <div className="py-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-2 text-gray-500">Loading submission details...</p>
        </div>
      </div>
    );
  }

  // Handle errors (e.g., invalid token, expired token)
  if (error) {
    return (
      <div className="w-full p-6">
        <div className="py-8 text-center">
          <p className="text-red-500 font-medium">Error Loading Submission</p>
          <p className="mt-2 text-gray-500">
            {error instanceof Error ? error.message : 'Failed to load submission details'}
          </p>
          {backUrl && (
            <Link href={backUrl}>
              <Button className="mt-4">
                <List className="w-4 h-4 mr-2" />
                All Submissions
              </Button>
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (!submissionDetails) {
    return (
      <div className="w-full p-6">
        <div className="py-8 text-center">
          <p className="text-gray-500">Submission not found</p>
          {backUrl && (
            <Link href={backUrl}>
              <Button className="mt-4">
                <List className="w-4 h-4 mr-2" />
                All Submissions
              </Button>
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full p-6 max-w-6xl mx-auto" data-testid="lti-learner-submission-page">
      {/* Header with Navigation Button */}
      <div className="mb-6 flex items-center gap-2">
        {backUrl && (
          <Link href={backUrl}>
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                All Submissions
              </Button>
            </div>
          </Link>
        )}
        <h1 className="text-3xl font-bold text-gray-900" data-testid="page-title">
          Submission Details
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Submission Info */}
        <div className="lg:col-span-1 space-y-6">
          {/* Submission Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Submission Information</CardTitle>
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
                  Assessment
                </Label>
                <p className="font-medium" data-testid="assessment-code">
                  {submissionDetails.submission.customAssessmentCode}
                </p>
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-500">
                  Submission Date
                </Label>
                <p className="font-medium" data-testid="submitted-at">
                  {format(
                    new Date(submissionDetails.submission.submittedAt),
                    "PPP",
                  )}
                </p>
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-500">
                  Attempt
                </Label>
                <p className="font-medium" data-testid="attempt-number">
                  {submissionDetails.submission.attemptNumber || 1}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Overall Grade (if available) */}
          {submissionDetails.existingGrade && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Overall Grade</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {submissionDetails.existingGrade.finalGrade && (
                  <div>
                    <Label className="text-sm font-medium text-gray-500">
                      Grade
                    </Label>
                    <div className="mt-1">
                      <Badge 
                        variant="secondary" 
                        className="text-base"
                        data-testid="final-grade"
                      >
                        {submissionDetails.existingGrade.finalGrade}
                      </Badge>
                    </div>
                  </div>
                )}
                <div>
                  <Label className="text-sm font-medium text-gray-500">
                    Total Marks
                  </Label>
                  <p className="text-sm font-medium" data-testid="total-marks">
                    {submissionDetails.existingGrade.totalMarksAwarded || 0}
                    /{totalMarksPossible}
                  </p>
                </div>
                {submissionDetails.existingGrade.percentageScore !== null && (
                  <div>
                    <Label className="text-sm font-medium text-gray-500">
                      Percentage
                    </Label>
                    <p className="text-sm font-medium" data-testid="percentage-score">
                      {submissionDetails.existingGrade.percentageScore.toFixed(1)}%
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column - Files and Marking */}
        <div className="lg:col-span-2 space-y-6">
          {/* Submitted Files */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Submitted Files ({submissionDetails.files.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {submissionDetails.files.length === 0 ? (
                <p className="text-gray-500 text-center py-4" data-testid="no-files">
                  No files uploaded
                </p>
              ) : (
                <div className="space-y-3">
                  {submissionDetails.files.map((file: SubmissionFile, index: number) => (
                    <div
                      key={file.id}
                      className="border rounded-lg p-4"
                      data-testid={`file-${index}`}
                    >
                      <div className="flex items-center justify-between">
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
                                file.originalFileName,
                              )
                            }
                            data-testid={`download-button-${index}`}
                          >
                            <Download className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Assessment Questions and Marks */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Assessment Feedback</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {submissionDetails.assessmentSections &&
              submissionDetails.assessmentSections.length > 0 ? (
                <>
                  {submissionDetails.assessmentSections.map(
                    (section: AssessmentSection, index: number) => {
                      const sectionMark = sectionMarksMap.get(section.id);
                      return (
                        <div
                          key={section.id}
                          className="space-y-3 p-4 border rounded-lg bg-gray-50"
                          data-testid={`question-${index}`}
                        >
                          <div className="flex items-start gap-2 flex-1">
                            <Badge variant="outline" className="text-xs mt-1">
                              Q{index + 1}
                            </Badge>
                            <div className="flex-1">
                              <h3
                                className="font-semibold text-base"
                                data-testid={`question-text-${index}`}
                              >
                                {section.questionText || `Question ${index + 1}`}
                              </h3>
                            </div>
                          </div>

                          <Separator />

                          {sectionMark ? (
                            <div className='flex gap-2'>
                              <div className="space-y-2 flex-1">
                                <Label className="text-sm font-medium text-gray-700">
                                  Marks Awarded
                                </Label>
                                <div 
                                  className="text-sm"
                                  data-testid={`feedback-${index}`}
                                >
                                  {sectionMark.marksAwarded} marks
                                </div>
                              </div>
                              <div className="space-y-2 flex-1">
                                <Label className="text-sm font-medium text-gray-700">
                                  Feedback
                                </Label>
                                <div 
                                  className="text-sm whitespace-pre-wrap"
                                  data-testid={`feedback-${index}`}
                                >
                                  {sectionMark.feedback || "No feedback provided"}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm italic" data-testid={`no-feedback-${index}`}>
                              Section not marked yet
                            </p>
                          )}
                        </div>
                      );
                    },
                  )}
                </>
              ) : (
                <p className="text-gray-500 text-center py-4">
                  No assessment questions found
                </p>
              )}

              {/* Overall Feedback */}
              {submissionDetails.existingGrade?.overallSummary && (
                <>
                  <Separator className="my-6" />
                  <div className="space-y-3 bg-gray-50 p-3 rounded border">
                    <Label className="text-base font-semibold text-gray-900">
                      Overall Feedback
                    </Label>
                    <div 
                      className="text-md whitespace-pre-wrap"
                      data-testid="overall-feedback"
                    >
                      {submissionDetails.existingGrade.overallSummary}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
