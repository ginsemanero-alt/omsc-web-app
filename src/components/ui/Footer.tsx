import React from "react";
import { Mail, Phone, MapPin } from "lucide-react";

const Footer: React.FC = () => {
  return (
    <footer className="bg-gray-900 text-gray-100 py-12">
      <div className="max-w-container mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          {/* About Section */}
          <div>
            <h3 className="text-h4 text-gray-100 mb-4">OMSC Guidance</h3>
            <p className="text-body-sm text-gray-300 leading-relaxed">
              Occidental Mindoro State University Guidance Information and Awareness System - 
              Supporting student development and institutional compliance with CHED standards.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-h4 text-gray-100 mb-4">Quick Links</h3>
            <ul className="space-y-2">
              <li>
                <a href="#" className="text-body-sm text-gray-300 hover:text-primary-foreground transition-colors duration-normal">
                  Programs
                </a>
              </li>
              <li>
                <a href="#" className="text-body-sm text-gray-300 hover:text-primary-foreground transition-colors duration-normal">
                  IEC Materials
                </a>
              </li>
              <li>
                <a href="#" className="text-body-sm text-gray-300 hover:text-primary-foreground transition-colors duration-normal">
                  Surveys
                </a>
              </li>
              <li>
                <a href="#" className="text-body-sm text-gray-300 hover:text-primary-foreground transition-colors duration-normal">
                  About Us
                </a>
              </li>
            </ul>
          </div>

          {/* Contact Info */}
          <div>
            <h3 className="text-h4 text-gray-100 mb-4">Contact Us</h3>
            <ul className="space-y-3">
              <li className="flex items-start space-x-3">
                <MapPin className="h-5 w-5 text-gray-300 mt-0.5 flex-shrink-0" strokeWidth={1.5} />
                <span className="text-body-sm text-gray-300">
                  San Jose, Occidental Mindoro, Philippines
                </span>
              </li>
              <li className="flex items-center space-x-3">
                <Phone className="h-5 w-5 text-gray-300 flex-shrink-0" strokeWidth={1.5} />
                <span className="text-body-sm text-gray-300">+63 (043) 123-4567</span>
              </li>
              <li className="flex items-center space-x-3">
                <Mail className="h-5 w-5 text-gray-300 flex-shrink-0" strokeWidth={1.5} />
                <span className="text-body-sm text-gray-300">guidance@omsc.edu.ph</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-gray-700 pt-6">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <p className="text-body-sm text-gray-400">
              © 2026 Occidental Mindoro State University. All rights reserved.
            </p>
            <div className="flex space-x-6">
              <a href="#" className="text-body-sm text-gray-400 hover:text-primary-foreground transition-colors duration-normal">
                Privacy Policy
              </a>
              <a href="#" className="text-body-sm text-gray-400 hover:text-primary-foreground transition-colors duration-normal">
                Accessibility
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;