import { useParams, Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eye, Search, ChevronLeft, ChevronRight } from "lucide-react";

type SubmissionGrade = {
  id: string;
  submissionId: string;
  finalGrade: string | null;
  percentageScore: number | null;
  gradeText: string | null;
  gradeNotes: string | null;
  gradedBy: string | null;
  gradedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type MalpracticeLevel = {
  id: string;
  levelCode: string;
  levelText: string;
  levelDescription: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type SkipReason = {
  id: string;
  reasonCode: string;
  reasonText: string;
  reasonDescription: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type SubmissionMarkingAssignment = {
  id: string;
  submissionId: string;
  assignedMarkerId: string | null;
  markingStatus: string;
  assignedAt: Date | null;
  statusUpdatedAt: Date | null;
  statusUpdatedBy: string | null;
  notes: string | null;
  holdReason: string | null;
  priority: string | null;
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type AssignmentSubmission = {
  id: string;
  ltiLaunchId: string;
  fileCount: number;
  totalFileSize: string | null;
  submittedAt: Date;
  attemptNumber: number | null;
  lmsUserId: string | null;
  consumerName: string | null;
  role: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  email: string | null;
  customInstructionSet: string | null;
  customAssessmentCode: string | null;
  customAction: string | null;
  contextType: string | null;
  contextTitle: string | null;
  contextId: string | null;
  createdAt: Date;
  updatedAt: Date;
  markingAssignment?: SubmissionMarkingAssignment | null;
  grade?: SubmissionGrade | null;
  malpracticeLevel?: MalpracticeLevel | null;
  skipReason?: SkipReason | null;
  viewerToken?: string;
  viewerUrl?: string;
};

type LtiSessionRecord = {
  id: string;
  launchId: string;
  lmsUserId: string | null;
  consumerName: string | null;
  role: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  email: string | null;
  customAction: string | null;
  customInstructionSet: string | null;
  customAssessmentCode: string | null;
  contextType: string | null;
  contextTitle: string | null;
  resourceLinkId: string | null;
  resourceLinkTitle: string | null;
  contextId: string | null;
  consumerKey: string | null;
  toolConsumerInstanceGuid: string | null;
  returnUrl: string | null;
  hasFileSubmission: string | null;
  sessionExpiry: Date;
  createdAt: Date;
};

type PaginationInfo = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export default function LtiResults() {
  const { launchId } = useParams<{ launchId: string }>();
  const [location, setLocation] = useLocation();
  
  // Get current URL search params
  const urlParams = new URLSearchParams(window.location.search);
  const initialPage = parseInt(urlParams.get("page") || "1", 10);
  const initialLimit = parseInt(urlParams.get("limit") || "10", 10);
  const initialSearch = urlParams.get("search") || "";
  
  // State for pagination and search (initialized from URL)
  const [page, setPage] = useState(initialPage);
  const [limit, setLimit] = useState(initialLimit);
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);

  // Update URL when state changes
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("page", page.toString());
    params.set("limit", limit.toString());
    if (debouncedSearch) {
      params.set("search", debouncedSearch);
    }
    
    // Update URL without triggering navigation
    const newUrl = `${location.split('?')[0]}?${params.toString()}`;
    window.history.replaceState({}, "", newUrl);
  }, [page, limit, debouncedSearch, location]);

  // Handle limit change
  const handleLimitChange = (newLimit: string) => {
    setLimit(parseInt(newLimit, 10));
    setPage(1); // Reset to first page when changing limit
  };

  // Debounce search input (500ms delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1); // Reset to first page on new search
    }, 500);

    return () => clearTimeout(timer);
  }, [searchInput]);

  // Build query parameters
  const queryParams = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
  });
  
  if (debouncedSearch) {
    queryParams.set('search', debouncedSearch);
  }

  const { data, isLoading, error } = useQuery<{
    success: boolean;
    submissions: AssignmentSubmission[];
    sessionRecord: LtiSessionRecord;
    pagination: PaginationInfo;
  }>({
    queryKey: ["/api/lti/results", launchId, page, limit, debouncedSearch],
    queryFn: async () => {
      const response = await fetch(`/api/lti/results/${launchId}?${queryParams.toString()}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to load results");
      }
      return response.json();
    },
    enabled: !!launchId,
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "waiting":
        return <Badge variant="secondary">Waiting</Badge>;
      case "being_marked":
        return <Badge className="bg-blue-500">Being Marked</Badge>;
      case "on_hold":
        return <Badge variant="outline">On Hold</Badge>;
      case "approval_needed":
        return <Badge className="bg-orange-500">Approval Needed</Badge>;
      case "marking_skipped":
        return <Badge variant="outline">Marking Skipped</Badge>;
      case "released":
        return <Badge className="bg-green-500">Released</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="w-full p-6">
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="pt-6">
                <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error || !data?.success) {
    return (
      <div className="w-full p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-red-600">Error</CardTitle>
            <CardDescription>
              {error instanceof Error
                ? error.message
                : "Failed to load submission results"}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const { submissions, sessionRecord, pagination } = data;

  return (
    <div className="w-full p-6" data-testid="lti-results-page">
      <div className="mb-6">
        <h1
          className="text-3xl font-bold text-gray-900 mb-2"
          data-testid="page-title"
        >
          All Submission Results
        </h1>
        <p className="text-gray-600">
          Viewing all submissions across all courses and assessments for {sessionRecord.fullName || sessionRecord.email}
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle>Your Submissions</CardTitle>
              <CardDescription>
                {pagination.total} submission{pagination.total !== 1 ? "s" : ""}{" "}
                found
              </CardDescription>
            </div>
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search by course name..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-10"
                data-testid="input-search-course"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {submissions.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-gray-500" data-testid="no-submissions">
                {searchInput ? "No submissions found matching your search." : "No submissions found."}
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Submitted Time</TableHead>
                    <TableHead>Course</TableHead>
                    <TableHead>Assessment</TableHead>
                    <TableHead>Attempt</TableHead>
                    <TableHead>Malpractice</TableHead>
                    <TableHead>Skipped Reason</TableHead>
                    <TableHead>Overall Grade</TableHead>
                    <TableHead>Marking Status</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {submissions.map((submission) => {
                    return (
                      <TableRow
                        key={submission.id}
                        data-testid={`submission-${submission.id}`}
                      >
                        <TableCell>
                          <div className="text-sm">
                            {format(
                              new Date(submission.submittedAt),
                              "MMM d, yyyy"
                            )}
                          </div>
                          <div className="text-xs text-gray-500">
                            {format(new Date(submission.submittedAt), "h:mm a")}
                          </div>
                        </TableCell>

                        <TableCell>
                          <div className="text-sm font-medium">
                            {submission.contextTitle || "N/A"}
                          </div>
                        </TableCell>

                        <TableCell>
                          <div className="font-medium">
                            {submission.customAssessmentCode || "N/A"}
                          </div>
                        </TableCell>

                        <TableCell>
                          <div
                            className="text-sm font-medium"
                            data-testid={`attempt-number-${submission.id}`}
                          >
                            {submission.markingAssignment?.markingStatus === "marking_skipped"
                              ? "-"
                              : submission.attemptNumber
                              ? `${submission.attemptNumber}/3`
                              : "N/A"}
                          </div>
                        </TableCell>

                        <TableCell data-testid={`malpractice-${submission.id}`}>
                          <div className="text-sm">
                            {submission.malpracticeLevel?.levelText || "-"}
                          </div>
                        </TableCell>

                        <TableCell
                          data-testid={`skipped-reason-${submission.id}`}
                        >
                          <div className="text-sm">
                            {submission.skipReason?.reasonText || "-"}
                          </div>
                        </TableCell>

                        <TableCell data-testid={`overall-grade-${submission.id}`}>
                          <div className="text-sm font-medium">
                            {submission.grade?.finalGrade || "-"}
                          </div>
                          {submission.grade?.percentageScore != null && (
                            <div className="text-xs text-gray-500">
                              {submission.grade.percentageScore.toFixed(1)}%
                            </div>
                          )}
                        </TableCell>

                        <TableCell>
                          {submission.markingAssignment?.markingStatus
                            ? getStatusBadge(submission.markingAssignment.markingStatus)
                            : <Badge variant="outline">Not Assigned</Badge>}
                        </TableCell>

                        <TableCell>
                          <Link href={(() => {
                            // Build return params to preserve pagination and filters
                            const returnParams = new URLSearchParams();
                            returnParams.set("page", page.toString());
                            returnParams.set("limit", limit.toString());
                            if (debouncedSearch) {
                              returnParams.set("search", debouncedSearch);
                            }
                            
                            // Add return params to viewerUrl or fallback URL
                            const baseUrl = submission.viewerUrl || `/lti/submission/${submission.id}?launchId=${launchId}`;
                            const separator = baseUrl.includes('?') ? '&' : '?';
                            return `${baseUrl}${separator}${returnParams.toString()}`;
                          })()}>
                            <Button 
                              variant="outline" 
                              size="sm"
                              data-testid={`button-view-submission-${submission.id}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Pagination Controls */}
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 px-6 py-4 border-t">
                <div className="flex items-center gap-4">
                  <div className="text-sm text-gray-700">
                    Showing {submissions.length > 0 ? (pagination.page - 1) * pagination.limit + 1 : 0} to{" "}
                    {Math.min(pagination.page * pagination.limit, pagination.total)} of{" "}
                    {pagination.total} results
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-700">Per page:</span>
                    <Select
                      value={limit.toString()}
                      onValueChange={handleLimitChange}
                    >
                      <SelectTrigger className="w-20" data-testid="select-items-per-page">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5</SelectItem>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="20">20</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {pagination.totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page - 1)}
                      disabled={page === 1}
                      data-testid="button-prev-page"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <div className="text-sm text-gray-700">
                      Page {pagination.page} of {pagination.totalPages}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page + 1)}
                      disabled={page >= pagination.totalPages}
                      data-testid="button-next-page"
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
