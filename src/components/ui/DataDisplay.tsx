import React from 'react';
import { safeValue, formatNumber, formatPercent, formatFileSize, truncateString } from '../../lib/dataUtils';

interface DataDisplayProps {
  value: any;
  type?: 'text' | 'number' | 'percent' | 'fileSize' | 'json' | 'code';
  fallback?: string;
  className?: string;
  decimals?: number;
  maxLength?: number;
  prefix?: string;
  suffix?: string;
}

export function DataDisplay({
  value,
  type = 'text',
  fallback = 'N/A',
  className = '',
  decimals = 1,
  maxLength,
  prefix = '',
  suffix = ''
}: DataDisplayProps) {
  if (value === null || value === undefined) {
    return <span className={className}>{fallback}</span>;
  }
  
  let formattedValue: string;
  
  switch (type) {
    case 'number':
      formattedValue = formatNumber(Number(value), fallback);
      break;
    case 'percent':
      formattedValue = formatPercent(Number(value), fallback, decimals);
      break;
    case 'fileSize':
      formattedValue = formatFileSize(Number(value), fallback);
      break;
    case 'json':
      try {
        const jsonString = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
        formattedValue = jsonString;
      } catch (error) {
        console.error('Error formatting JSON:', error);
        formattedValue = fallback;
      }
      break;
    case 'code':
      formattedValue = String(value);
      return (
        <code className={`bg-gray-100 px-1 rounded font-mono text-sm ${className}`}>
          {maxLength ? truncateString(formattedValue, maxLength) : formattedValue}
        </code>
      );
    case 'text':
    default:
      formattedValue = String(value);
      break;
  }
  
  // Apply truncation if maxLength is specified
  if (maxLength && type !== 'code') {
    formattedValue = truncateString(formattedValue, maxLength);
  }
  
  // Add prefix and suffix
  formattedValue = `${prefix}${formattedValue}${suffix}`;
  
  return <span className={className}>{formattedValue}</span>;
}