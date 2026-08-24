import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
// @ts-ignore
import './index.css' // 🌟 FILLED FIXED PATH: May tuldok at slash na para basahin si src/index.css mo!
import { createSystemLog } from './lib/logger' 

// =========================================================
// 🌟 GLOBAL OPERATIONS MATRIX NETWORK INTERCEPTOR
// =========================================================
const originalFetch = window.fetch;

window.fetch = async function (input, init) {
  const response = await originalFetch(input, init);
  
  // Haharangin lang natin ang mga matagumpay na data modifications (POST, PUT, DELETE)
  if (init && init.method && ['POST', 'PUT', 'DELETE'].includes(init.method.toUpperCase()) && response.ok) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : '';
    const method = init.method.toUpperCase();

    // 🧠 AUTOMATED TRANSACTION SEMANTIC MAPPING ENGINE
    if (url.includes('/admin/programs') || url.includes('/counselor/programs') || url.includes('/programs')) {
      if (method === 'POST') {
        createSystemLog("Program Creation Successful", "Counselor published a new institutional activity tracking row record.");
      } else if (method === 'PUT') {
        createSystemLog("Program Update Successful", "Counselor modified core event configurations, capacity lines, or schedule timestamps.");
      } else if (method === 'DELETE') {
        createSystemLog("Critical Purge Executed", "Counselor wiped an active seminar entry catalog from the system registry.");
      }
    } 
    
    else if (url.includes('/register') || url.includes('/enroll') || url.includes('/registrations')) {
      if (method === 'POST') {
        createSystemLog("Program Catalog Engagement", "Student successfully committed registration metrics to register in an active seminar slot.");
      } else if (method === 'PUT') {
        createSystemLog("Registrants Ledger Checked", "Counselor updated student verification status row parameter logs inside the attendance ledger.");
      }
    } 
    
    else if (url.includes('/profile') || url.includes('/users/update') || url.includes('/users')) {
      createSystemLog("Student Profiling Form Modified", "User session successfully committed updated profile info sheets to the individual inventory registry.");
    } 
    
    else if (url.includes('/reviews') || url.includes('/feedback') || url.includes('/survey_responses')) {
      createSystemLog("Survey Evaluation Response Submitted", "Student dispatched evaluation survey feedback rating score tracking row to the repository.");
    }
    
    else if (url.includes('/inquiries')) {
      if (method === 'POST') {
        createSystemLog("Student Inquiry Ticket Sent", "Student dispatched a new private support query ticket context to the counselor helpdesk room.");
      } else if (method === 'PUT') {
        createSystemLog("Counseling Inquiry Panel Checked", "Counselor published a reply patch to resolve a pending student workspace ticket.");
      }
    }
    
    else if (url.includes('/materials')) {
      createSystemLog("Materials Bucket File Uploaded", "Counselor uploaded a new reference handout file asset or certificate template layout onto storage servers.");
    }
  }

  return response;
};

// =========================================================
// 🚀 STANDARD REACT DOM RENDER MOUNT
// =========================================================
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)