import React, { useState, useEffect, useRef } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { 
  Download, 
  FileText, 
  FileSpreadsheet, 
  File as FilePdf, 
  X, 
  Check,
  Settings,
  Calendar,
  Clock,
  Save
} from 'lucide-react';
import { saveAs } from 'file-saver';
import { utils, writeFile } from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import toast from 'react-hot-toast';
import { format as formatDate } from 'date-fns';
import { FormField } from '../ui/FormField';
import { ConfirmDialog } from '../ui/ConfirmDialog';

interface ExportColumn {
  key: string;
  header: string;
  include: boolean;
  format?: (value: any) => string;
}

interface ExportTemplate {
  id: string;
  name: string;
  format: 'csv' | 'excel' | 'pdf' | 'json' | 'txt';
  columns: ExportColumn[];
  dateFormat: string;
  includeTimestamp: boolean;
}

interface EnhancedExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: any[];
  title: string;
  filename?: string;
  columns?: { key: string; header: string }[];
  onSaveTemplate?: (template: ExportTemplate) => void;
  savedTemplates?: ExportTemplate[];
}

export function EnhancedExportModal({ 
  isOpen, 
  onClose, 
  data, 
  title, 
  filename,
  columns: initialColumns,
  onSaveTemplate,
  savedTemplates = []
}: EnhancedExportModalProps) {
  const [exportFormat, setExportFormat] = useState<'csv' | 'excel' | 'pdf' | 'json' | 'txt'>('csv');
  const [loading, setLoading] = useState(false);
  const [columns, setColumns] = useState<ExportColumn[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [dateFormat, setDateFormat] = useState('yyyy-MM-dd HH:mm:ss');
  const [includeTimestamp, setIncludeTimestamp] = useState(true);
  const [templateName, setTemplateName] = useState('');
  const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');

  // Initialize columns from props
  useEffect(() => {
    if (initialColumns && initialColumns.length > 0) {
      setColumns(initialColumns.map(col => ({
        key: col.key,
        header: col.header,
        include: true
      })));
    } else if (data.length > 0) {
      // If no columns provided, extract from data
      const firstItem = data[0];
      setColumns(Object.keys(firstItem).map(key => ({
        key,
        header: key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1'),
        include: true
      })));
    }
  }, [initialColumns, data]);

  if (!isOpen) return null;

  const getDefaultFilename = () => {
    const timestamp = formatDate(new Date(), 'yyyyMMdd_HHmmss');
    const baseFilename = filename || `${title.toLowerCase().replace(/\s+/g, '-')}-${timestamp}`;
    return baseFilename;
  };

  const toggleColumn = (key: string) => {
    setColumns(columns.map(col => 
      col.key === key ? { ...col, include: !col.include } : col
    ));
  };

  const selectAllColumns = () => {
    setColumns(columns.map(col => ({ ...col, include: true })));
  };

  const deselectAllColumns = () => {
    setColumns(columns.map(col => ({ ...col, include: false })));
  };

  const loadTemplate = (templateId: string) => {
    const template = savedTemplates.find(t => t.id === templateId);
    if (template) {
      setExportFormat(template.format);
      setColumns(template.columns);
      setDateFormat(template.dateFormat);
      setIncludeTimestamp(template.includeTimestamp);
      setSelectedTemplate(templateId);
    }
  };

  const handleSaveTemplate = () => {
    if (!templateName.trim()) {
      toast.error('Please enter a template name');
      return;
    }

    const template: ExportTemplate = {
      id: Date.now().toString(),
      name: templateName,
      format: exportFormat,
      columns,
      dateFormat,
      includeTimestamp
    };

    if (onSaveTemplate) {
      onSaveTemplate(template);
    }

    toast.success('Template saved successfully');
    setShowSaveTemplateDialog(false);
    setTemplateName('');
  };

  const scheduleExport = () => {
    if (!scheduleDate || !scheduleTime) {
      toast.error('Please select date and time for scheduled export');
      return;
    }
    
    const scheduledTime = new Date(`${scheduleDate}T${scheduleTime}`);
    
    if (scheduledTime <= new Date()) {
      toast.error('Scheduled time must be in the future');
      return;
    }

    // In a real implementation, this would save the schedule to a database
    // For demo purposes, we'll just show a success message
    toast.success(`Export scheduled for ${formatDate(scheduledTime, 'PPpp')}`);
    setShowScheduleDialog(false);
  };

  const formatData = (dataToFormat: any[]) => {
    // Get only included columns
    const includedColumns = columns.filter(col => col.include);
    
    if (includedColumns.length === 0) {
      toast.error('Please select at least one column to export');
      return null;
    }

    // Format data according to settings
    return dataToFormat.map(item => {
      const formattedItem: Record<string, any> = {};
      
      includedColumns.forEach(col => {
        let value = item[col.key];
        
        // Format dates if the value looks like a date
        if (value && (value instanceof Date || (typeof value === 'string' && !isNaN(Date.parse(value))))) {
          try {
            value = formatDate(new Date(value), dateFormat);
          } catch (error) {
            // If formatting fails, use the original value
            console.error('Date formatting error:', error);
          }
        }
        
        formattedItem[col.header] = value;
      });
      
      // Add timestamp if enabled
      if (includeTimestamp) {
        formattedItem['Export Date'] = formatDate(new Date(), dateFormat);
      }
      
      return formattedItem;
    });
  };

  const handleExport = async () => {
    if (!data || data.length === 0) {
      toast.error('No data to export');
      return;
    }
    
    const formattedData = formatData(data);
    if (!formattedData) return;
    
    setLoading(true);
    try {
      const baseFilename = getDefaultFilename();

      switch (exportFormat) {
        case 'csv':
          exportCSV(formattedData, baseFilename);
          break;
        case 'excel':
          exportExcel(formattedData, baseFilename);
          break;
        case 'pdf':
          exportPDF(formattedData, baseFilename, title);
          break;
        case 'json':
          exportJSON(formattedData, baseFilename);
          break;
        case 'txt':
          exportTXT(formattedData, baseFilename);
          break;
      }

      toast.success(`Data exported as ${exportFormat.toUpperCase()}`);
      onClose();
    } catch (error) {
      console.error('Export error:', error);
      toast.error(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = (data: any[], filename: string) => {
    // Get column headers
    const headers = Object.keys(data[0]);
    
    // Get data rows
    const rows = data.map(row => 
      headers.map(header => {
        const value = row[header];
        return typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value;
      }).join(',')
    );
    
    // Create CSV content
    const csv = [headers.join(','), ...rows].join('\n');
    
    // Create and download file
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, `${filename}.csv`);
  };

  const exportExcel = (data: any[], filename: string) => {
    // Create workbook and worksheet
    const ws = utils.json_to_sheet(data);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Data');
    
    // Generate Excel file
    writeFile(wb, `${filename}.xlsx`);
  };

  const exportPDF = (data: any[], filename: string, title: string) => {
    // Create PDF document
    const doc = new jsPDF();
    
    // Add title
    doc.setFontSize(18);
    doc.text(title, 14, 22);
    
    // Add timestamp
    doc.setFontSize(10);
    doc.text(`Generated: ${formatDate(new Date(), 'PPpp')}`, 14, 30);
    
    // Prepare table data
    const headers = Object.keys(data[0]);
    const rows = data.map(row => headers.map(header => String(row[header] || '')));
    
    // Add table
    autoTable(doc, {
      startY: 40,
      head: [headers],
      body: rows,
      theme: 'striped',
      headStyles: { fillColor: [41, 128, 185] },
    });
    
    // Save PDF
    doc.save(`${filename}.pdf`);
  };

  const exportJSON = (data: any[], filename: string) => {
    // Create and download file
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    saveAs(blob, `${filename}.json`);
  };

  const exportTXT = (data: any[], filename: string) => {
    // Format data as text
    const lines = data.map(item => {
      return Object.entries(item).map(([key, value]) => `${key}: ${value}`).join('\n') + '\n---';
    });
    
    // Create and download file
    const blob = new Blob([lines.join('\n\n')], { type: 'text/plain' });
    saveAs(blob, `${filename}.txt`);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-4xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">Export {title}</h3>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <div className="space-y-6">
          {/* Format Selection */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">Export Format</h4>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div 
                className={`p-4 border-2 rounded-lg cursor-pointer transition-all flex flex-col items-center ${
                  exportFormat === 'csv' ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setExportFormat('csv')}
              >
                <FileText className="h-8 w-8 text-primary-600 mb-2" />
                <span className="font-medium">CSV</span>
                <span className="text-xs text-gray-500">Comma Separated</span>
              </div>
              
              <div 
                className={`p-4 border-2 rounded-lg cursor-pointer transition-all flex flex-col items-center ${
                  exportFormat === 'excel' ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setExportFormat('excel')}
              >
                <FileSpreadsheet className="h-8 w-8 text-success-600 mb-2" />
                <span className="font-medium">Excel</span>
                <span className="text-xs text-gray-500">XLSX Spreadsheet</span>
              </div>
              
              <div 
                className={`p-4 border-2 rounded-lg cursor-pointer transition-all flex flex-col items-center ${
                  exportFormat === 'pdf' ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setExportFormat('pdf')}
              >
                <FilePdf className="h-8 w-8 text-error-600 mb-2" />
                <span className="font-medium">PDF</span>
                <span className="text-xs text-gray-500">Portable Document</span>
              </div>
              
              <div 
                className={`p-4 border-2 rounded-lg cursor-pointer transition-all flex flex-col items-center ${
                  exportFormat === 'json' ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setExportFormat('json')}
              >
                <FileText className="h-8 w-8 text-warning-600 mb-2" />
                <span className="font-medium">JSON</span>
                <span className="text-xs text-gray-500">Structured Data</span>
              </div>
              
              <div 
                className={`p-4 border-2 rounded-lg cursor-pointer transition-all flex flex-col items-center ${
                  exportFormat === 'txt' ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setExportFormat('txt')}
              >
                <FileText className="h-8 w-8 text-gray-600 mb-2" />
                <span className="font-medium">TXT</span>
                <span className="text-xs text-gray-500">Plain Text</span>
              </div>
            </div>
          </div>

          {/* Templates */}
          {savedTemplates.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-3">Saved Templates</h4>
              <div className="flex flex-wrap gap-2">
                {savedTemplates.map(template => (
                  <Badge 
                    key={template.id}
                    variant={selectedTemplate === template.id ? "primary" : "gray"}
                    className="cursor-pointer px-3 py-1"
                    onClick={() => loadTemplate(template.id)}
                  >
                    {template.name}
                    {selectedTemplate === template.id && (
                      <Check className="h-3 w-3 ml-1" />
                    )}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          
          {/* Column Selection */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-gray-700">Select Columns to Export</h4>
              <div className="flex space-x-2">
                <Button size="sm" variant="ghost" onClick={selectAllColumns}>
                  Select All
                </Button>
                <Button size="sm" variant="ghost" onClick={deselectAllColumns}>
                  Deselect All
                </Button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 max-h-60 overflow-y-auto p-2 border border-gray-200 rounded-lg">
              {columns.map(column => (
                <div key={column.key} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id={`col-${column.key}`}
                    checked={column.include}
                    onChange={() => toggleColumn(column.key)}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <label htmlFor={`col-${column.key}`} className="text-sm text-gray-700">
                    {column.header}
                  </label>
                </div>
              ))}
            </div>
          </div>
          
          {/* Advanced Options */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center text-sm text-primary-600 hover:text-primary-800"
            >
              <Settings className="h-4 w-4 mr-1" />
              {showAdvanced ? 'Hide Advanced Options' : 'Show Advanced Options'}
            </button>
            
            {showAdvanced && (
              <div className="mt-3 p-4 border border-gray-200 rounded-lg space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date Format
                  </label>
                  <select
                    value={dateFormat}
                    onChange={(e) => setDateFormat(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="yyyy-MM-dd HH:mm:ss">2023-01-31 14:30:00</option>
                    <option value="MM/dd/yyyy h:mm a">01/31/2023 2:30 PM</option>
                    <option value="dd/MM/yyyy HH:mm">31/01/2023 14:30</option>
                    <option value="MMMM d, yyyy">January 31, 2023</option>
                    <option value="PPpp">Jan 31, 2023, 2:30 PM</option>
                  </select>
                </div>
                
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="include-timestamp"
                    checked={includeTimestamp}
                    onChange={(e) => setIncludeTimestamp(e.target.checked)}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <label htmlFor="include-timestamp" className="ml-2 text-sm text-gray-700">
                    Include export timestamp in data
                  </label>
                </div>
              </div>
            )}
          </div>
          
          {/* Preview */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">Preview</h4>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      {columns.filter(col => col.include).map(column => (
                        <th
                          key={column.key}
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                        >
                          {column.header}
                        </th>
                      ))}
                      {includeTimestamp && (
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Export Date
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {data.slice(0, 3).map((item, index) => (
                      <tr key={index}>
                        {columns.filter(col => col.include).map(column => (
                          <td key={column.key} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {typeof item[column.key] === 'object' 
                              ? JSON.stringify(item[column.key]) 
                              : String(item[column.key] || '')}
                          </td>
                        ))}
                        {includeTimestamp && (
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {formatDate(new Date(), dateFormat)}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.length > 3 && (
                <div className="px-6 py-3 bg-gray-50 text-sm text-gray-500">
                  Showing 3 of {data.length} items
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex justify-between mt-6">
          <div className="space-x-2">
            <Button 
              variant="ghost" 
              onClick={() => setShowSaveTemplateDialog(true)}
            >
              <Save className="h-4 w-4 mr-2" />
              Save Template
            </Button>
            <Button 
              variant="ghost" 
              onClick={() => setShowScheduleDialog(true)}
            >
              <Calendar className="h-4 w-4 mr-2" />
              Schedule Export
            </Button>
          </div>
          
          <div className="flex space-x-3">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              variant="primary" 
              onClick={handleExport}
              loading={loading}
            >
              <Download className="h-4 w-4 mr-2" />
              Export as {exportFormat.toUpperCase()}
            </Button>
          </div>
        </div>
      </Card>

      {/* Save Template Dialog */}
      <ConfirmDialog
        isOpen={showSaveTemplateDialog}
        onClose={() => setShowSaveTemplateDialog(false)}
        onConfirm={handleSaveTemplate}
        title="Save Export Template"
        message="Save your current export settings as a template for future use."
        confirmLabel="Save Template"
        cancelLabel="Cancel"
        type="info"
      >
        <FormField label="Template Name" name="templateName">
          <input
            type="text"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            placeholder="Enter template name"
          />
        </FormField>
      </ConfirmDialog>

      {/* Schedule Export Dialog */}
      <ConfirmDialog
        isOpen={showScheduleDialog}
        onClose={() => setShowScheduleDialog(false)}
        onConfirm={scheduleExport}
        title="Schedule Export"
        message="Schedule this export to run automatically at a specific time."
        confirmLabel="Schedule"
        cancelLabel="Cancel"
        type="info"
      >
        <div className="space-y-4">
          <FormField label="Date" name="scheduleDate">
            <input
              type="date"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              min={formatDate(new Date(), 'yyyy-MM-dd')}
            />
          </FormField>
          
          <FormField label="Time" name="scheduleTime">
            <input
              type="time"
              value={scheduleTime}
              onChange={(e) => setScheduleTime(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </FormField>
          
          <FormField label="Format" name="scheduleFormat">
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as any)}
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="csv">CSV</option>
              <option value="excel">Excel</option>
              <option value="pdf">PDF</option>
              <option value="json">JSON</option>
              <option value="txt">TXT</option>
            </select>
          </FormField>
        </div>
      </ConfirmDialog>
    </div>
  );
}