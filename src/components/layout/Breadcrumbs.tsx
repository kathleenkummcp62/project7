import React from 'react';
import { ChevronRight, Home } from 'lucide-react';
import { Link } from './Link';

interface BreadcrumbsProps {
  activeTab: string;
  customPath?: { id: string; label: string }[];
}

export function Breadcrumbs({ activeTab, customPath }: BreadcrumbsProps) {
  // Define breadcrumb paths for complex workflows
  const getBreadcrumbPath = () => {
    if (customPath) {
      return customPath;
    }

    // Define default paths for each tab
    const tabLabels: Record<string, string> = {
      'dashboard': 'Dashboard',
      'vpn-types': 'VPN Types',
      'servers': 'Servers',
      'generation': 'Generation',
      'upload': 'Upload',
      'processing': 'Processing',
      'results': 'Results',
      'monitoring': 'Monitoring',
      'data': 'Data Store',
      'database': 'Database',
      'terminal': 'Terminal',
      'settings': 'Settings',
      'testing': 'Testing',
      'security': 'Security Audit',
      'reports': 'Reports',
      'scheduler': 'Task Scheduler',
      'vpn-import': 'Import/Export',
      'task-creator': 'Task Creator',
      'results-viewer': 'Results Viewer'
    };

    // For simple paths, just return Home > Current Tab
    return [
      { id: 'dashboard', label: 'Home' },
      { id: activeTab, label: tabLabels[activeTab] || 'Unknown' }
    ];
  };

  const path = getBreadcrumbPath();

  // Don't render breadcrumbs if we're on the dashboard
  if (activeTab === 'dashboard' && !customPath) {
    return null;
  }

  return (
    <nav className="flex mb-4" aria-label="Breadcrumb">
      <ol className="inline-flex items-center space-x-1 md:space-x-3">
        {path.map((item, index) => (
          <li key={item.id} className="inline-flex items-center">
            {index === 0 ? (
              <div className="inline-flex items-center text-sm font-medium text-gray-700 hover:text-primary-600">
                <Home className="mr-2 h-4 w-4" />
                <span>{item.label}</span>
              </div>
            ) : (
              <div className="flex items-center">
                <ChevronRight className="h-4 w-4 text-gray-400" />
                <span className="ml-1 text-sm font-medium text-gray-700 md:ml-2">
                  {item.label}
                </span>
              </div>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}