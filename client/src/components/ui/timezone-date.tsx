import React from 'react';
import { useTimezone } from '@/hooks/use-timezone';

interface TimezoneDateProps {
  date: Date | string | null;
  format?: string;
  relative?: boolean;
  className?: string;
  data-testid?: string;
}

/**
 * Component wrapper for formatting dates with timezone awareness
 */
export function TimezoneDate({ 
  date, 
  format, 
  relative = false,
  className,
  'data-testid': testId
}: TimezoneDateProps) {
  const { formatDate, formatRelative } = useTimezone();

  if (!date) {
    return (
      <span className={className} data-testid={testId}>
        N/A
      </span>
    );
  }

  const displayText = relative ? formatRelative(date) : formatDate(date, format);

  return (
    <span className={className} data-testid={testId}>
      {displayText}
    </span>
  );
}

interface TimezoneDateTimeProps {
  date: Date | string | null;
  showTimezone?: boolean;
  className?: string;
  'data-testid'?: string;
}

/**
 * Component wrapper for showing date and time with timezone info
 */
export function TimezoneDateTime({ 
  date,
  showTimezone = true,
  className,
  'data-testid': testId
}: TimezoneDateTimeProps) {
  const { formatDateTime } = useTimezone();

  if (!date) {
    return (
      <span className={className} data-testid={testId}>
        N/A
      </span>
    );
  }

  return (
    <span className={className} data-testid={testId}>
      {formatDateTime(date)}
    </span>
  );
}

interface TimezoneShortDateProps {
  date: Date | string | null;
  className?: string;
  'data-testid'?: string;
}

/**
 * Component wrapper for showing short date format
 */
export function TimezoneShortDate({ 
  date,
  className,
  'data-testid': testId
}: TimezoneShortDateProps) {
  const { formatShortDate } = useTimezone();

  if (!date) {
    return (
      <span className={className} data-testid={testId}>
        N/A
      </span>
    );
  }

  return (
    <span className={className} data-testid={testId}>
      {formatShortDate(date)}
    </span>
  );
}