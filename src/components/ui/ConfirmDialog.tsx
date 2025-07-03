import React from 'react';
import { createPortal } from 'react-dom';
import { Card } from './Card';
import { Button } from './Button';
import { AlertTriangle, Info, CheckCircle, X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  type?: 'info' | 'warning' | 'danger' | 'success';
  loading?: boolean;
  children?: React.ReactNode;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  type = 'warning',
  loading = false,
  children,
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'info':
        return <Info className="h-6 w-6 text-primary-600" />;
      case 'warning':
        return <AlertTriangle className="h-6 w-6 text-warning-600" />;
      case 'danger':
        return <AlertTriangle className="h-6 w-6 text-error-600" />;
      case 'success':
        return <CheckCircle className="h-6 w-6 text-success-600" />;
      default:
        return <AlertTriangle className="h-6 w-6 text-warning-600" />;
    }
  };

  const getButtonVariant = () => {
    switch (type) {
      case 'info':
        return 'primary';
      case 'warning':
        return 'warning';
      case 'danger':
        return 'error';
      case 'success':
        return 'success';
      default:
        return 'warning';
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
        </div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">
          &#8203;
        </span>

        <Card className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div className="p-6">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                {getIcon()}
              </div>
              <div className="ml-4 flex-1">
                <h3 className="text-lg font-medium text-gray-900">{title}</h3>
                <div className="mt-2">
                  <p className="text-sm text-gray-500">{message}</p>
                  {children && (
                    <div className="mt-3">
                      {children}
                    </div>
                  )}
                </div>
              </div>
              <div className="ml-4 flex-shrink-0">
                <button
                  type="button"
                  className="bg-white rounded-md text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                  onClick={onClose}
                >
                  <span className="sr-only">Close</span>
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <Button
              variant={getButtonVariant() as any}
              onClick={onConfirm}
              loading={loading}
              disabled={loading}
              className="w-full sm:w-auto sm:ml-3"
            >
              {confirmLabel}
            </Button>
            <Button
              variant="ghost"
              onClick={onClose}
              disabled={loading}
              className="mt-3 w-full sm:mt-0 sm:w-auto"
            >
              {cancelLabel}
            </Button>
          </div>
        </Card>
      </div>
    </div>,
    document.body
  );
}