import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  formatDateInTimezone,
  formatShortDateInTimezone,
  formatDateTimeInTimezone,
  getRelativeTime,
  convertUtcToTimezone,
  convertTimezoneToUtc,
  getCurrentUtcDate,
  TIMEZONE_OPTIONS
} from '../../../shared/timezone-utils';

/**
 * Hook for timezone-aware date formatting and conversion
 * Automatically uses the system's default timezone setting
 */
export function useTimezone() {
  const [timezone, setTimezone] = useState<string>('UTC');

  // Fetch system settings to get the default timezone
  const { data: settings } = useQuery({
    queryKey: ['/api/settings'],
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Update timezone when settings are loaded
  useEffect(() => {
    if (settings && Array.isArray(settings)) {
      const timezoneSettings = settings.find((setting: any) => setting.key === 'timezone');
      if (timezoneSettings?.value) {
        setTimezone(timezoneSettings.value);
      }
    }
  }, [settings]);

  const formatDate = useCallback((date: Date | string | null, format?: string) => {
    return formatDateInTimezone(date, timezone, format);
  }, [timezone]);

  const formatShortDate = useCallback((date: Date | string | null) => {
    return formatShortDateInTimezone(date, timezone);
  }, [timezone]);

  const formatDateTime = useCallback((date: Date | string | null) => {
    return formatDateTimeInTimezone(date, timezone);
  }, [timezone]);

  const formatRelative = useCallback((date: Date | string) => {
    return getRelativeTime(date, timezone);
  }, [timezone]);

  const toTimezone = useCallback((utcDate: Date | string) => {
    return convertUtcToTimezone(utcDate, timezone);
  }, [timezone]);

  const toUtc = useCallback((zonedDate: Date) => {
    return convertTimezoneToUtc(zonedDate, timezone);
  }, [timezone]);

  const getCurrentDate = useCallback(() => {
    return getCurrentUtcDate();
  }, []);

  const getCurrentInTimezone = useCallback(() => {
    return convertUtcToTimezone(getCurrentUtcDate(), timezone);
  }, [timezone]);

  return {
    timezone,
    setTimezone,
    formatDate,
    formatShortDate,
    formatDateTime,
    formatRelative,
    toTimezone,
    toUtc,
    getCurrentDate,
    getCurrentInTimezone,
    timezoneOptions: TIMEZONE_OPTIONS,
  };
}

/**
 * Utility function to format date for components
 */
export function formatDateForDisplay(date: Date | string | null, timezone: string, format?: string): string {
  if (!date) return 'N/A';
  return formatDateInTimezone(date, timezone, format);
}

/**
 * Utility function to format relative time for components
 */
export function formatRelativeTimeForDisplay(date: Date | string, timezone: string): string {
  return getRelativeTime(date, timezone);
}