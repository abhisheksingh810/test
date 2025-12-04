import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Award, CheckCircle, Clock, XCircle } from "lucide-react";

type AssessmentSection = {
  id: string;
  questionText: string;
  maxMarks: number;
  markingOptions?: any[];
};

type SubmissionSectionMark = {
  id: string;
  submissionId: string;
  sectionId: string;
  marksAwarded: number;
  feedback: string | null;
  selectedOptionId: string | null;
};

type SubmissionGrade = {
  id: string;
  submissionId: string;
  totalMarksAwarded: number | null;
  finalGrade: string | null;
  percentageScore: number | null;
  gradeText: string | null;
  gradeNotes: string | null;
  overallSummary: string | null;
  gradedAt: Date | null;
};

type GradeBoundary = {
  id: string;
  assessmentId: string;
  grade: string;
  minPercentage: number;
  maxPercentage: number;
};

type ViewerSubmissionData = {
  submission: {
    id: string;
    submittedAt: Date;
    fileCount: number;
    totalFileSize: string | null;
    attemptNumber: number | null;
    fullName: string | null;
    email: string | null;
    customAssessmentCode: string | null;
  };
  markingStatus: string | null;
  assessment: {
    id: string;
    name: string;
    code: string;
    totalMarks: number;
  } | null;
  assessmentSections: AssessmentSection[];
  gradeBoundaries: GradeBoundary[];
  grade: SubmissionGrade | null;
  sectionMarks: SubmissionSectionMark[];
  files: {
    id: string;
    fileName: string;
    originalFileName: string;
    fileSize: string;
    fileType: string;
    uploadedAt: Date;
  }[];
};

function getStatusBadge(status: string | null) {
  const statusConfig = {
    waiting: { variant: "outline" as const, icon: Clock, label: "Waiting" },
    being_marked: { variant: "default" as const, icon: Clock, label: "Being Marked" },
    on_hold: { variant: "secondary" as const, icon: Clock, label: "On Hold" },
    approval_needed: { variant: "secondary" as const, icon: Clock, label: "Approval Needed" },
    marking_skipped: { variant: "destructive" as const, icon: XCircle, label: "Marking Skipped" },
    released: { variant: "default" as const, icon: CheckCircle, label: "Released" },
  };

  const config = status ? statusConfig[status as keyof typeof statusConfig] : null;
  const Icon = config?.icon || Clock;

  return (
    <Badge variant={config?.variant || "outline"} className="flex items-center gap-1">
      <Icon className="h-3 w-3" />
      {config?.label || "Unknown"}
    </Badge>
  );
}

export default function LtiViewerResults() {
  const [location] = useLocation();
  const params = new URLSearchParams(location.split('?')[1] || '');
  const token = params.get('token');
  const submissionId = params.get('submissionId');

  const { data, isLoading, error } = useQuery<ViewerSubmissionData>({
    queryKey: ['/api/lti/viewer/submission', submissionId, token],
    queryFn: async () => {
      if (!token || !submissionId) {
        throw new Error('Missing token or submission ID');
      }
      
      const response = await fetch(`/api/lti/viewer/submission/${submissionId}?token=${token}`);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to load submission results');
      }
      
      return response.json();
    },
    enabled: !!token && !!submissionId,
  });

  if (!token || !submissionId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              Invalid Access
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertDescription>
                Missing viewer token or submission ID. Please use the link provided by your instructor.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              Access Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertDescription>
                {error instanceof Error ? error.message : 'Failed to load submission results'}
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { submission, markingStatus, assessment, assessmentSections, gradeBoundaries, grade, sectionMarks, files } = data;
  const isReleased = markingStatus === 'released';

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <CardTitle className="text-2xl">Assignment Results</CardTitle>
                <CardDescription>
                  Submitted on {format(new Date(submission.submittedAt), 'PPP p')}
                </CardDescription>
              </div>
              {getStatusBadge(markingStatus)}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Student</p>
                <p className="font-medium" data-testid="text-student-name">{submission.fullName || 'N/A'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Email</p>
                <p className="font-medium" data-testid="text-student-email">{submission.email || 'N/A'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Assessment</p>
                <p className="font-medium" data-testid="text-assessment-name">{assessment?.name || submission.customAssessmentCode || 'N/A'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Attempt</p>
                <p className="font-medium" data-testid="text-attempt-number">{submission.attemptNumber || 'N/A'}</p>
              </div>
            </div>

            {/* Files submitted */}
            <div>
              <p className="text-sm text-muted-foreground mb-2">Files Submitted</p>
              <div className="space-y-2">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-2 p-2 bg-muted rounded-md"
                    data-testid={`file-${file.id}`}
                  >
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm flex-1">{file.originalFileName || file.fileName}</span>
                    <span className="text-xs text-muted-foreground">{file.fileSize}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results - only show if released */}
        {!isReleased && (
          <Alert>
            <Clock className="h-4 w-4" />
            <AlertDescription>
              Your submission is currently being marked. Results will be available once marking is complete and released.
            </AlertDescription>
          </Alert>
        )}

        {isReleased && grade && (
          <>
            {/* Overall Grade */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="h-5 w-5" />
                  Overall Grade
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-primary/5 rounded-lg">
                    <p className="text-sm text-muted-foreground mb-1">Grade</p>
                    <p className="text-3xl font-bold" data-testid="text-final-grade">
                      {grade.finalGrade || grade.gradeText || 'N/A'}
                    </p>
                  </div>
                  {assessment && grade.totalMarksAwarded !== null && (
                    <div className="p-4 bg-primary/5 rounded-lg">
                      <p className="text-sm text-muted-foreground mb-1">Score</p>
                      <p className="text-3xl font-bold" data-testid="text-total-marks">
                        {grade.totalMarksAwarded} / {assessment.totalMarks}
                      </p>
                      {grade.percentageScore !== null && (
                        <p className="text-sm text-muted-foreground mt-1" data-testid="text-percentage">
                          ({grade.percentageScore.toFixed(1)}%)
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {grade.overallSummary && (
                  <div>
                    <p className="text-sm font-medium mb-2">Overall Feedback</p>
                    <div className="p-4 bg-muted rounded-lg whitespace-pre-wrap" data-testid="text-overall-feedback">
                      {grade.overallSummary}
                    </div>
                  </div>
                )}

                {grade.gradeNotes && (
                  <div>
                    <p className="text-sm font-medium mb-2">Additional Notes</p>
                    <div className="p-4 bg-muted rounded-lg whitespace-pre-wrap" data-testid="text-grade-notes">
                      {grade.gradeNotes}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Question-by-Question Breakdown */}
            {assessmentSections.length > 0 && sectionMarks.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Question-by-Question Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {assessmentSections.map((section) => {
                      const mark = sectionMarks.find(m => m.sectionId === section.id);
                      if (!mark) return null;

                      return (
                        <div
                          key={section.id}
                          className="p-4 border rounded-lg space-y-3"
                          data-testid={`section-${section.id}`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className="font-medium">{section.questionText}</p>
                            </div>
                            <Badge variant="secondary" data-testid={`marks-${section.id}`}>
                              {mark.marksAwarded} / {section.maxMarks}
                            </Badge>
                          </div>

                          {mark.feedback && (
                            <div className="mt-2">
                              <p className="text-sm text-muted-foreground mb-1">Feedback:</p>
                              <div className="text-sm bg-muted p-3 rounded whitespace-pre-wrap" data-testid={`feedback-${section.id}`}>
                                {mark.feedback}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
