import React from 'react';
import { useAppDispatch } from '../../store';
import { setActiveTab } from '../../store/slices/uiSlice';

interface LinkProps {
  to: string;
  children: React.ReactNode;
  className?: string;
}

export function Link({ to, children, className = '' }: LinkProps) {
  const dispatch = useAppDispatch();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    dispatch(setActiveTab(to));
  };

  return (
    <a 
      href={`#${to}`} 
      onClick={handleClick}
      className={`text-primary-600 hover:text-primary-800 hover:underline ${className}`}
    >
      {children}
    </a>
  );
}