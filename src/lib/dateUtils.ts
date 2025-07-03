import { format, formatDistance, formatRelative, isValid, parse } from 'date-fns';
import * as dateFnsTz from 'date-fns-tz';

// Default date format
const DEFAULT_DATE_FORMAT = 'yyyy-MM-dd';
const DEFAULT_TIME_FORMAT = 'HH:mm:ss';
const DEFAULT_DATETIME_FORMAT = 'yyyy-MM-dd HH:mm:ss';

// Get user's timezone
const getUserTimezone = (): string => {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
};

/**
 * Format a date using a consistent format
 */
export const formatDate = (
  date: Date | string | number,
  formatStr: string = DEFAULT_DATE_FORMAT,
  options?: {
    timezone?: string;
  }
): string => {
  if (!date) return '';
  
  try {
    const dateObj = typeof date === 'string' || typeof date === 'number' 
      ? new Date(date) 
      : date;
    
    if (!isValid(dateObj)) {
      console.warn('Invalid date:', date);
      return 'Invalid date';
    }
    
    if (options?.timezone) {
      const zonedDate = dateFnsTz.utcToZonedTime(dateObj, options.timezone);
      return dateFnsTz.format(zonedDate, formatStr, { timeZone: options.timezone });
    }
    
    return format(dateObj, formatStr);
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Error';
  }
};

/**
 * Format a time using a consistent format
 */
export const formatTime = (
  date: Date | string | number,
  formatStr: string = DEFAULT_TIME_FORMAT,
  options?: {
    timezone?: string;
  }
): string => {
  return formatDate(date, formatStr, options);
};

/**
 * Format a datetime using a consistent format
 */
export const formatDateTime = (
  date: Date | string | number,
  formatStr: string = DEFAULT_DATETIME_FORMAT,
  options?: {
    timezone?: string;
  }
): string => {
  return formatDate(date, formatStr, options);
};

/**
 * Format a relative time (e.g., "5 minutes ago")
 */
export const formatRelativeTime = (
  date: Date | string | number,
  baseDate: Date = new Date()
): string => {
  if (!date) return '';
  
  try {
    const dateObj = typeof date === 'string' || typeof date === 'number' 
      ? new Date(date) 
      : date;
    
    if (!isValid(dateObj)) {
      console.warn('Invalid date:', date);
      return 'Invalid date';
    }
    
    return formatDistance(dateObj, baseDate, { addSuffix: true });
  } catch (error) {
    console.error('Error formatting relative time:', error);
    return 'Error';
  }
};

/**
 * Parse a date string using a specific format
 */
export const parseDate = (
  dateStr: string,
  formatStr: string = DEFAULT_DATE_FORMAT
): Date => {
  try {
    const parsedDate = parse(dateStr, formatStr, new Date());
    
    if (!isValid(parsedDate)) {
      throw new Error('Invalid date');
    }
    
    return parsedDate;
  } catch (error) {
    console.error('Error parsing date:', error);
    throw error;
  }
};

/**
 * Convert a date to UTC
 */
export const toUTC = (
  date: Date | string | number,
  timezone: string = getUserTimezone()
): Date => {
  try {
    const dateObj = typeof date === 'string' || typeof date === 'number' 
      ? new Date(date) 
      : date;
    
    if (!isValid(dateObj)) {
      throw new Error('Invalid date');
    }
    
    return dateFnsTz.zonedTimeToUtc(dateObj, timezone);
  } catch (error) {
    console.error('Error converting to UTC:', error);
    throw error;
  }
};

/**
 * Convert a UTC date to local timezone
 */
export const fromUTC = (
  date: Date | string | number,
  timezone: string = getUserTimezone()
): Date => {
  try {
    const dateObj = typeof date === 'string' || typeof date === 'number' 
      ? new Date(date) 
      : date;
    
    if (!isValid(dateObj)) {
      throw new Error('Invalid date');
    }
    
    return dateFnsTz.utcToZonedTime(dateObj, timezone);
  } catch (error) {
    console.error('Error converting from UTC:', error);
    throw error;
  }
};

/**
 * Format a duration in seconds to a human-readable string
 */
export const formatDuration = (seconds: number): string => {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }
};

/**
 * Get a standardized date format based on user locale
 */
export const getLocalizedDateFormat = (): string => {
  const locale = navigator.language || 'en-US';
  
  // Different formats based on locale
  switch (locale.split('-')[0]) {
    case 'en': return 'MM/dd/yyyy';
    case 'de': return 'dd.MM.yyyy';
    case 'fr': return 'dd/MM/yyyy';
    case 'ja': return 'yyyy/MM/dd';
    default: return 'yyyy-MM-dd';
  }
};

/**
 * Get a standardized time format based on user locale
 */
export const getLocalizedTimeFormat = (): string => {
  const locale = navigator.language || 'en-US';
  
  // Different formats based on locale
  switch (locale.split('-')[0]) {
    case 'en': return 'h:mm a';
    default: return 'HH:mm';
  }
};

/**
 * Get a standardized datetime format based on user locale
 */
export const getLocalizedDateTimeFormat = (): string => {
  return `${getLocalizedDateFormat()} ${getLocalizedTimeFormat()}`;
};