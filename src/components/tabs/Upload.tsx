import React, { useState, useRef } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { ProgressBar } from '../ui/ProgressBar';
import { FileUpload } from '../ui/FileUpload';
import { 
  Upload as UploadIcon, 
  FileText, 
  Server, 
  CheckCircle, 
  AlertTriangle,
  X,
  Download,
  Folder,
  HardDrive,
  RefreshCw
} from 'lucide-react';
import { formatFileSize } from '../../lib/fileUtils';
import { formatDuration } from '../../lib/dateUtils';
import toast from 'react-hot-toast';

interface UploadFile {
  id: string;
  name: string;
  size: number;
  type: string;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  progress: number;
  server?: string;
  error?: string;
  uploadSpeed?: number;
  timeRemaining?: number;
}

export function Upload() {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [selectedServers, setSelectedServers] = useState<string[]>([]);
  const [uploadMode, setUploadMode] = useState<'credentials' | 'scripts' | 'configs'>('credentials');
  const [isUploading, setIsUploading] = useState(false);
  const [totalProgress, setTotalProgress] = useState(0);
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<string | null>(null);
  const [uploadStartTime, setUploadStartTime] = useState<number>(0);

  const servers = [
    { ip: '192.0.2.10', status: 'online', space: '2.1 GB' },
    { ip: '192.0.2.11', status: 'online', space: '1.8 GB' },
    { ip: '192.0.2.12', status: 'online', space: '3.2 GB' },
    { ip: '192.0.2.13', status: 'online', space: '2.7 GB' }
  ];

  const handleFileSelect = (selectedFiles: File[]) => {
    const newFiles: UploadFile[] = selectedFiles.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      name: file.name,
      size: file.size,
      type: file.type,
      status: 'pending',
      progress: 0
    }));
    
    setFiles(prev => [...prev, ...newFiles]);
  };

  const handleUploadProgress = (progress: number, file: File) => {
    // Find the corresponding file in our state
    const fileId = files.find(f => f.name === file.name && f.size === file.size)?.id;
    
    if (fileId) {
      setFiles(prev => prev.map(f => 
        f.id === fileId ? { ...f, progress, status: 'uploading' } : f
      ));
    }
    
    // Update total progress
    updateTotalProgress();
  };

  const handleUploadComplete = (file: File) => {
    // Find the corresponding file in our state
    const fileId = files.find(f => f.name === file.name && f.size === file.size)?.id;
    
    if (fileId) {
      // Assign a random server from selected servers
      const randomServer = selectedServers[Math.floor(Math.random() * selectedServers.length)];
      
      setFiles(prev => prev.map(f => 
        f.id === fileId ? { 
          ...f, 
          status: 'completed', 
          progress: 100,
          server: randomServer
        } : f
      ));
    }
    
    // Check if all files are completed
    const allCompleted = files.every(f => f.status === 'completed' || f.status === 'error');
    
    if (allCompleted) {
      setIsUploading(false);
      setEstimatedTimeRemaining(null);
      toast.success('All files uploaded successfully');
    }
    
    // Update total progress
    updateTotalProgress();
  };

  const handleUploadError = (error: Error, file: File) => {
    // Find the corresponding file in our state
    const fileId = files.find(f => f.name === file.name && f.size === file.size)?.id;
    
    if (fileId) {
      setFiles(prev => prev.map(f => 
        f.id === fileId ? { 
          ...f, 
          status: 'error', 
          error: error.message 
        } : f
      ));
    }
    
    toast.error(`Failed to upload ${file.name}: ${error.message}`);
    
    // Update total progress
    updateTotalProgress();
  };

  const updateTotalProgress = () => {
    // Calculate total progress based on all files
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    const uploadedSize = files.reduce((sum, file) => sum + (file.size * (file.progress / 100)), 0);
    
    const progress = totalSize > 0 ? (uploadedSize / totalSize) * 100 : 0;
    setTotalProgress(progress);
    
    // Calculate estimated time remaining
    if (isUploading && uploadStartTime > 0) {
      const elapsedMs = Date.now() - uploadStartTime;
      if (elapsedMs > 0 && uploadedSize > 0) {
        const uploadSpeed = uploadedSize / (elapsedMs / 1000); // bytes per second
        const remainingBytes = totalSize - uploadedSize;
        const remainingSeconds = remainingBytes / uploadSpeed;
        
        if (remainingSeconds > 0) {
          setEstimatedTimeRemaining(formatDuration(remainingSeconds));
        }
      }
    }
  };

  const handleUpload = () => {
    if (selectedServers.length === 0) {
      toast.error('Please select at least one server');
      return;
    }

    if (files.filter(f => f.status === 'pending').length === 0) {
      toast.error('No files to upload');
      return;
    }

    setIsUploading(true);
    setUploadStartTime(Date.now());
    
    // In a real implementation, this would trigger the actual upload process
    // For this demo, we'll simulate uploads with the FileUpload component
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const getUploadPath = () => {
    switch (uploadMode) {
      case 'credentials': return '/root/NAM/Check/';
      case 'scripts': return '/root/NAM/Servis/';
      case 'configs': return '/root/NAM/Config/';
      default: return '/root/NAM/';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">File Upload</h1>
          <p className="text-gray-600 mt-1">Upload files to worker servers</p>
        </div>
        <div className="flex items-center space-x-3">
          <Button 
            variant="ghost"
            onClick={() => {
              setFiles([]);
              setTotalProgress(0);
              setEstimatedTimeRemaining(null);
              setIsUploading(false);
            }}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Reset
          </Button>
          <Button 
            variant="primary" 
            onClick={handleUpload}
            disabled={files.length === 0 || selectedServers.length === 0 || isUploading}
          >
            <UploadIcon className="h-4 w-4 mr-2" />
            Upload to Servers
          </Button>
        </div>
      </div>

      {/* Upload Mode Selection */}
      <Card>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Upload Type</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { id: 'credentials', label: 'Credential Files', desc: 'part_*.txt, gener.txt', icon: FileText, path: '/root/NAM/Check/' },
            { id: 'scripts', label: 'Script Files', desc: 'sers*.py, sers*.go', icon: Server, path: '/root/NAM/Servis/' },
            { id: 'configs', label: 'Config Files', desc: 'config.txt, proxy_config.txt', icon: Folder, path: '/root/NAM/Config/' }
          ].map(mode => {
            const Icon = mode.icon;
            return (
              <div
                key={mode.id}
                className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                  uploadMode === mode.id 
                    ? 'border-primary-500 bg-primary-50' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setUploadMode(mode.id as any)}
              >
                <div className="flex items-center space-x-3 mb-2">
                  <Icon className="h-6 w-6 text-primary-600" />
                  <span className="font-medium text-gray-900">{mode.label}</span>
                </div>
                <p className="text-sm text-gray-600 mb-2">{mode.desc}</p>
                <p className="text-xs text-gray-500 font-mono">{mode.path}</p>
              </div>
            );
          })}
        </div>
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>Target Path:</strong> <code className="bg-blue-100 px-1 rounded">{getUploadPath()}</code>
          </p>
        </div>
      </Card>

      {/* Server Selection */}
      <Card>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Target Servers</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {servers.map(server => (
            <div
              key={server.ip}
              className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                selectedServers.includes(server.ip)
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => {
                setSelectedServers(prev => 
                  prev.includes(server.ip)
                    ? prev.filter(s => s !== server.ip)
                    : [...prev, server.ip]
                );
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-gray-900">{server.ip}</span>
                <Badge variant={server.status === 'online' ? 'success' : 'error'}>
                  {server.status}
                </Badge>
              </div>
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <HardDrive className="h-4 w-4" />
                <span>Free: {server.space}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex space-x-2">
          <Button 
            size="sm" 
            variant="ghost"
            onClick={() => setSelectedServers(servers.map(s => s.ip))}
          >
            Select All
          </Button>
          <Button 
            size="sm" 
            variant="ghost"
            onClick={() => setSelectedServers([])}
          >
            Clear Selection
          </Button>
        </div>
      </Card>

      {/* File Upload Area */}
      <Card>
        <FileUpload
          onFilesSelected={handleFileSelect}
          onUploadProgress={handleUploadProgress}
          onUploadComplete={handleUploadComplete}
          onUploadError={handleUploadError}
          maxFiles={10}
          maxSize={50 * 1024 * 1024} // 50MB
          accept={{
            'text/plain': ['.txt'],
            'application/json': ['.json'],
            'application/x-python': ['.py'],
            'application/octet-stream': ['.go'],
            'application/yaml': ['.yaml', '.yml']
          }}
          multiple={true}
          label="Upload Files"
          description="Drag and drop files here or click to browse"
          showPreview={true}
          autoUpload={false}
        />
      </Card>

      {/* Overall Progress */}
      {isUploading && (
        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Upload Progress</h3>
          <div className="mb-4">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">Overall Progress</span>
              <span className="font-medium">{Math.round(totalProgress)}%</span>
            </div>
            <ProgressBar 
              value={totalProgress} 
              color="primary" 
              size="md" 
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>Uploading {files.filter(f => f.status === 'uploading').length} files</span>
              {estimatedTimeRemaining && (
                <span>Estimated time remaining: {estimatedTimeRemaining}</span>
              )}
            </div>
          </div>
          
          <div className="space-y-3">
            {files.filter(f => f.status === 'uploading').map(file => (
              <div key={file.id} className="p-3 border border-gray-200 rounded-lg">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center space-x-2">
                    <FileText className="h-5 w-5 text-gray-400" />
                    <span className="text-sm font-medium text-gray-700">{file.name}</span>
                  </div>
                  <div className="text-sm text-gray-500">
                    {formatFileSize(file.size)}
                  </div>
                </div>
                
                <ProgressBar 
                  value={file.progress} 
                  color="primary" 
                  size="sm" 
                />
                
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>{Math.round(file.progress)}% complete</span>
                  {file.uploadSpeed && file.timeRemaining && (
                    <span>
                      {formatFileSize(file.uploadSpeed)}/s • {formatDuration(file.timeRemaining)} remaining
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Completed Files */}
      {files.filter(f => f.status === 'completed').length > 0 && (
        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Completed Uploads</h3>
          <div className="space-y-3">
            {files.filter(f => f.status === 'completed').map(file => (
              <div key={file.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                <div className="flex items-center space-x-3">
                  <CheckCircle className="h-5 w-5 text-success-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{file.name}</p>
                    <p className="text-xs text-gray-500">
                      {formatFileSize(file.size)} • Uploaded to {file.server}
                    </p>
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => removeFile(file.id)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Error Files */}
      {files.filter(f => f.status === 'error').length > 0 && (
        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Failed Uploads</h3>
          <div className="space-y-3">
            {files.filter(f => f.status === 'error').map(file => (
              <div key={file.id} className="flex items-center justify-between p-3 border border-error-200 bg-error-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <AlertTriangle className="h-5 w-5 text-error-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{file.name}</p>
                    <p className="text-xs text-error-600">
                      {file.error || 'Upload failed'}
                    </p>
                  </div>
                </div>
                <div className="flex space-x-2">
                  <Button size="sm" variant="ghost" onClick={() => {
                    setFiles(prev => prev.map(f => 
                      f.id === file.id ? { ...f, status: 'pending', progress: 0, error: undefined } : f
                    ));
                  }}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => removeFile(file.id)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Quick Actions */}
      <Card>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Button variant="secondary" className="w-full">
            <Download className="h-4 w-4 mr-2" />
            Download Templates
          </Button>
          <Button variant="secondary" className="w-full">
            <Server className="h-4 w-4 mr-2" />
            Check Server Space
          </Button>
          <Button variant="secondary" className="w-full">
            <FileText className="h-4 w-4 mr-2" />
            View Upload History
          </Button>
        </div>
      </Card>
    </div>
  );
}