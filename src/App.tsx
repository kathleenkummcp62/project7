import React, { useState } from "react";
import { Toaster } from "react-hot-toast";
import { Sidebar } from "./components/layout/Sidebar";
import { Header } from "./components/layout/Header";
import { Dashboard } from "./components/tabs/Dashboard";
import { VPNTypes } from "./components/tabs/VPNTypes";
import { Servers } from "./components/tabs/Servers";
import { Generation } from "./components/tabs/Generation";
import { Upload } from "./components/tabs/Upload";
import { Processing } from "./components/tabs/Processing";
import { Results } from "./components/tabs/Results";
import { Monitoring } from "./components/tabs/Monitoring";
import { Database } from "./components/tabs/Database";
import { DataStore } from "./components/tabs/DataStore";
import { Terminal } from "./components/tabs/Terminal";
import { Settings } from "./components/tabs/Settings";
import { TestSuite } from "./components/testing/TestSuite";
import { SecurityAudit } from "./components/testing/SecurityAudit";
import { ScanResultsReport } from "./components/reports/ScanResultsReport";
import { TaskScheduler } from "./components/scheduling/TaskScheduler";
import { VPNImport } from "./components/tabs/VPNImport";
import { TaskCreator } from "./components/tabs/TaskCreator";
import { ResultsViewer } from "./components/tabs/ResultsViewer";
import { useAppSelector, useAppDispatch } from "./store";
import { setActiveTab } from "./store/slices/uiSlice";
import { AuthGuard } from "./components/auth/AuthGuard";
import { Breadcrumbs } from "./components/layout/Breadcrumbs";

function App() {
  const activeTab = useAppSelector(state => state.ui.activeTab);
  const dispatch = useAppDispatch();

  const handleTabChange = (tab: string) => {
    dispatch(setActiveTab(tab));
  };

  // Define required roles for each tab
  const getRequiredRole = (tab: string): 'admin' | 'user' | 'viewer' => {
    switch (tab) {
      case 'terminal':
      case 'database':
      case 'security':
        return 'admin';
      case 'servers':
      case 'generation':
      case 'upload':
      case 'processing':
      case 'data':
      case 'testing':
      case 'scheduler':
      case 'vpn-import':
      case 'task-creator':
      case 'settings':
        return 'user';
      default:
        return 'viewer';
    }
  };

  const renderContent = () => {
    // Get the required role for the active tab
    const requiredRole = getRequiredRole(activeTab);
    
    // Wrap the content in an AuthGuard with the required role
    const content = (
      <AuthGuard requiredRole={requiredRole}>
        {(() => {
          switch (activeTab) {
            case "dashboard":
              return <Dashboard />;
            case "vpn-types":
              return <VPNTypes />;
            case "servers":
              return <Servers />;
            case "generation":
              return <Generation />;
            case "upload":
              return <Upload />;
            case "processing":
              return <Processing />;
            case "results":
              return <Results />;
            case "monitoring":
              return <Monitoring />;
            case "data":
              return <DataStore />;
            case "database":
              return <Database />;
            case "terminal":
              return <Terminal />;
            case "settings":
              return <Settings />;
            case "testing":
              return <TestSuite />;
            case "security":
              return <SecurityAudit />;
            case "reports":
              return <ScanResultsReport />;
            case "scheduler":
              return <TaskScheduler />;
            case "vpn-import":
              return <VPNImport />;
            case "task-creator":
              return <TaskCreator />;
            case "results-viewer":
              return <ResultsViewer />;
            default:
              return <Dashboard />;
          }
        })()}
      </AuthGuard>
    );
    
    return content;
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar activeTab={activeTab} onTabChange={handleTabChange} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-auto">
          <div className="p-8">
            <Breadcrumbs activeTab={activeTab} />
            {renderContent()}
          </div>
        </main>
      </div>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: "#363636",
            color: "#fff",
          },
          success: {
            duration: 3000,
            iconTheme: {
              primary: "#22c55e",
              secondary: "#fff",
            },
          },
          error: {
            duration: 5000,
            iconTheme: {
              primary: "#ef4444",
              secondary: "#fff",
            },
          },
        }}
      />
    </div>
  );
}

export default App;