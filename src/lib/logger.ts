import { supabase } from './supabase';

/**
 * Enterprise-Grade Global Audit Logger for OMSC Guidance & Seminar System
 * Automatically logs all navigation tabs visibility, CRUD matrix, and file extraction triggers.
 * * @param action Ang pangunahing operasyon o component tab identifier (e.g., 'Profiling Tab View')
 * @param details Detalyadong konteksto (e.g., 'Angela Malutao updated her Individual Inventory Form profile markers.')
 */
export async function createSystemLog(action: string, details: string) {
  try {
    // 1. Kuhanin ang active core session profiles mula sa localStorage
    const savedUser = localStorage.getItem('user');
    const userObj = savedUser ? JSON.parse(savedUser) : null;
    
    const userEmail = userObj?.email || localStorage.getItem('userEmail') || 'anonymous@omsc.edu.ph';
    const userRole = userObj?.role || 'user';
    const userCampus = userObj?.campus || 'Labangan';

    // Formulate a structured payload context description string
    const enrichedDetails = `[Role: ${userRole.toUpperCase()}] [Campus: ${userCampus}] - ${details}`;

    // 2. Direct INSERT execution injection payload block inside public.security_logs table
    const { error } = await supabase
      .from('security_logs')
      .insert([
        {
          action: action,
          user_email: userEmail,
          details: enrichedDetails,
          ip_address: '127.0.0.1', // Standard local area proxy loopback placeholder
          created_at: new Date().toISOString()
        }
      ]);

    if (error) {
      console.warn("[Logger Failover] Bypassing target to alternative secondary backup row logging layers.");
      // Automatic backup payload router structure link in case of table naming variations
      await supabase.from('system_logs').insert([
        { action, user_email: userEmail, details: enrichedDetails, created_at: new Date().toISOString() }
      ]);
    }
  } catch (err) {
    console.error('[Logger Crash Exception] Structural validation tracking breakdown:', err);
  }
}