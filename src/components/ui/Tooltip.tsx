import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  children: React.ReactNode;
  content: React.ReactNode;
  position?: 'top' | 'right' | 'bottom' | 'left';
  delay?: number;
  className?: string;
}

export function Tooltip({
  children,
  content,
  position = 'top',
  delay = 300,
  className = '',
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const [arrowPosition, setArrowPosition] = useState({ top: 0, left: 0 });
  const childRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();

  const showTooltip = () => {
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delay);
  };

  const hideTooltip = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
  };

  useEffect(() => {
    if (isVisible && childRef.current && tooltipRef.current) {
      const childRect = childRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      const scrollX = window.scrollX || document.documentElement.scrollLeft;
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      
      // Calculate initial position based on preferred position
      let top = 0;
      let left = 0;
      
      switch (position) {
        case 'top':
          top = childRect.top + scrollY - tooltipRect.height - 8;
          left = childRect.left + scrollX + (childRect.width / 2) - (tooltipRect.width / 2);
          break;
        case 'right':
          top = childRect.top + scrollY + (childRect.height / 2) - (tooltipRect.height / 2);
          left = childRect.right + scrollX + 8;
          break;
        case 'bottom':
          top = childRect.bottom + scrollY + 8;
          left = childRect.left + scrollX + (childRect.width / 2) - (tooltipRect.width / 2);
          break;
        case 'left':
          top = childRect.top + scrollY + (childRect.height / 2) - (tooltipRect.height / 2);
          left = childRect.left + scrollX - tooltipRect.width - 8;
          break;
      }
      
      // Check if tooltip is outside viewport and adjust if needed
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      // Adjust horizontal position if needed
      if (left < scrollX) {
        left = scrollX + 8;
      } else if (left + tooltipRect.width > scrollX + viewportWidth) {
        left = scrollX + viewportWidth - tooltipRect.width - 8;
      }
      
      // Adjust vertical position if needed
      if (top < scrollY) {
        // If tooltip is above viewport, flip to bottom
        if (position === 'top') {
          top = childRect.bottom + scrollY + 8;
        } else {
          top = scrollY + 8;
        }
      } else if (top + tooltipRect.height > scrollY + viewportHeight) {
        // If tooltip is below viewport, flip to top
        if (position === 'bottom') {
          top = childRect.top + scrollY - tooltipRect.height - 8;
        } else {
          top = scrollY + viewportHeight - tooltipRect.height - 8;
        }
      }
      
      // Calculate arrow position
      let arrowTop = 0;
      let arrowLeft = 0;
      
      switch (position) {
        case 'top':
        case 'bottom':
          arrowLeft = childRect.left + (childRect.width / 2) - left;
          break;
        case 'left':
        case 'right':
          arrowTop = childRect.top + (childRect.height / 2) - top;
          break;
      }
      
      setTooltipPosition({ top, left });
      setArrowPosition({ top: arrowTop, left: arrowLeft });
    }
  }, [isVisible, position]);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <>
      <div
        ref={childRef}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        className="inline-block"
      >
        {children}
      </div>
      
      {isVisible && createPortal(
        <div
          ref={tooltipRef}
          className={`fixed z-50 px-3 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg shadow-sm max-w-xs ${className}`}
          style={{
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
          }}
          role="tooltip"
        >
          {content}
          <div
            className={`absolute w-2 h-2 bg-gray-900 transform rotate-45 ${
              position === 'top' ? 'bottom-0 -mb-1' :
              position === 'right' ? 'left-0 -ml-1' :
              position === 'bottom' ? 'top-0 -mt-1' :
              'right-0 -mr-1'
            }`}
            style={{
              ...(position === 'left' || position === 'right' ? { top: `${arrowPosition.top}px` } : {}),
              ...(position === 'top' || position === 'bottom' ? { left: `${arrowPosition.left}px` } : {}),
            }}
          />
        </div>,
        document.body
      )}
    </>
  );
}