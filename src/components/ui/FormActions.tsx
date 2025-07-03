import React from 'react';
import { Button } from './Button';

interface FormActionsProps {
  onSubmit?: () => void;
  onCancel?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
}

export function FormActions({
  onSubmit,
  onCancel,
  submitLabel = 'Submit',
  cancelLabel = 'Cancel',
  loading = false,
  disabled = false,
  className = '',
}: FormActionsProps) {
  return (
    <div className={`flex justify-end space-x-3 ${className}`}>
      {onCancel && (
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={loading}
        >
          {cancelLabel}
        </Button>
      )}
      
      {onSubmit && (
        <Button
          type="submit"
          variant="primary"
          onClick={onSubmit}
          loading={loading}
          disabled={disabled || loading}
        >
          {submitLabel}
        </Button>
      )}
    </div>
  );
}