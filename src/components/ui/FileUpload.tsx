import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from './Button';
import { ProgressBar } from './ProgressBar';
import { 
  Upload, 
  X, 
  File, 
  CheckCircle, 
  AlertTriangle,
  Clock,
  Folder
} from 'lucide-react';
import SparkMD5 from 'spark-md5';
import { formatFileSize } from '../../lib/fileUtils';

interface FileUploadProps {
  onFilesSelected: (files: File[]) => void;
  onUploadProgress?: (progress: number, file: File) => void;
  onUploadComplete?: (file: File) => void;
  onUploadError?: (error: Error, file: File) => void;
  maxFiles?: number;
  maxSize?: number; // in bytes
  accept?: Record<string, string[]>;
  multiple?: boolean;
  className?: string;
  label?: string;
  description?: string;
  value?: File[];
  onChange?: (files: File[]) => void;
  chunkSize?: number; // for chunked uploads
  showPreview?: boolean;
  autoUpload?: boolean;
  disabled?: boolean;
}

interface FileWithProgress extends File {
  id: string;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  error?: string;
  timeRemaining?: number;
  uploadSpeed?: number;
  startTime?: number;
}

export function FileUpload({
  onFilesSelected,
  onUploadProgress,
  onUploadComplete,
  onUploadError,
  maxFiles = 5,
  maxSize = 10 * 1024 * 1024, // 10MB
  accept,
  multiple = true,
  className = '',
  label = 'Upload Files',
  description = 'Drag and drop files here or click to browse',
  value,
  onChange,
  chunkSize = 1024 * 1024, // 1MB chunks
  showPreview = true,
  autoUpload = false,
  disabled = false
}: FileUploadProps) {
  const [files, setFiles] = useState<FileWithProgress[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [totalProgress, setTotalProgress] = useState(0);
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<string | null>(null);
  const abortControllersRef = useRef<Record<string, AbortController>>({});
  const uploadStartTimeRef = useRef<number>(0);

  // Initialize files from value prop
  useEffect(() => {
    if (value && value.length > 0) {
      const initialFiles = value.map(file => ({
        ...file,
        id: generateFileId(file),
        progress: 0,
        status: 'pending' as const
      }));
      setFiles(initialFiles);
    }
  }, []);

  // Generate a unique ID for each file using its content
  const generateFileId = async (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const buffer = e.target?.result as ArrayBuffer;
        const spark = new SparkMD5.ArrayBuffer();
        spark.append(buffer);
        const hash = spark.end();
        resolve(`${hash}-${file.name}-${file.size}`);
      };
      
      // Read a small slice of the file for faster ID generation
      const slice = file.slice(0, 2 * 1024 * 1024); // First 2MB
      reader.readAsArrayBuffer(slice);
    });
  };

  // Simplified version for initial render
  const generateFileIdSync = (file: File): string => {
    return `${file.name}-${file.size}-${Date.now()}`;
  };

  const onDrop = useCallback(async (acceptedFiles: File[], rejectedFiles: any[]) => {
    if (disabled) return;
    
    // Handle rejected files
    if (rejectedFiles.length > 0) {
      const errorMessages = rejectedFiles.map(rejection => {
        const file = rejection.file;
        const errors = rejection.errors.map((e: any) => e.message).join(', ');
        return `${file.name}: ${errors}`;
      });
      setErrors(prev => [...prev, ...errorMessages]);
    }
    
    // Process accepted files
    if (acceptedFiles.length > 0) {
      // Check if adding these files would exceed maxFiles
      if (files.length + acceptedFiles.length > maxFiles) {
        setErrors(prev => [...prev, `You can upload a maximum of ${maxFiles} files`]);
        // Only take as many files as we can add
        acceptedFiles = acceptedFiles.slice(0, maxFiles - files.length);
        if (acceptedFiles.length === 0) return;
      }
      
      // Process each file
      const newFiles: FileWithProgress[] = [];
      
      for (const file of acceptedFiles) {
        // Generate a temporary ID synchronously for immediate UI update
        const tempId = generateFileIdSync(file);
        
        const fileWithProgress: FileWithProgress = {
          ...file,
          id: tempId,
          progress: 0,
          status: 'pending'
        };
        
        newFiles.push(fileWithProgress);
        
        // Generate a more robust ID asynchronously
        generateFileId(file).then(id => {
          setFiles(prev => prev.map(f => 
            f.id === tempId ? { ...f, id } : f
          ));
        });
      }
      
      const updatedFiles = [...files, ...newFiles];
      setFiles(updatedFiles);
      
      if (onChange) {
        onChange(updatedFiles);
      }
      
      onFilesSelected(acceptedFiles);
      
      // Auto upload if enabled
      if (autoUpload) {
        uploadFiles(newFiles);
      }
    }
  }, [files, maxFiles, onChange, onFilesSelected, autoUpload, disabled]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxSize,
    accept,
    multiple,
    disabled,
    onDragEnter: () => setIsDragging(true),
    onDragLeave: () => setIsDragging(false),
    onDropAccepted: () => setIsDragging(false),
    onDropRejected: () => setIsDragging(false)
  });

  const handleRemoveFile = (id: string) => {
    // Cancel upload if in progress
    if (abortControllersRef.current[id]) {
      abortControllersRef.current[id].abort();
      delete abortControllersRef.current[id];
    }
    
    setFiles(prev => prev.filter(file => file.id !== id));
    
    if (onChange) {
      const updatedFiles = files.filter(file => file.id !== id);
      onChange(updatedFiles);
    }
  };

  const handleClearErrors = () => {
    setErrors([]);
  };

  const formatTimeRemaining = (seconds: number): string => {
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

  const uploadFiles = async (filesToUpload: FileWithProgress[] = files) => {
    if (filesToUpload.length === 0 || isUploading) return;
    
    setIsUploading(true);
    uploadStartTimeRef.current = Date.now();
    
    // Filter out already completed files
    const pendingFiles = filesToUpload.filter(file => file.status !== 'completed');
    
    if (pendingFiles.length === 0) {
      setIsUploading(false);
      return;
    }
    
    // Track overall progress
    const totalSize = pendingFiles.reduce((sum, file) => sum + file.size, 0);
    let totalUploaded = 0;
    
    // Update overall progress
    const updateTotalProgress = (uploadedBytes: number, fileSize: number) => {
      totalUploaded += uploadedBytes;
      const overallProgress = Math.min(100, (totalUploaded / totalSize) * 100);
      setTotalProgress(overallProgress);
      
      // Calculate estimated time remaining
      const elapsedMs = Date.now() - uploadStartTimeRef.current;
      if (elapsedMs > 0 && totalUploaded > 0) {
        const uploadSpeed = totalUploaded / (elapsedMs / 1000); // bytes per second
        const remainingBytes = totalSize - totalUploaded;
        const remainingSeconds = remainingBytes / uploadSpeed;
        
        if (remainingSeconds > 0) {
          setEstimatedTimeRemaining(formatTimeRemaining(remainingSeconds));
        }
      }
    };
    
    // Process each file
    for (const file of pendingFiles) {
      try {
        // Update file status
        setFiles(prev => prev.map(f => 
          f.id === file.id ? { ...f, status: 'uploading', startTime: Date.now() } : f
        ));
        
        // Create abort controller for this file
        const controller = new AbortController();
        abortControllersRef.current[file.id] = controller;
        
        // Simulate chunked upload for demonstration
        // In a real implementation, this would use actual API calls
        const totalChunks = Math.ceil(file.size / chunkSize);
        let uploadedChunks = 0;
        let uploadedBytes = 0;
        
        for (let i = 0; i < totalChunks; i++) {
          const start = i * chunkSize;
          const end = Math.min(file.size, start + chunkSize);
          const chunk = file.slice(start, end);
          
          // Simulate network delay
          await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));
          
          // Check if upload was aborted
          if (controller.signal.aborted) {
            throw new Error('Upload aborted');
          }
          
          // Update progress
          uploadedChunks++;
          const chunkSize = end - start;
          uploadedBytes += chunkSize;
          const progress = Math.min(100, (uploadedBytes / file.size) * 100);
          
          // Calculate upload speed and time remaining for this file
          const elapsedMs = Date.now() - (file.startTime || 0);
          let uploadSpeed = 0;
          let timeRemaining = 0;
          
          if (elapsedMs > 0) {
            uploadSpeed = uploadedBytes / (elapsedMs / 1000); // bytes per second
            const remainingBytes = file.size - uploadedBytes;
            timeRemaining = remainingBytes / uploadSpeed; // seconds
          }
          
          // Update file progress
          setFiles(prev => prev.map(f => 
            f.id === file.id ? { 
              ...f, 
              progress, 
              uploadSpeed,
              timeRemaining
            } : f
          ));
          
          // Call progress callback
          if (onUploadProgress) {
            onUploadProgress(progress, file);
          }
          
          // Update total progress
          updateTotalProgress(chunkSize, totalSize);
        }
        
        // Mark file as completed
        setFiles(prev => prev.map(f => 
          f.id === file.id ? { ...f, status: 'completed', progress: 100 } : f
        ));
        
        // Call complete callback
        if (onUploadComplete) {
          onUploadComplete(file);
        }
        
      } catch (error: any) {
        // Handle upload error
        if (error.name === 'AbortError') {
          console.log(`Upload of ${file.name} was aborted`);
        } else {
          console.error(`Error uploading ${file.name}:`, error);
          
          // Update file status
          setFiles(prev => prev.map(f => 
            f.id === file.id ? { ...f, status: 'error', error: error.message } : f
          ));
          
          // Call error callback
          if (onUploadError) {
            onUploadError(error, file);
          }
          
          setErrors(prev => [...prev, `Failed to upload ${file.name}: ${error.message}`]);
        }
      } finally {
        // Clean up abort controller
        delete abortControllersRef.current[file.id];
      }
    }
    
    setIsUploading(false);
    setEstimatedTimeRemaining(null);
  };

  const cancelUpload = (id: string) => {
    if (abortControllersRef.current[id]) {
      abortControllersRef.current[id].abort();
      delete abortControllersRef.current[id];
      
      setFiles(prev => prev.map(file => 
        file.id === id ? { ...file, status: 'pending', progress: 0 } : file
      ));
    }
  };

  const cancelAllUploads = () => {
    Object.values(abortControllersRef.current).forEach(controller => {
      controller.abort();
    });
    
    abortControllersRef.current = {};
    
    setFiles(prev => prev.map(file => 
      file.status === 'uploading' ? { ...file, status: 'pending', progress: 0 } : file
    ));
    
    setIsUploading(false);
  };

  const getFileIcon = (fileName: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    
    switch (extension) {
      case 'pdf':
        return <File className="h-5 w-5 text-error-600" />;
      case 'doc':
      case 'docx':
        return <File className="h-5 w-5 text-primary-600" />;
      case 'xls':
      case 'xlsx':
        return <File className="h-5 w-5 text-success-600" />;
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
        return <File className="h-5 w-5 text-warning-600" />;
      default:
        return <File className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-success-600" />;
      case 'error':
        return <AlertTriangle className="h-5 w-5 text-error-600" />;
      case 'uploading':
        return <Clock className="h-5 w-5 text-primary-600 animate-spin" />;
      default:
        return null;
    }
  };

  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}
      
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
          isDragging || isDragActive ? 'border-primary-500 bg-primary-50' : 'border-gray-300 hover:border-primary-400'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <input {...getInputProps()} disabled={disabled} />
        
        <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
        <p className="text-sm font-medium text-gray-700">{description}</p>
        <p className="text-xs text-gray-500 mt-1">
          {multiple ? `Up to ${maxFiles} files` : 'Single file'}, max {formatFileSize(maxSize)} each
        </p>
      </div>
      
      {/* Overall Progress */}
      {isUploading && (
        <div className="mt-4">
          <div className="flex justify-between text-sm text-gray-700 mb-1">
            <span>Overall Progress</span>
            <span>{Math.round(totalProgress)}%</span>
          </div>
          <ProgressBar value={totalProgress} color="primary" size="md" />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>Uploading {files.filter(f => f.status === 'uploading').length} files</span>
            {estimatedTimeRemaining && (
              <span>Estimated time remaining: {estimatedTimeRemaining}</span>
            )}
          </div>
          <div className="flex justify-end mt-2">
            <Button size="sm" variant="error" onClick={cancelAllUploads}>
              Cancel All
            </Button>
          </div>
        </div>
      )}
      
      {/* File List */}
      {files.length > 0 && showPreview && (
        <div className="mt-4 space-y-2">
          <div className="text-sm font-medium text-gray-700 flex justify-between">
            <span>{files.length} {files.length === 1 ? 'file' : 'files'} selected</span>
            <div className="space-x-2">
              {!isUploading && files.some(f => f.status === 'pending') && (
                <Button size="sm" variant="primary" onClick={() => uploadFiles()}>
                  Upload All
                </Button>
              )}
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-200">
            {files.map((file) => (
              <div key={file.id} className="p-3 hover:bg-gray-50">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center space-x-2">
                    {getFileIcon(file.name)}
                    <span className="text-sm font-medium text-gray-700 truncate max-w-xs">
                      {file.name}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(file.status)}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        file.status === 'uploading' ? cancelUpload(file.id) : handleRemoveFile(file.id);
                      }}
                      className="text-gray-400 hover:text-gray-500"
                      disabled={disabled}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                
                <div className="flex items-center text-xs text-gray-500 mb-1">
                  <span>{formatFileSize(file.size)}</span>
                  {file.uploadSpeed && (
                    <span className="ml-2">
                      {formatFileSize(file.uploadSpeed)}/s
                    </span>
                  )}
                  {file.timeRemaining && file.timeRemaining > 0 && (
                    <span className="ml-2">
                      {formatTimeRemaining(file.timeRemaining)} remaining
                    </span>
                  )}
                </div>
                
                {file.status === 'uploading' && (
                  <ProgressBar value={file.progress} color="primary" size="sm" />
                )}
                
                {file.status === 'error' && file.error && (
                  <p className="text-xs text-error-600 mt-1">{file.error}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Errors */}
      {errors.length > 0 && (
        <div className="mt-4 p-3 bg-error-50 border border-error-200 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-4 w-4 text-error-600" />
              <span className="text-sm font-medium text-error-800">Upload Errors</span>
            </div>
            <button
              type="button"
              onClick={handleClearErrors}
              className="text-error-600 hover:text-error-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <ul className="text-sm text-error-700 space-y-1 ml-6 list-disc">
            {errors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}