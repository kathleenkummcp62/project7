import React from 'react';
import { formatDate, formatTime, formatDateTime, formatRelativeTime } from '../../lib/dateUtils';

interface DateTimeDisplayProps {
  date: Date | string | number;
  format?: string;
  type?: 'date' | 'time' | 'datetime' | 'relative';
  className?: string;
  showTooltip?: boolean;
  tooltipFormat?: string;
  fallback?: string;
}

export function DateTimeDisplay({
  date,
  format,
  type = 'datetime',
  className = '',
  showTooltip = true,
  tooltipFormat = 'PPpp',
  fallback = 'N/A'
}: DateTimeDisplayProps) {
  if (!date) {
    return <span className={className}>{fallback}</span>;
  }
  
  try {
    const dateObj = typeof date === 'string' || typeof date === 'number' 
      ? new Date(date) 
      : date;
    
    if (isNaN(dateObj.getTime())) {
      return <span className={className}>{fallback}</span>;
    }
    
    let formattedDate: string;
    
    switch (type) {
      case 'date':
        formattedDate = formatDate(dateObj, format);
        break;
      case 'time':
        formattedDate = formatTime(dateObj, format);
        break;
      case 'relative':
        formattedDate = formatRelativeTime(dateObj);
        break;
      case 'datetime':
      default:
        formattedDate = formatDateTime(dateObj, format);
        break;
    }
    
    if (showTooltip) {
      const tooltipText = formatDateTime(dateObj, tooltipFormat);
      
      return (
        <span 
          className={className} 
          title={tooltipText}
        >
          {formattedDate}
        </span>
      );
    }
    
    return <span className={className}>{formattedDate}</span>;
  } catch (error) {
    console.error('Error formatting date:', error);
    return <span className={className}>{fallback}</span>;
  }
}