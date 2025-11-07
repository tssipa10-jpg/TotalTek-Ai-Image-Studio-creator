
import React from 'react';

interface IconProps {
  path: string;
  className?: string;
}

export const Icon: React.FC<IconProps> = ({ path, className = "w-6 h-6" }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path fillRule="evenodd" d={path} clipRule="evenodd" />
  </svg>
);
