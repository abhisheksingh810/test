interface CachedSetting {
  value: string;
  expiry: number;
}

interface TurnitinSettings {
  apiKey: string;
  apiUrl: string;
  integrationName?: string;
  integrationVersion?: string;
}

class SettingsCache {
  private cache = new Map<string, CachedSetting>();
  private readonly TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

  private isExpired(setting: CachedSetting): boolean {
    return Date.now() > setting.expiry;
  }

  set(key: string, value: string): void {
    this.cache.set(key, {
      value,
      expiry: Date.now() + this.TTL
    });
  }

  get(key: string): string | null {
    const setting = this.cache.get(key);
    if (!setting || this.isExpired(setting)) {
      this.cache.delete(key);
      return null;
    }
    return setting.value;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  // Turnitin-specific methods for optimized access
  async getTurnitinSettings(storage: any): Promise<TurnitinSettings> {
    const cachedKeys = [
      'turnitin_api_key', 
      'turnitin_api_url', 
      'turnitin_integration_name',
      'turnitin_integration_version'
    ];
    const settings: Record<string, string> = {};
    const keysToFetch: string[] = [];

    // Check cache first
    for (const key of cachedKeys) {
      const cached = this.get(key);
      if (cached !== null) {
        settings[key] = cached;
      } else {
        keysToFetch.push(key);
      }
    }

    // Fetch missing keys from database
    if (keysToFetch.length > 0) {
      const dbSettings = await storage.getAllSystemSettings();
      for (const setting of dbSettings) {
        if (keysToFetch.includes(setting.key)) {
          settings[setting.key] = setting.value;
          this.set(setting.key, setting.value);
        }
      }
    }

    const turnitinSettings = {
      apiKey: settings.turnitin_api_key || '',
      apiUrl: settings.turnitin_api_url || 'https://app.turnitin.com',
      integrationName: settings.turnitin_integration_name || 'Avado E-Assessment Platform',
      integrationVersion: settings.turnitin_integration_version || '1.0.0',
    };
    
    console.log('📋 TurnItIn Settings Cache Result:', {
      hasApiKey: !!turnitinSettings.apiKey,
      apiKeyLength: turnitinSettings.apiKey?.length || 0,
      apiUrl: turnitinSettings.apiUrl,
      integrationName: turnitinSettings.integrationName,
      rawSettingsKeys: Object.keys(settings)
    });
    
    return turnitinSettings;
  }

  async refreshTurnitinSettings(storage: any): Promise<void> {
    const keys = [
      'turnitin_api_key', 
      'turnitin_api_url', 
      'turnitin_integration_name',
      'turnitin_integration_version'
    ];
    
    // Clear existing cache for these keys
    keys.forEach(key => this.delete(key));
    
    // Fetch fresh from database
    await this.getTurnitinSettings(storage);
  }
}

// Export singleton instance
export const settingsCache = new SettingsCache();
export type { TurnitinSettings };