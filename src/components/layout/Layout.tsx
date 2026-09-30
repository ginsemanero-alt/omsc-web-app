import React from 'react';
import SiteHeader from './SiteHeader';
import SiteFooter from './SiteFooter';

interface LayoutProps {
  children: React.ReactNode;
}

// Wraps every public page (Home, Programs, IEC Materials, About) with the
// shared navbar and footer, so they all look and behave the same.
const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen flex flex-col bg-[#EEF0FA]">
      <SiteHeader />
      <main className="flex-grow">{children}</main>
      <SiteFooter />
    </div>
  );
};

export default Layout;
