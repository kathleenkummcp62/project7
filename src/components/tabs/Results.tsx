import React, { useState, useEffect } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { 
  Download, 
  FileText, 
  Search, 
  Filter, 
  Eye,
  Copy,
  Trash2,
  Archive,
  CheckCircle,
  AlertTriangle,
  Calendar,
  Server,
  PieChart,
  RefreshCw
} from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../store';
import { 
  fetchResults, 
  downloadFile, 
  toggleFileSelection, 
  clearFileSelection, 
  selectAllFiles 
} from '../../store/slices/resultsSlice';
import { ScanResultsOverview } from '../charts/ScanResultsOverview';
import { EnhancedExportModal } from '../export/EnhancedExportModal';
import { useDataRefresh } from '../../services/DataRefreshService';
import { formatDate, formatRelativeTime } from '../../lib/dateUtils';
import { safeValue, formatFileSize } from '../../lib/dataUtils';
import toast from 'react-hot-toast';

export function Results() {
  const dispatch = useAppDispatch();
  const { files, selectedFiles, loading, statistics } = useAppSelector(state => state.results);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'valid' | 'invalid' | 'errors' | 'logs'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [showExportModal, setShowExportModal] = useState(false);
  const [previewFile, setPreviewFile] = useState<any | null>(null);
  const [refreshInterval, setRefreshInterval] = useState(60000); // 1 minute
  const [savedTemplates, setSavedTemplates] = useState<any[]>([]);

  // Setup data refresh
  const dataRefresh = useDataRefresh({
    interval: refreshInterval,
    enabled: true,
    onRefresh: async () => {
      await dispatch(fetchResults());
    },
    notifyOnError: true
  });

  useEffect(() => {
    dispatch(fetchResults());
    
    // Load saved templates from localStorage
    const savedTemplatesJson = localStorage.getItem('exportTemplates');
    if (savedTemplatesJson) {
      try {
        setSavedTemplates(JSON.parse(savedTemplatesJson));
      } catch (error) {
        console.error('Error loading saved templates:', error);
      }
    }
  }, [dispatch]);

  const filteredFiles = files.filter(file => {
    const matchesSearch = file.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         file.server.includes(searchTerm) ||
                         file.vpnType.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterType === 'all' || file.type === filterType;
    return matchesSearch && matchesFilter;
  });

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'valid': return 'success';
      case 'invalid': return 'error';
      case 'errors': return 'warning';
      case 'logs': return 'primary';
      default: return 'gray';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'valid': return CheckCircle;
      case 'invalid': return AlertTriangle;
      case 'errors': return AlertTriangle;
      case 'logs': return FileText;
      default: return FileText;
    }
  };

  const handleDownload = (fileId: string) => {
    dispatch(downloadFile(fileId));
  };

  const handleBulkAction = (action: string) => {
    if (selectedFiles.length === 0) {
      toast.error('No files selected');
      return;
    }
    
    if (action === 'download') {
      selectedFiles.forEach(fileId => {
        dispatch(downloadFile(fileId));
      });
    } else if (action === 'export') {
      setShowExportModal(true);
    } else if (action === 'delete') {
      // In a real implementation, this would delete the selected files
      toast.success(`Deleted ${selectedFiles.length} files`);
      dispatch(clearFileSelection());
    }
  };

  const handlePreview = (fileId: string) => {
    const file = files.find(f => f.id === fileId);
    if (file) {
      setPreviewFile(file);
    }
  };

  const handleSaveTemplate = (template: any) => {
    const updatedTemplates = [...savedTemplates, template];
    setSavedTemplates(updatedTemplates);
    
    // Save to localStorage
    localStorage.setItem('exportTemplates', JSON.stringify(updatedTemplates));
    
    toast.success('Export template saved successfully');
  };

  const totalStats = {
    validCredentials: files.filter(f => f.type === 'valid').reduce((sum, f) => sum + f.count, 0),
    totalFiles: files.length,
    totalSize: formatFileSize(files.reduce((sum, f) => {
      // Parse size string like "2.3 MB" to bytes
      const size = parseFloat(f.size);
      const unit = f.size.split(' ')[1];
      
      if (unit === 'KB') return sum + size * 1024;
      if (unit === 'MB') return sum + size * 1024 * 1024;
      if (unit === 'GB') return sum + size * 1024 * 1024 * 1024;
      return sum + size;
    }, 0)),
    lastUpdate: files.length > 0 
      ? formatRelativeTime(Math.max(...files.map(f => new Date(f.lastModified).getTime())))
      : 'N/A'
  };

  // Prepare data for export
  const getExportData = () => {
    // For this example, we'll just use the selected files or all filtered files
    const exportFiles = selectedFiles.length > 0 
      ? filteredFiles.filter(f => selectedFiles.includes(f.id))
      : filteredFiles;
    
    return exportFiles.map(file => ({
      Name: file.name,
      Type: file.type,
      Server: file.server,
      'VPN Type': file.vpnType,
      Size: file.size,
      Count: file.count,
      Created: formatDate(new Date(file.created)),
      'Last Modified': formatDate(new Date(file.lastModified))
    }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Results Management</h1>
          <p className="text-gray-600 mt-1">View, download, and manage scan results</p>
        </div>
        <div className="flex space-x-3">
          <Button 
            variant="ghost" 
            onClick={() => dataRefresh.refresh()}
            loading={dataRefresh.isRefreshing}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="ghost">
            <Archive className="h-4 w-4 mr-2" />
            Archive Old
          </Button>
          <Button 
            variant="primary"
            onClick={() => handleBulkAction('download')}
            disabled={files.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Download All
          </Button>
          <Button 
            variant="secondary"
            onClick={() => setShowExportModal(true)}
          >
            <PieChart className="h-4 w-4 mr-2" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Valid Credentials</p>
              <p className="text-3xl font-bold text-success-600">{totalStats.validCredentials.toLocaleString()}</p>
              <p className="text-sm text-success-600 mt-1">
                {statistics.successRate.toFixed(1)}% success rate
              </p>
            </div>
            <CheckCircle className="h-8 w-8 text-success-600" />
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Result Files</p>
              <p className="text-3xl font-bold text-primary-600">{totalStats.totalFiles}</p>
              <p className="text-sm text-primary-600 mt-1">
                From {Object.keys(statistics.serverStats).length} servers
              </p>
            </div>
            <FileText className="h-8 w-8 text-primary-600" />
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Size</p>
              <p className="text-3xl font-bold text-gray-600">{totalStats.totalSize}</p>
              <p className="text-sm text-gray-600 mt-1">
                Combined file size
              </p>
            </div>
            <Archive className="h-8 w-8 text-gray-600" />
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Last Update</p>
              <p className="text-3xl font-bold text-warning-600">{totalStats.lastUpdate}</p>
              <p className="text-sm text-warning-600 mt-1">
                {dataRefresh.lastRefresh ? formatRelativeTime(dataRefresh.lastRefresh) : 'Never refreshed'}
              </p>
            </div>
            <Calendar className="h-8 w-8 text-warning-600" />
          </div>
        </Card>
      </div>

      {/* Search and Filter */}
      <Card>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
          <div className="flex items-center space-x-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search files..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="all">All Types</option>
              <option value="valid">Valid Credentials</option>
              <option value="invalid">Invalid Attempts</option>
              <option value="errors">Error Logs</option>
              <option value="logs">System Logs</option>
            </select>
            
            <select
              value={refreshInterval}
              onChange={(e) => {
                const interval = parseInt(e.target.value);
                setRefreshInterval(interval);
                dataRefresh.setInterval(interval);
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="0">Manual Refresh</option>
              <option value="15000">Refresh: 15s</option>
              <option value="30000">Refresh: 30s</option>
              <option value="60000">Refresh: 1m</option>
              <option value="300000">Refresh: 5m</option>
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">{filteredFiles.length} files</span>
            <div className="flex space-x-2">
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={() => dispatch(selectAllFiles())}
                disabled={files.length === 0}
              >
                Select All
              </Button>
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={() => dispatch(clearFileSelection())}
                disabled={selectedFiles.length === 0}
              >
                Clear Selection
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Bulk Actions */}
      {selectedFiles.length > 0 && (
        <Card>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">
              {selectedFiles.length} file(s) selected
            </span>
            <div className="flex space-x-2">
              <Button size="sm" variant="primary" onClick={() => handleBulkAction('download')}>
                <Download className="h-4 w-4 mr-1" />
                Download
              </Button>
              <Button size="sm" variant="secondary" onClick={() => handleBulkAction('export')}>
                <PieChart className="h-4 w-4 mr-1" />
                Export Report
              </Button>
              <Button size="sm" variant="error" onClick={() => handleBulkAction('delete')}>
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* File Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-4xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg bg-${getTypeColor(previewFile.type)}-100`}>
                  {React.createElement(getTypeIcon(previewFile.type), { 
                    className: `h-5 w-5 text-${getTypeColor(previewFile.type)}-600` 
                  })}
                </div>
                <h3 className="text-lg font-semibold text-gray-900">{previewFile.name}</h3>
              </div>
              <button 
                onClick={() => setPreviewFile(null)}
                className="text-gray-400 hover:text-gray-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="flex items-center space-x-4 mb-4 text-sm text-gray-600">
              <div className="flex items-center space-x-1">
                <Server className="h-4 w-4" />
                <span>{previewFile.server}</span>
              </div>
              <Badge variant="primary">{previewFile.vpnType}</Badge>
              <span>{previewFile.size}</span>
              <span>{previewFile.count.toLocaleString()} entries</span>
              <span>Modified: {formatDate(new Date(previewFile.lastModified), 'PPpp')}</span>
            </div>
            
            <div className="border border-gray-200 rounded-lg p-4 mb-4">
              <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono max-h-96 overflow-y-auto">
                {previewFile.content || 'No content available'}
              </pre>
            </div>
            
            <div className="flex justify-end space-x-3">
              <Button 
                variant="ghost" 
                onClick={() => {
                  if (previewFile.content) {
                    navigator.clipboard.writeText(previewFile.content);
                    toast.success('Content copied to clipboard');
                  }
                }}
                disabled={!previewFile.content}
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy Content
              </Button>
              <Button 
                variant="primary" 
                onClick={() => handleDownload(previewFile.id)}
              >
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* File List */}
      <Card>
        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-600"></div>
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No results found</h3>
              <p className="text-gray-600">Try adjusting your search or filter criteria</p>
            </div>
          ) : (
            filteredFiles.map(file => {
              const TypeIcon = getTypeIcon(file.type);
              return (
                <div key={file.id} className="flex items-center space-x-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={selectedFiles.includes(file.id)}
                    onChange={() => dispatch(toggleFileSelection(file.id))}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />

                  <div className="flex-shrink-0">
                    <div className={`p-2 rounded-lg bg-${getTypeColor(file.type)}-100`}>
                      <TypeIcon className={`h-5 w-5 text-${getTypeColor(file.type)}-600`} />
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="text-sm font-medium text-gray-900 truncate">{file.name}</h4>
                      <div className="flex items-center space-x-2">
                        <Badge variant={getTypeColor(file.type) as any} size="sm">
                          {file.type}
                        </Badge>
                        <Badge variant="gray" size="sm">
                          {file.vpnType}
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-4 text-sm text-gray-600">
                      <div className="flex items-center space-x-1">
                        <Server className="h-4 w-4" />
                        <span>{file.server}</span>
                      </div>
                      <span>{file.size}</span>
                      <span>{file.count.toLocaleString()} entries</span>
                      <span>Modified: {formatDate(new Date(file.lastModified), 'PPp')}</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Button size="sm" variant="ghost" onClick={() => handlePreview(file.id)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(file.name)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="primary" onClick={() => handleDownload(file.id)}>
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>

      {/* Results Overview */}
      <ScanResultsOverview />

      {/* Quick Actions */}
      <Card>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Button variant="secondary" className="w-full" onClick={() => setShowExportModal(true)}>
            <Download className="h-4 w-4 mr-2" />
            Export to CSV
          </Button>
          <Button variant="secondary" className="w-full">
            <Archive className="h-4 w-4 mr-2" />
            Create Archive
          </Button>
          <Button variant="secondary" className="w-full">
            <FileText className="h-4 w-4 mr-2" />
            Generate Report
          </Button>
          <Button variant="secondary" className="w-full">
            <Trash2 className="h-4 w-4 mr-2" />
            Cleanup Old Files
          </Button>
        </div>
      </Card>

      {/* Export Modal */}
      <EnhancedExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        data={getExportData()}
        title="Scan Results Report"
        onSaveTemplate={handleSaveTemplate}
        savedTemplates={savedTemplates}
      />
    </div>
  );
}