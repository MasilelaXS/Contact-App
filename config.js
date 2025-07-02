// App Configuration
export const config = {
  // CSV Data Source URL
  csvUrl: 'http://support.ctecg.co.za/files/Customers.csv',
  
  // Alternative: Use local CSV for development/testing
  useLocalCSV: false, // Set to true to force local mode
  
  // Connection and retry settings
  maxRetries: 3,
  retryDelay: 2000, // 2 seconds base delay
  connectionTimeout: 15000, // 15 seconds
  
  // App Settings
  refreshInterval: 30000, // Auto-refresh every 30 seconds (30000ms)
  cacheTimeout: 300000, // Cache timeout: 5 minutes (300000ms)
  
  // CORS Proxy (fallback)
  corsProxy: 'https://api.allorigins.win/get?url=',
  
  // Colors
  colors: {
    primary: '#333333',
    accent: '#75A206',
    background: '#F5F5F5',
    surface: '#FFFFFF',
    text: '#333333',
    textSecondary: '#666666',
    success: '#75A206',
    error: '#D32F2F',
    warning: '#F59E0B',
    info: '#3B82F6'
  }
};
