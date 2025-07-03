import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { useAppSelector, useAppDispatch } from '../../store';
import { logout } from '../../store/slices/authSlice';
import { User, LogOut, Menu, X } from 'lucide-react';
import { toggleSidebar } from '../../store/slices/uiSlice';
import { NotificationBell } from '../notifications/NotificationCenter';
import { Tooltip } from '../ui/Tooltip';

export function Header() {
  const dispatch = useAppDispatch();
  const { user } = useAppSelector(state => state.auth);
  const { sidebarCollapsed } = useAppSelector(state => state.ui);
  const isConnected = useAppSelector(state => state.scanner.isConnected);
  
  const handleLogout = () => {
    dispatch(logout());
  };
  
  const handleToggleSidebar = () => {
    dispatch(toggleSidebar());
  };
  
  return (
    <header className="bg-white shadow-sm border-b border-gray-200 h-16 flex items-center px-4">
      <div className="flex-1 flex items-center">
        <Button 
          variant="ghost" 
          className="mr-2 p-2"
          onClick={handleToggleSidebar}
        >
          {sidebarCollapsed ? <Menu className="h-5 w-5" /> : <X className="h-5 w-5" />}
        </Button>
        
        <h1 className="text-xl font-semibold text-gray-800">VPN Bruteforce Dashboard</h1>
        
        <div className="ml-4 flex items-center">
          <Tooltip content={isConnected ? "Server connected" : "Server disconnected"}>
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-success-500 animate-pulse' : 'bg-error-500'}`}></div>
          </Tooltip>
        </div>
      </div>
      
      <div className="flex items-center space-x-4">
        <NotificationBell />
        
        <div className="flex items-center space-x-2">
          <Tooltip content={`Logged in as ${user?.username || 'Guest'} (${user?.role || 'Not logged in'})`}>
            <div className="bg-primary-100 rounded-full p-2">
              <User className="h-5 w-5 text-primary-600" />
            </div>
          </Tooltip>
          <div className="hidden md:block">
            <p className="text-sm font-medium text-gray-700">{user?.username || 'Guest'}</p>
            <p className="text-xs text-gray-500">{user?.role || 'Not logged in'}</p>
          </div>
        </div>
        
        <Tooltip content="Logout">
          <Button variant="ghost" onClick={handleLogout}>
            <LogOut className="h-5 w-5" />
          </Button>
        </Tooltip>
      </div>
    </header>
  );
}