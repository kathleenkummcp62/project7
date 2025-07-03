import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import { AlertTriangle } from 'lucide-react';

interface FormProps extends React.FormHTMLAttributes<HTMLFormElement> {
  onSubmit: (data: any) => void | Promise<void>;
  onCancel?: () => void;
  initialValues?: Record<string, any>;
  resetOnSubmit?: boolean;
  confirmOnReset?: boolean;
  saveOnUnload?: boolean;
  children: React.ReactNode;
  submitLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
}

export function Form({
  onSubmit,
  onCancel,
  initialValues = {},
  resetOnSubmit = true,
  confirmOnReset = true,
  saveOnUnload = true,
  children,
  submitLabel = 'Submit',
  cancelLabel = 'Cancel',
  loading = false,
  ...props
}: FormProps) {
  const [formValues, setFormValues] = useState<Record<string, any>>(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const formId = props.id || 'form-' + Math.random().toString(36).substr(2, 9);

  // Initialize form values from initialValues
  useEffect(() => {
    setFormValues(initialValues);
  }, [initialValues]);

  // Save form values to localStorage when unloading
  useEffect(() => {
    if (!saveOnUnload || !isDirty) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const formData = {
        values: formValues,
        timestamp: Date.now(),
      };
      localStorage.setItem(`form_${formId}`, JSON.stringify(formData));
      
      // Show confirmation dialog
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [formId, formValues, isDirty, saveOnUnload]);

  // Check for saved form data on mount
  useEffect(() => {
    if (!saveOnUnload) return;

    const savedData = localStorage.getItem(`form_${formId}`);
    if (savedData) {
      try {
        const { values, timestamp } = JSON.parse(savedData);
        
        // Only restore if less than 24 hours old
        const isRecent = Date.now() - timestamp < 24 * 60 * 60 * 1000;
        
        if (isRecent && confirm('Would you like to restore your previously unsaved form data?')) {
          setFormValues(values);
        } else {
          localStorage.removeItem(`form_${formId}`);
        }
      } catch (error) {
        console.error('Error parsing saved form data:', error);
        localStorage.removeItem(`form_${formId}`);
      }
    }
  }, [formId, saveOnUnload]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    
    // Handle different input types
    let inputValue: any = value;
    
    if (type === 'checkbox') {
      inputValue = (e.target as HTMLInputElement).checked;
    } else if (type === 'number') {
      inputValue = value === '' ? '' : Number(value);
    }
    
    setFormValues(prev => ({
      ...prev,
      [name]: inputValue,
    }));
    
    // Clear error for this field
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
    
    setIsDirty(true);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    setIsSubmitting(true);
    
    try {
      await onSubmit(formValues);
      
      // Clear form if resetOnSubmit is true
      if (resetOnSubmit) {
        setFormValues(initialValues);
        setIsDirty(false);
      }
      
      // Clear saved form data
      localStorage.removeItem(`form_${formId}`);
    } catch (error: any) {
      // Handle validation errors
      if (error.validationErrors) {
        setErrors(error.validationErrors);
      } else {
        console.error('Form submission error:', error);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (isDirty && confirmOnReset) {
      if (!confirm('Are you sure you want to reset the form? All unsaved changes will be lost.')) {
        return;
      }
    }
    
    setFormValues(initialValues);
    setErrors({});
    setIsDirty(false);
    
    // Clear saved form data
    localStorage.removeItem(`form_${formId}`);
  };

  // Clone children and inject props
  const childrenWithProps = React.Children.map(children, child => {
    if (React.isValidElement(child)) {
      // Check if it's an input, select, or textarea
      const isFormControl = 
        child.type === 'input' || 
        child.type === 'select' || 
        child.type === 'textarea' ||
        (typeof child.type === 'function' && 
          (child.type.name === 'Input' || 
           child.type.name === 'Select' || 
           child.type.name === 'Textarea'));
      
      if (isFormControl && child.props.name) {
        return React.cloneElement(child, {
          value: formValues[child.props.name] ?? '',
          onChange: handleInputChange,
          error: errors[child.props.name],
        });
      }
    }
    return child;
  });

  return (
    <form
      {...props}
      id={formId}
      onSubmit={handleSubmit}
      onReset={handleReset}
      noValidate
    >
      {Object.keys(errors).length > 0 && (
        <div className="mb-4 p-3 bg-error-50 border border-error-200 rounded-lg">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-5 w-5 text-error-600" />
            <div>
              <h4 className="font-medium text-error-800">Please fix the following errors:</h4>
              <ul className="mt-1 text-sm text-error-700 list-disc list-inside">
                {Object.entries(errors).map(([field, message]) => (
                  <li key={field}>{message}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
      
      {childrenWithProps}
      
      {(onSubmit || onCancel) && (
        <div className="flex justify-end space-x-3 mt-6">
          {onCancel && (
            <Button
              type="button"
              variant="ghost"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              {cancelLabel}
            </Button>
          )}
          
          {onSubmit && (
            <Button
              type="submit"
              variant="primary"
              loading={isSubmitting || loading}
              disabled={isSubmitting || loading}
            >
              {submitLabel}
            </Button>
          )}
        </div>
      )}
    </form>
  );
}