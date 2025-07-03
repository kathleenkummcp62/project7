import React, { useState, useEffect, useMemo } from 'react';
import { Card } from './Card';
import { Button } from './Button';
import { Pagination } from './Pagination';
import { Search, Filter, RefreshCw, Download, Trash2, AlertCircle } from 'lucide-react';
import { DataDisplay } from './DataDisplay';
import { DateTimeDisplay } from './DateTimeDisplay';
import { useDataRefresh } from '../../services/DataRefreshService';
import { ConfirmDialog } from './ConfirmDialog';
import { EnhancedExportModal } from '../export/EnhancedExportModal';

interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  type?: 'text' | 'number' | 'date' | 'datetime' | 'boolean' | 'custom';
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyField: keyof T;
  title?: string;
  loading?: boolean;
  pagination?: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    onPageSizeChange?: (pageSize: number) => void;
  };
  search?: {
    value: string;
    onChange: (value: string) => void;
    onSearch: () => void;
    placeholder?: string;
  };
  filters?: React.ReactNode;
  actions?: React.ReactNode;
  onRefresh?: () => Promise<void>;
  refreshInterval?: number;
  onExport?: () => void;
  selectable?: boolean;
  selectedRows?: T[];
  onSelectRow?: (row: T) => void;
  onSelectAll?: () => void;
  onClearSelection?: () => void;
  bulkActions?: React.ReactNode;
  emptyState?: React.ReactNode;
  error?: string | null;
  onRetry?: () => void;
  exportColumns?: { key: string; header: string }[];
}

export function DataTable<T>({
  columns,
  data,
  keyField,
  title,
  loading = false,
  pagination,
  search,
  filters,
  actions,
  onRefresh,
  refreshInterval = 0,
  onExport,
  selectable = false,
  selectedRows = [],
  onSelectRow,
  onSelectAll,
  onClearSelection,
  bulkActions,
  emptyState,
  error,
  onRetry,
  exportColumns
}: DataTableProps<T>) {
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [showExportModal, setShowExportModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [savedTemplates, setSavedTemplates] = useState<any[]>([]);
  
  // Setup data refresh
  const dataRefresh = useDataRefresh({
    interval: refreshInterval,
    enabled: refreshInterval > 0,
    onRefresh: async () => {
      if (onRefresh) {
        await onRefresh();
      }
    },
    notifyOnError: true
  });

  // Load saved export templates
  useEffect(() => {
    const savedTemplatesJson = localStorage.getItem('exportTemplates');
    if (savedTemplatesJson) {
      try {
        setSavedTemplates(JSON.parse(savedTemplatesJson));
      } catch (error) {
        console.error('Error loading saved templates:', error);
      }
    }
  }, []);
  
  // Sort data if sortColumn is set
  const sortedData = useMemo(() => {
    if (!sortColumn) return data;
    
    return [...data].sort((a, b) => {
      const aValue = a[sortColumn as keyof T];
      const bValue = b[sortColumn as keyof T];
      
      if (aValue === bValue) return 0;
      
      // Handle different types of values
      if (aValue instanceof Date && bValue instanceof Date) {
        return sortDirection === 'asc' 
          ? aValue.getTime() - bValue.getTime() 
          : bValue.getTime() - aValue.getTime();
      }
      
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' 
          ? aValue.localeCompare(bValue) 
          : bValue.localeCompare(aValue);
      }
      
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
      }
      
      // Default comparison
      const result = aValue < bValue ? -1 : 1;
      return sortDirection === 'asc' ? result : -result;
    });
  }, [data, sortColumn, sortDirection]);
  
  // Handle sort
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      // Toggle direction
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new sort column
      setSortColumn(column);
      setSortDirection('asc');
    }
  };
  
  // Check if a row is selected
  const isSelected = (row: T) => {
    return selectedRows.some(selectedRow => selectedRow[keyField] === row[keyField]);
  };
  
  // Check if all rows are selected
  const isAllSelected = data.length > 0 && selectedRows.length === data.length;
  
  // Handle export
  const handleExport = () => {
    if (onExport) {
      onExport();
    } else {
      setShowExportModal(true);
    }
  };

  // Handle save template
  const handleSaveTemplate = (template: any) => {
    const updatedTemplates = [...savedTemplates, template];
    setSavedTemplates(updatedTemplates);
    
    // Save to localStorage
    localStorage.setItem('exportTemplates', JSON.stringify(updatedTemplates));
    
    toast.success('Export template saved successfully');
  };
  
  // Default empty state
  const defaultEmptyState = (
    <div className="text-center py-12">
      <div className="mx-auto h-12 w-12 text-gray-400">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
          />
        </svg>
      </div>
      <h3 className="mt-2 text-sm font-medium text-gray-900">No data</h3>
      <p className="mt-1 text-sm text-gray-500">
        No data available to display.
      </p>
    </div>
  );

  // Prepare data for export
  const getExportData = () => {
    return sortedData.map(row => {
      const exportRow: Record<string, any> = {};
      
      columns.forEach(column => {
        if (column.type === 'custom' && column.render) {
          // For custom columns, try to extract a plain value
          const renderedValue = column.render(row);
          if (React.isValidElement(renderedValue)) {
            // If it's a React element, try to get the text content
            exportRow[column.header] = 'Custom value';
          } else {
            exportRow[column.header] = renderedValue;
          }
        } else {
          exportRow[column.header] = row[column.key as keyof T];
        }
      });
      
      return exportRow;
    });
  };
  
  return (
    <Card>
      {/* Header */}
      {(title || search || filters || actions || onRefresh || onExport) && (
        <div className="mb-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
            {title && (
              <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            )}
            
            <div className="flex flex-col md:flex-row md:items-center space-y-2 md:space-y-0 md:space-x-2">
              {search && (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder={search.placeholder || "Search..."}
                    value={search.value}
                    onChange={(e) => search.onChange(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && search.onSearch()}
                    className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
              )}
              
              {filters && (
                <div className="flex items-center space-x-2">
                  <Filter className="h-4 w-4 text-gray-400" />
                  {filters}
                </div>
              )}
              
              {refreshInterval > 0 && (
                <div className="text-xs text-gray-500 flex items-center">
                  <RefreshCw className="h-3 w-3 mr-1" />
                  <span>
                    Auto-refresh: {refreshInterval / 1000}s
                    {dataRefresh.lastRefresh && (
                      <> • Last: <DateTimeDisplay date={dataRefresh.lastRefresh} type="relative" /></>
                    )}
                  </span>
                </div>
              )}
              
              {onRefresh && (
                <Button 
                  variant="ghost" 
                  onClick={() => dataRefresh.refresh()} 
                  loading={dataRefresh.isRefreshing || loading}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              )}
              
              {onExport && (
                <Button variant="ghost" onClick={handleExport} disabled={loading || data.length === 0}>
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              )}
              
              {actions}
            </div>
          </div>
        </div>
      )}
      
      {/* Error State */}
      {error && (
        <div className="mb-4 p-4 bg-error-50 border border-error-200 rounded-lg">
          <div className="flex items-start space-x-3">
            <AlertCircle className="h-5 w-5 text-error-600 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-medium text-error-800">Error loading data</h4>
              <p className="text-sm text-error-700 mt-1">{error}</p>
              {onRetry && (
                <Button 
                  variant="error" 
                  size="sm" 
                  className="mt-2"
                  onClick={onRetry}
                >
                  Retry
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Bulk Actions */}
      {selectable && selectedRows.length > 0 && (
        <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">
              {selectedRows.length} item{selectedRows.length !== 1 ? 's' : ''} selected
            </span>
            <div className="flex items-center space-x-2">
              {bulkActions}
              <Button size="sm" variant="ghost" onClick={onClearSelection}>
                <Trash2 className="h-4 w-4 mr-1" />
                Clear
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {selectable && onSelectRow && (
                <th className="px-6 py-3 w-12">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={onSelectAll}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                </th>
              )}
              
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${
                    column.sortable ? 'cursor-pointer hover:bg-gray-100' : ''
                  } ${column.width ? column.width : ''}`}
                  onClick={() => column.sortable && handleSort(column.key)}
                >
                  <div className="flex items-center space-x-1">
                    <span>{column.header}</span>
                    {column.sortable && sortColumn === column.key && (
                      <span>
                        {sortDirection === 'asc' ? '▲' : '▼'}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  className="px-6 py-4 text-center text-sm text-gray-500"
                >
                  <div className="flex items-center justify-center space-x-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-primary-600"></div>
                    <span>Loading...</span>
                  </div>
                </td>
              </tr>
            ) : sortedData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  className="px-6 py-4"
                >
                  {emptyState || defaultEmptyState}
                </td>
              </tr>
            ) : (
              sortedData.map((row) => (
                <tr
                  key={String(row[keyField])}
                  className={`hover:bg-gray-50 ${isSelected(row) ? 'bg-primary-50' : ''}`}
                >
                  {selectable && onSelectRow && (
                    <td className="px-6 py-4 whitespace-nowrap w-12">
                      <input
                        type="checkbox"
                        checked={isSelected(row)}
                        onChange={() => onSelectRow(row)}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                    </td>
                  )}
                  
                  {columns.map((column) => (
                    <td key={column.key} className="px-6 py-4 whitespace-nowrap">
                      {column.render ? (
                        column.render(row)
                      ) : (
                        renderCellValue(row[column.key as keyof T], column.type)
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      {/* Pagination */}
      {pagination && (
        <div className="mt-4">
          <Pagination
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            onPageChange={pagination.onPageChange}
            totalItems={pagination.totalItems}
            pageSize={pagination.pageSize}
            onPageSizeChange={pagination.onPageSizeChange}
          />
        </div>
      )}

      {/* Export Modal */}
      {showExportModal && (
        <EnhancedExportModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          data={getExportData()}
          title={title || 'Data Export'}
          columns={exportColumns}
          onSaveTemplate={handleSaveTemplate}
          savedTemplates={savedTemplates}
        />
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => {
          // Handle delete confirmation
          setShowDeleteConfirm(false);
        }}
        title="Confirm Delete"
        message={`Are you sure you want to delete ${selectedRows.length} selected item${selectedRows.length !== 1 ? 's' : ''}? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        type="danger"
      />
    </Card>
  );
}

// Helper function to render cell values based on type
function renderCellValue(value: any, type?: string) {
  if (value === null || value === undefined) {
    return <span className="text-gray-400">—</span>;
  }
  
  switch (type) {
    case 'number':
      return <DataDisplay value={value} type="number" />;
    
    case 'date':
      return <DateTimeDisplay date={value} type="date" />;
    
    case 'datetime':
      return <DateTimeDisplay date={value} type="datetime" />;
    
    case 'boolean':
      return value ? (
        <span className="text-success-600">Yes</span>
      ) : (
        <span className="text-error-600">No</span>
      );
    
    default:
      return String(value);
  }
}