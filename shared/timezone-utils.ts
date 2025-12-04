import { format, toZonedTime, fromZonedTime } from 'date-fns-tz';
import { parseISO } from 'date-fns';

/**
 * Timezone utilities for handling UTC storage and timezone-aware display
 * All dates are stored in UTC and converted to the user's timezone for display
 */

export interface TimezoneConfig {
  timezone: string; // e.g., 'Europe/London', 'America/New_York', 'UTC'
}

/**
 * Get the current system timezone from settings
 * This would be fetched from the system settings in a real implementation
 */
export async function getSystemTimezone(): Promise<string> {
  // In a real implementation, this would fetch from the system settings
  // For now, we'll default to UTC and the component will override with settings
  return 'UTC';
}

/**
 * Convert a UTC date to the specified timezone
 * @param utcDate - The UTC date to convert
 * @param timezone - Target timezone (e.g., 'Europe/London')
 * @returns Date object in the specified timezone
 */
export function convertUtcToTimezone(utcDate: Date | string, timezone: string): Date {
  const date = typeof utcDate === 'string' ? parseISO(utcDate) : utcDate;
  return toZonedTime(date, timezone);
}

/**
 * Convert a timezone-aware date to UTC for storage
 * @param zonedDate - The date in a specific timezone
 * @param timezone - The timezone of the input date
 * @returns UTC Date object
 */
export function convertTimezoneToUtc(zonedDate: Date, timezone: string): Date {
  return fromZonedTime(zonedDate, timezone);
}

/**
 * Format a UTC date in the specified timezone
 * @param utcDate - The UTC date to format
 * @param timezone - Target timezone for display
 * @param formatString - Format string (default: 'PPpp' for date and time)
 * @returns Formatted date string
 */
export function formatDateInTimezone(
  utcDate: Date | string | null,
  timezone: string,
  formatString: string = 'PPpp'
): string {
  if (!utcDate) return 'N/A';
  
  const date = typeof utcDate === 'string' ? parseISO(utcDate) : utcDate;
  const zonedDate = convertUtcToTimezone(date, timezone);
  
  return format(zonedDate, formatString, { timeZone: timezone });
}

/**
 * Format a UTC date as a short date in the specified timezone
 * @param utcDate - The UTC date to format
 * @param timezone - Target timezone for display
 * @returns Short formatted date string (e.g., "Dec 15, 2023")
 */
export function formatShortDateInTimezone(
  utcDate: Date | string | null,
  timezone: string
): string {
  return formatDateInTimezone(utcDate, timezone, 'MMM d, yyyy');
}

/**
 * Format a UTC date with date and time in the specified timezone
 * @param utcDate - The UTC date to format
 * @param timezone - Target timezone for display
 * @returns Formatted date and time string (e.g., "Dec 15, 2023 at 2:30 PM GMT")
 */
export function formatDateTimeInTimezone(
  utcDate: Date | string | null,
  timezone: string
): string {
  return formatDateInTimezone(utcDate, timezone, 'PPP \'at\' p zzz');
}

/**
 * Get the current UTC timestamp
 * @returns Current date in UTC
 */
export function getCurrentUtcDate(): Date {
  return new Date();
}

/**
 * Create a UTC date from timezone-specific input
 * @param year - Year
 * @param month - Month (0-11)
 * @param day - Day (1-31)
 * @param hour - Hour (0-23)
 * @param minute - Minute (0-59)
 * @param timezone - Source timezone
 * @returns UTC Date object
 */
export function createUtcDateFromTimezone(
  year: number,
  month: number,
  day: number,
  hour: number = 0,
  minute: number = 0,
  timezone: string = 'UTC'
): Date {
  const localDate = new Date(year, month, day, hour, minute);
  return convertTimezoneToUtc(localDate, timezone);
}

/**
 * Check if a date is in the past (compared to current UTC time)
 * @param date - Date to check
 * @returns true if the date is in the past
 */
export function isDateInPast(date: Date | string): boolean {
  const checkDate = typeof date === 'string' ? parseISO(date) : date;
  return checkDate < getCurrentUtcDate();
}

/**
 * Check if a date is in the future (compared to current UTC time)
 * @param date - Date to check
 * @returns true if the date is in the future
 */
export function isDateInFuture(date: Date | string): boolean {
  const checkDate = typeof date === 'string' ? parseISO(date) : date;
  return checkDate > getCurrentUtcDate();
}

/**
 * Get relative time description (e.g., "2 hours ago", "in 3 days")
 * @param utcDate - The UTC date to compare
 * @param timezone - Display timezone
 * @returns Relative time string
 */
export function getRelativeTime(utcDate: Date | string, timezone: string): string {
  const date = typeof utcDate === 'string' ? parseISO(utcDate) : utcDate;
  const now = getCurrentUtcDate();
  const diffMs = date.getTime() - now.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (Math.abs(diffMinutes) < 1) {
    return 'Just now';
  } else if (Math.abs(diffMinutes) < 60) {
    return diffMinutes < 0 ? `${Math.abs(diffMinutes)} minutes ago` : `In ${diffMinutes} minutes`;
  } else if (Math.abs(diffHours) < 24) {
    return diffHours < 0 ? `${Math.abs(diffHours)} hours ago` : `In ${diffHours} hours`;
  } else if (Math.abs(diffDays) < 7) {
    return diffDays < 0 ? `${Math.abs(diffDays)} days ago` : `In ${diffDays} days`;
  } else {
    return formatDateInTimezone(date, timezone, 'MMM d, yyyy');
  }
}

/**
 * Common timezone options for the system
 */
export const TIMEZONE_OPTIONS = [
  { value: 'UTC', label: 'UTC (GMT+0)', offset: '+00:00' },
  { value: 'Europe/London', label: 'BST/GMT (London)', offset: '+00:00/+01:00' },
  { value: 'Europe/Paris', label: 'CET (Paris)', offset: '+01:00/+02:00' },
  { value: 'America/New_York', label: 'EST (New York)', offset: '-05:00/-04:00' },
  { value: 'America/Los_Angeles', label: 'PST (Los Angeles)', offset: '-08:00/-07:00' },
  { value: 'America/Chicago', label: 'CST (Chicago)', offset: '-06:00/-05:00' },
  { value: 'Asia/Tokyo', label: 'JST (Tokyo)', offset: '+09:00' },
  { value: 'Asia/Shanghai', label: 'CST (Shanghai)', offset: '+08:00' },
  { value: 'Asia/Dubai', label: 'GST (Dubai)', offset: '+04:00' },
  { value: 'Australia/Sydney', label: 'AEST (Sydney)', offset: '+10:00/+11:00' },
] as const;