import React from "react";
import { Link } from "react-router-dom";
import { Mail, Phone, MapPin, Facebook } from "lucide-react";

const Footer: React.FC = () => {
  return (
    <footer className="bg-gray-900 text-gray-100 py-12">
      <div className="max-w-container mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          {/* About Section */}
          <div>
            <h3 className="text-h4 text-gray-100 mb-4">OMSU Guidance</h3>
            <p className="text-body-sm text-gray-300 leading-relaxed">
              Occidental Mindoro State University Guidance Information and Awareness System &mdash;
              supporting student development and institutional compliance with CHED standards.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-h4 text-gray-100 mb-4">Quick Links</h3>
            <ul className="space-y-2">
              <li>
                <Link to="/programs" className="text-body-sm text-gray-300 hover:text-white transition-colors">
                  Programs
                </Link>
              </li>
              <li>
                <Link to="/materials" className="text-body-sm text-gray-300 hover:text-white transition-colors">
                  IEC Materials
                </Link>
              </li>
              <li>
                <Link to="/about" className="text-body-sm text-gray-300 hover:text-white transition-colors">
                  About Us
                </Link>
              </li>
              <li>
                <Link to="/login" className="text-body-sm text-gray-300 hover:text-white transition-colors">
                  Login
                </Link>
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
                <span className="text-body-sm text-gray-300">(043) 491-0925 / 0963 208 6253</span>
              </li>
              <li className="flex items-center space-x-3">
                <Mail className="h-5 w-5 text-gray-300 flex-shrink-0" strokeWidth={1.5} />
                <span className="text-body-sm text-gray-300">guidanceofficeomsc@gmail.com</span>
              </li>
              <li className="flex items-center space-x-3">
                <Facebook className="h-5 w-5 text-gray-300 flex-shrink-0" strokeWidth={1.5} />
                <span className="text-body-sm text-gray-300">OMSU Guidance and Testing Center</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-gray-700 pt-6">
          <p className="text-body-sm text-gray-400 text-center md:text-left">
            © 2026 Occidental Mindoro State University. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
