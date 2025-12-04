import { settingsCache, TurnitinSettings } from './settingsCache';

// TCA API interfaces based on official documentation
interface TCASubmissionRequest {
  owner: string;
  title: string;
  submitter?: string;
  owner_default_permission_set: string;
  submitter_default_permission_set?: string;
  extract_text_only?: boolean;
  eula?: {
    accepted_timestamp: string;
    language: string;
    version: string;
  };
  metadata: {
    owners: Array<{
      id: string;
      given_name: string;
      family_name: string;
      email: string;
    }>;
    submitter?: {
      id: string;
      given_name: string;
      family_name: string;
      email: string;
    };
    group?: {
      id: string;
      name: string;
      type: string;
    };
    group_context?: {
      id: string;
      name: string;
      owners: Array<{
        id: string;
        given_name: string;
        family_name: string;
        email: string;
      }>;
    };
    original_submitted_time?: string;
    custom?: string;
  };
}

interface TCASubmissionResponse {
  id: string;
  owner: string;
  title: string;
  status: 'CREATED' | 'PROCESSING' | 'COMPLETE' | 'ERROR';
  content_type?: string;
  page_count?: number;
  word_count?: number;
  character_count?: number;
  created_time: string;
  error_code?: string;
  capabilities?: string[];
}

interface TCASimilarityResponse {
  submission_id: string;
  overall_match_percentage?: number;
  internet_match_percentage?: number;
  publication_match_percentage?: number;
  submitted_works_match_percentage?: number;
  status: 'PROCESSING' | 'COMPLETE';
  time_requested?: string;
  time_generated?: string;
  top_source_largest_matched_word_count?: number;
  top_matches?: Array<{
    percentage: number;
    submission_id?: string;
    source_type: string;
    matched_word_count_total: number;
    submitted_date?: string;
    institution_name?: string;
    name: string;
  }>;
}

interface TCAViewerResponse {
  viewer_url: string;
}

interface TCAPdfResponse {
  pdf_id: string;
  status: 'PROCESSING' | 'COMPLETE';
  requested_timestamp?: string;
  generated_timestamp?: string;
}

interface TCAPdfStatusResponse {
  pdf_id: string;
  status: 'PROCESSING' | 'COMPLETE';
  requested_timestamp?: string;
  generated_timestamp?: string;
}

interface TCAEulaVersionResponse {
  version: string;
  valid_from: string;
  valid_until?: string;
  url: string;
  available_languages: string[];
}

interface TCAEulaAcceptanceResponse {
  accepted_timestamp: string;
  version: string;
  user_id: string;
  language: string;
}

interface TurnitinErrorResponse {
  message: string;
  details?: any;
}

class TurnitinService {
  private async makeRequest<T>(
    settings: TurnitinSettings,
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: any,
    isFileUpload: boolean = false
  ): Promise<T> {
    console.log(`🔧 TurnItIn Settings Check:`, {
      hasApiKey: !!settings.apiKey,
      apiKeyLength: settings.apiKey?.length || 0,
      apiUrl: settings.apiUrl,
      integrationName: settings.integrationName,
      integrationVersion: settings.integrationVersion
    });
    
    if (!settings.apiKey) {
      throw new Error('Turnitin API key not configured');
    }

    // Use TCA API endpoint format (apiUrl already includes /api/v1)
    const url = `${settings.apiUrl}${endpoint}`;
    
    console.log(`🔍 TurnItIn API Request: ${method} ${url}`);
    console.log(`🔑 API Key length: ${settings.apiKey?.length || 0} characters`);
    console.log(`🔑 API Key first 10 chars: ${settings.apiKey?.substring(0, 10) || 'undefined'}...`);
    
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${settings.apiKey?.trim()}`,
      // Required TCA metadata headers
      'X-Turnitin-Integration-Name': settings.integrationName || 'Avado Assessment Platform',
      'X-Turnitin-Integration-Version': settings.integrationVersion || '1.0.0',
    };

    if (!isFileUpload) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      method,
      headers,
      body: isFileUpload ? body : (body ? JSON.stringify(body) : undefined),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`❌ TurnItIn API Error ${response.status} for ${method} ${url}:`);
      console.log(`Response: ${errorText}`);
      console.log(`Request body:`, body ? JSON.stringify(body, null, 2) : 'none');
      
      let errorData: TurnitinErrorResponse;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText || `HTTP ${response.status}` };
      }
      throw new Error(`TCA API error (${response.status}): ${errorData.message}`);
    }

    return response.json();
  }

  // Create a submission using TCA API
  async createSubmission(
    storage: any,
    submissionData: {
      submitterEmail: string;
      submitterFirstName?: string;
      submitterLastName?: string;
      title: string;
      groupId?: string;
      groupName?: string;
      contextId?: string;
      contextName?: string;
      eulaAcceptance?: {
        accepted_timestamp: string;
        language: string;
        version: string;
      };
    }
  ): Promise<TCASubmissionResponse> {
    const settings = await settingsCache.getTurnitinSettings(storage);
    
    const submitterId = submissionData.submitterEmail.replace('@', '_').replace('.', '_');
    
    const requestBody: TCASubmissionRequest = {
      owner: submitterId,
      title: submissionData.title,
      submitter: submitterId,
      owner_default_permission_set: 'INSTRUCTOR',
      submitter_default_permission_set: 'INSTRUCTOR',
      extract_text_only: false,
      eula: submissionData.eulaAcceptance,
      metadata: {
        owners: [{
          id: submitterId,
          given_name: submissionData.submitterFirstName || 'Student',
          family_name: submissionData.submitterLastName || 'User',
          email: submissionData.submitterEmail
        }],
        submitter: {
          id: submitterId,
          given_name: submissionData.submitterFirstName || 'Student',
          family_name: submissionData.submitterLastName || 'User',
          email: submissionData.submitterEmail
        },
        group: submissionData.groupId ? {
          id: submissionData.groupId,
          name: submissionData.groupName || 'Assignment',
          type: 'ASSIGNMENT'
        } : undefined,
        group_context: submissionData.contextId ? {
          id: submissionData.contextId,
          name: submissionData.contextName || 'Course',
          owners: [{
            id: submitterId,
            given_name: submissionData.submitterFirstName || 'Student',
            family_name: submissionData.submitterLastName || 'User',
            email: submissionData.submitterEmail
          }]
        } : undefined,
        original_submitted_time: new Date().toISOString()
      }
    };

    return this.makeRequest<TCASubmissionResponse>(
      settings,
      '/submissions',
      'POST',
      requestBody
    );
  }

  // Upload file contents to existing submission
  async uploadSubmissionFile(
    storage: any,
    submissionId: string,
    fileBuffer: Buffer,
    fileName: string
  ): Promise<void> {
    const settings = await settingsCache.getTurnitinSettings(storage);
    
    const encodedFileName = encodeURIComponent(fileName);
    
    // Use consistent URL construction like makeRequest method
    const url = `${settings.apiUrl}/submissions/${submissionId}/original`;
    
    console.log(`🔍 TurnItIn File Upload: PUT ${url}`);
    console.log(`📁 File: ${fileName} (${fileBuffer.length} bytes)`);
    
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${settings.apiKey}`,
      'X-Turnitin-Integration-Name': settings.integrationName || 'Avado E-Assessment Platform',
      'X-Turnitin-Integration-Version': settings.integrationVersion || '1.0.0',
      'Content-Type': 'binary/octet-stream',
      'Content-Disposition': `inline; filename="${encodedFileName}"`
    };
    
    const response = await fetch(url, {
      method: 'PUT',
      headers,
      body: fileBuffer,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`❌ TurnItIn File Upload Error ${response.status} for PUT ${url}:`);
      console.log(`Response: ${errorText}`);
      throw new Error(`TCA file upload error (${response.status}): ${errorText}`);
    }
    
    console.log(`✅ TurnItIn file upload successful: ${fileName}`);
  }

  // Generate similarity report
  async generateSimilarityReport(
    storage: any,
    submissionId: string,
    options?: {
      addToIndex?: boolean;
      searchRepositories?: string[];
      priority?: 'HIGH' | 'LOW';
    }
  ): Promise<void> {
    const settings = await settingsCache.getTurnitinSettings(storage);

    const requestBody = {
      indexing_settings: {
        add_to_index: options?.addToIndex ?? true
      },
      generation_settings: {
        search_repositories: options?.searchRepositories || [
          'INTERNET', 
          'SUBMITTED_WORK', 
          'PUBLICATION', 
          'CROSSREF'
        ],
        auto_exclude_self_matching_scope: 'ALL',
        priority: options?.priority || 'HIGH'
      },
      view_settings: {
        exclude_quotes: false,
        exclude_bibliography: false,
        exclude_citations: false,
        exclude_abstract: false,
        exclude_methods: false,
        exclude_custom_sections: false,
        exclude_preprints: false,
        exclude_small_matches: 8,
        exclude_internet: false,
        exclude_publications: false,
        exclude_crossref: false,
        exclude_submitted_works: false
      }
    };

    return this.makeRequest<void>(
      settings,
      `/submissions/${submissionId}/similarity`,
      'PUT',
      requestBody
    );
  }

  // Get similarity report info
  async getSimilarityReportInfo(
    storage: any,
    submissionId: string
  ): Promise<TCASimilarityResponse> {
    const settings = await settingsCache.getTurnitinSettings(storage);

    return this.makeRequest<TCASimilarityResponse>(
      settings,
      `/submissions/${submissionId}/similarity`,
      'GET'
    );
  }





  // Create viewer launch URL
  async createViewerUrl(
    storage: any,
    submissionId: string,
    viewerData: {
      userId: string;
      locale?: string;
      permissionSet?: string;
      eulaAcceptance?: {
        accepted_timestamp: string;
        language: string;
        version: string;
      };
    }
  ): Promise<TCAViewerResponse> {
    const settings = await settingsCache.getTurnitinSettings(storage);

    const requestBody = {
      viewer_user_id: viewerData.userId,
      locale: viewerData.locale || 'en-US',
      viewer_default_permission_set: viewerData.permissionSet || 'INSTRUCTOR',
      eula: viewerData.eulaAcceptance,
      sidebar: {
        default_mode: 'similarity'
      },
      similarity: {
        default_mode: 'match_overview',
        modes: {
          match_overview: true,
          all_sources: true
        },
        view_settings: {
          save_changes: false
        }
      }
    };

    return this.makeRequest<TCAViewerResponse>(
      settings,
      `/submissions/${submissionId}/viewer-url`,
      'POST',
      requestBody
    );
  }

  // Get submission info
  async getSubmissionInfo(
    storage: any,
    submissionId: string
  ): Promise<TCASubmissionResponse> {
    const settings = await settingsCache.getTurnitinSettings(storage);

    return this.makeRequest<TCASubmissionResponse>(
      settings,
      `/submissions/${submissionId}`,
      'GET'
    );
  }

  // Get features enabled (including EULA requirements)
  async getFeatures(storage: any): Promise<any> {
    const settings = await settingsCache.getTurnitinSettings(storage);
    
    return this.makeRequest<any>(
      settings,
      '/features-enabled',
      'GET'
    );
  }

  // Helper method to ensure EULA acceptance for a user
  async ensureEulaAcceptance(
    storage: any,
    userId: string,
    userEmail: string,
    language: string = 'en-US'
  ): Promise<{ version: string; accepted_timestamp: string; language: string }> {
    try {
      // First check if EULA is required
      const features = await this.getFeatures(storage);
      if (!features?.tenant?.require_eula) {
        // EULA not required, return dummy data
        return {
          version: 'not-required',
          accepted_timestamp: new Date().toISOString(),
          language: language
        };
      }

      // Get latest EULA version
      const eulaVersion = await this.getEulaVersion(storage, 'latest', language);
      
      try {
        // Check if user has already accepted this EULA version
        const acceptances = await this.getEulaAcceptance(storage, eulaVersion.version, userId);
        const hasAccepted = acceptances.some(acceptance => 
          acceptance.language === language || acceptance.language === 'en-US'
        );
        
        if (hasAccepted) {
          const existingAcceptance = acceptances.find(a => a.language === language) || acceptances[0];
          return {
            version: existingAcceptance.version,
            accepted_timestamp: existingAcceptance.accepted_timestamp,
            language: existingAcceptance.language
          };
        }
      } catch (error) {
        // User hasn't accepted EULA yet (404 expected)
        console.log(`📋 User ${userId} hasn't accepted EULA yet, auto-accepting...`);
      }

      // Auto-accept EULA for the user
      const acceptedTimestamp = new Date().toISOString();
      const acceptance = await this.acceptEulaVersion(storage, eulaVersion.version, {
        userId: userId,
        acceptedTimestamp: acceptedTimestamp,
        language: language
      });

      console.log(`✅ EULA auto-accepted for user ${userEmail}: ${acceptance.version}`);
      
      return {
        version: acceptance.version,
        accepted_timestamp: acceptance.accepted_timestamp,
        language: acceptance.language
      };

    } catch (error) {
      console.error(`❌ EULA handling failed for user ${userEmail}:`, error);
      // Return a fallback acceptance to prevent blocking submission
      return {
        version: 'v1beta', // Common default version
        accepted_timestamp: new Date().toISOString(),
        language: language
      };
    }
  }

  // EULA Management Methods
  
  // Get EULA version information
  async getEulaVersion(
    storage: any,
    versionId: string = 'latest',
    language?: string
  ): Promise<TCAEulaVersionResponse> {
    const settings = await settingsCache.getTurnitinSettings(storage);
    const endpoint = `/eula/${versionId}${language ? `?lang=${language}` : ''}`;
    
    return this.makeRequest<TCAEulaVersionResponse>(
      settings,
      endpoint,
      'GET'
    );
  }

  // Accept EULA version for a user
  async acceptEulaVersion(
    storage: any,
    versionId: string,
    acceptanceData: {
      userId: string;
      acceptedTimestamp: string;
      language: string;
    }
  ): Promise<TCAEulaAcceptanceResponse> {
    const settings = await settingsCache.getTurnitinSettings(storage);
    
    const requestBody = {
      user_id: acceptanceData.userId,
      accepted_timestamp: acceptanceData.acceptedTimestamp,
      language: acceptanceData.language
    };

    return this.makeRequest<TCAEulaAcceptanceResponse>(
      settings,
      `/eula/${versionId}/accept`,
      'POST',
      requestBody
    );
  }

  // Check EULA acceptance for a user
  async getEulaAcceptance(
    storage: any,
    versionId: string,
    userId: string
  ): Promise<TCAEulaAcceptanceResponse[]> {
    const settings = await settingsCache.getTurnitinSettings(storage);
    
    return this.makeRequest<TCAEulaAcceptanceResponse[]>(
      settings,
      `/eula/${versionId}/accept/${userId}`,
      'GET'
    );
  }

  // Get EULA page content
  async getEulaPage(
    storage: any,
    versionId: string,
    language: string = 'en-US'
  ): Promise<string> {
    const settings = await settingsCache.getTurnitinSettings(storage);
    const endpoint = `/eula/${versionId}/view?lang=${language}`;
    
    const url = `${settings.apiUrl}/api/v1${endpoint}`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${settings.apiKey}`,
      'X-Turnitin-Integration-Name': settings.integrationName || 'Avado E-Assessment Platform',
      'X-Turnitin-Integration-Version': settings.integrationVersion || '1.0.0',
    };

    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`TCA EULA page error (${response.status}): ${errorText}`);
    }

    return response.text(); // Returns HTML content
  }

  // Generate similarity report PDF
  async generateSimilarityReportPdf(
    storage: any,
    submissionId: string
  ): Promise<TCAPdfResponse> {
    const settings = await settingsCache.getTurnitinSettings(storage);
    
    return this.makeRequest<TCAPdfResponse>(
      settings,
      `/submissions/${submissionId}/similarity/pdf`,
      'POST'
    );
  }

  // Get PDF generation status
  async getPdfStatus(
    storage: any,
    submissionId: string,
    pdfId: string
  ): Promise<TCAPdfStatusResponse> {
    const settings = await settingsCache.getTurnitinSettings(storage);
    
    return this.makeRequest<TCAPdfStatusResponse>(
      settings,
      `/submissions/${submissionId}/similarity/pdf/${pdfId}`,
      'GET'
    );
  }

  // Download similarity report PDF
  async downloadSimilarityReportPdf(
    storage: any,
    submissionId: string,
    pdfId: string
  ): Promise<Buffer> {
    const settings = await settingsCache.getTurnitinSettings(storage);
    
    if (!settings.apiKey) {
      throw new Error('Turnitin API key not configured');
    }

    const url = `${settings.apiUrl}/submissions/${submissionId}/similarity/pdf/${pdfId}/content`;
    
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${settings.apiKey.trim()}`,
      'X-Turnitin-Integration-Name': settings.integrationName || 'Avado E-Assessment Platform',
      'X-Turnitin-Integration-Version': settings.integrationVersion || '1.0.0',
    };

    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`❌ TurnItIn PDF Download Error ${response.status} for GET ${url}:`);
      console.log(`Response: ${errorText}`);
      throw new Error(`TCA PDF download error (${response.status}): ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}

export const turnitinService = new TurnitinService();
export type { 
  TCASubmissionResponse, 
  TCASimilarityResponse, 
  TCAViewerResponse,
  TCAEulaVersionResponse,
  TCAEulaAcceptanceResponse,
  TCAPdfResponse,
  TCAPdfStatusResponse 
};