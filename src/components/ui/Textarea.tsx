import React, { forwardRef } from 'react';
import { clsx } from 'clsx';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
  fullWidth?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, fullWidth = true, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={clsx(
          'shadow-sm rounded-md border p-2 focus:outline-none focus:ring-2 focus:ring-offset-0',
          error
            ? 'border-error-300 focus:border-error-500 focus:ring-error-500'
            : 'border-gray-300 focus:border-primary-500 focus:ring-primary-500',
          fullWidth ? 'w-full' : '',
          className
        )}
        {...props}
      />
    );
  }
);

Textarea.displayName = 'Textarea';