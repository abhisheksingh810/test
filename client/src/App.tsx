import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { Navbar } from "@/components/ui/navbar";
import Home from "@/pages/home";
import Profile from "@/pages/profile";
import Marking from "@/pages/marking";
import SubmissionDetails from "@/pages/submission-details";
import SystemSettings from "@/pages/system-settings";
import InstructionSets from "@/pages/instruction-sets";
import LtiAssignmentSteps from "@/pages/lti-assignment-steps";
import LtiResults from "@/pages/lti-results";
import LtiViewerResults from "@/pages/lti-viewer-results";
import LtiLearnerSubmission from "@/pages/lti-learner-submission";
import LtiDemo from "@/pages/lti-demo";
import Login from "@/pages/login";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import NotFound from "@/pages/not-found";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <Switch>
      {/* LTI routes - don't require authentication */}
      <Route path="/lti/assignment/:launchId" component={LtiAssignmentSteps} />
      <Route path="/lti/results/:launchId" component={LtiResults} />
      <Route path="/lti/results" component={LtiViewerResults} />
      <Route path="/lti/submission/:id" component={LtiLearnerSubmission} />
      
      {/* Public routes */}
      <Route path="/login" component={Login} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route>
        {() => {
          if (!isAuthenticated) {
            return <Login />;
          }
          
          return (
            <div className="min-h-screen bg-gray-50">
              <Navbar />
              <Switch>
                <Route path="/" component={Home} />
                <Route path="/profile" component={Profile} />
                <Route path="/marking" component={Marking} />
                <Route path="/submissions/:id" component={SubmissionDetails} />
                <Route path="/settings" component={SystemSettings} />
                <Route path="/instruction-sets" component={InstructionSets} />
                <Route path="/lti-demo" component={LtiDemo} />
                <Route component={NotFound} />
              </Switch>
            </div>
          );
        }}
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
