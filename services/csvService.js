import Papa from 'papaparse';
import { config } from '../config';
import { downloadAndCacheCSV } from './cacheService';

// Robust CSV fetching with multiple fallback strategies
export const fetchCSVFromURL = async (url, attempt = 1) => {
  const maxAttempts = 3;
  const retryDelay = attempt * 1000; // Progressive delay
  
  try {
    console.log(`Fetching CSV from: ${url} (Attempt ${attempt}/${maxAttempts})`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'text/csv, text/plain, */*',
        'Cache-Control': 'no-cache',
        'User-Agent': 'ContactApp/1.0',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const csvText = await response.text();
    console.log(`CSV data received, length: ${csvText.length} chars`);
    
    if (csvText.length < 100) {
      throw new Error('CSV file appears to be empty or too small');
    }
    
    return parseCSVWithFallbacks(csvText);
    
  } catch (error) {
    console.error(`Attempt ${attempt} failed:`, error);
    
    if (attempt < maxAttempts) {
      console.log(`Retrying in ${retryDelay}ms...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      return fetchCSVFromURL(url, attempt + 1);
    }
    
    throw new Error(`Failed to fetch CSV after ${maxAttempts} attempts: ${error.message}`);
  }
};

// Enhanced CSV parsing with multiple strategies
export const parseCSVWithFallbacks = async (csvText) => {
  const strategies = [
    // Strategy 1: Standard parsing with enhanced options
    {
      name: 'Enhanced Standard',
      config: {
        header: true,
        skipEmptyLines: 'greedy',
        newline: '',
        quoteChar: '"',
        escapeChar: '"',
        delimiter: ',',
        fastMode: false,
        preview: 0,
        transformHeader: (header) => header.trim().replace(/\s+/g, '_'),
      }
    },
    // Strategy 2: Relaxed parsing for malformed CSV
    {
      name: 'Relaxed',
      config: {
        header: true,
        skipEmptyLines: true,
        newline: '',
        quoteChar: '"',
        escapeChar: '"',
        delimiter: ',',
        fastMode: false,
        preview: 0,
        transformHeader: (header) => header.trim().replace(/\s+/g, '_'),
        error: (error, file) => {
          console.warn('Parse warning (ignored):', error);
          return true; // Continue parsing despite errors
        }
      }
    },
    // Strategy 3: Manual line-by-line parsing for very problematic files
    {
      name: 'Manual',
      config: null // Will use custom parsing
    }
  ];

  for (const strategy of strategies) {
    try {
      console.log(`Trying parsing strategy: ${strategy.name}`);
      
      if (strategy.name === 'Manual') {
        return await manualCSVParse(csvText);
      }
      
      const result = await new Promise((resolve, reject) => {
        Papa.parse(csvText, {
          ...strategy.config,
          complete: (results) => {
            console.log(`${strategy.name} parsing completed:`, {
              totalRows: results.data.length,
              errors: results.errors.length,
              fields: results.data[0] ? Object.keys(results.data[0]).length : 0
            });
            
            if (results.errors.length > 0) {
              console.warn('Parse errors:', results.errors.slice(0, 3));
            }
            
            // Validate results
            const validContacts = results.data.filter(contact => {
              const keys = Object.keys(contact);
              const hasName = contact.Name && contact.Name.trim() !== '';
              const hasEmail = contact.Email && contact.Email.trim() !== '';
              const hasPhone = contact.Phone && contact.Phone.trim() !== '';
              const hasCompany = contact['Company_name'] && contact['Company_name'].trim() !== '';
              
              return keys.length > 1 && (hasName || hasEmail || hasPhone || hasCompany);
            });
            
            console.log(`Valid contacts after filtering: ${validContacts.length}`);
            
            if (validContacts.length === 0) {
              reject(new Error('No valid contacts found after parsing'));
            } else {
              resolve(validContacts);
            }
          },
          error: (error) => {
            reject(error);
          }
        });
      });
      
      return result;
      
    } catch (error) {
      console.warn(`Strategy ${strategy.name} failed:`, error.message);
      continue;
    }
  }
  
  throw new Error('All parsing strategies failed');
};

// Manual CSV parsing for very problematic files
export const manualCSVParse = async (csvText) => {
  console.log('Using manual CSV parsing...');
  
  const lines = csvText.split('\n');
  if (lines.length < 2) {
    throw new Error('CSV has insufficient lines');
  }
  
  // Extract header
  const headerLine = lines[0].trim();
  const headers = headerLine.split(',').map(h => h.replace(/"/g, '').trim().replace(/\s+/g, '_'));
  
  console.log('Headers found:', headers);
  
  const contacts = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    try {
      // Simple CSV parsing - split by comma but respect quotes
      const values = [];
      let current = '';
      let inQuotes = false;
      
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim().replace(/^"|"$/g, ''));
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim().replace(/^"|"$/g, ''));
      
      // Create contact object
      const contact = {};
      for (let k = 0; k < Math.min(headers.length, values.length); k++) {
        contact[headers[k]] = values[k] || '';
      }
      
      // Only add if we have at least a name, email, or phone
      if (contact.Name || contact.Email || contact.Phone || contact['Company_name']) {
        contacts.push(contact);
      }
      
    } catch (err) {
      console.warn(`Skipping line ${i + 1} due to parsing error:`, err.message);
    }
  }
  
  console.log(`Manual parsing completed: ${contacts.length} contacts`);
  return contacts;
};

// Load local CSV (fallback)
export const loadLocalCSV = () => {
  const localCSVData = `Name,Company_name,Email,Phone,City,Country
John Doe,Tech Corp,john.doe@email.com,+1-555-0123,New York,USA
Jane Smith,Design Studio,jane.smith@email.com,+1-555-0124,Los Angeles,USA
Mike Johnson,Marketing Inc,mike.johnson@email.com,+1-555-0125,Chicago,USA
Sarah Wilson,Sales Co,sarah.wilson@email.com,+1-555-0126,Miami,USA
David Brown,Consulting Ltd,david.brown@email.com,+1-555-0127,Seattle,USA`;
  
  return new Promise((resolve) => {
    Papa.parse(localCSVData, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim().replace(/\s+/g, '_'),
      complete: (results) => {
        console.log('Local CSV parsed:', results.data.length, 'contacts');
        resolve(results.data);
      }
    });
  });
};

// Format phone number for display
export const formatPhone = (phone) => {
  if (!phone) return '';
  const cleaned = phone.toString().replace(/\D/g, '');
  if (cleaned.length === 10) {
    return cleaned.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3');
  }
  return phone;
};

// Enhanced contact formatting to handle various CSV structures
export const formatContact = (contact) => {
  // Handle different naming conventions found in the CSV
  const getName = () => {
    return contact.Name || 
           contact.name || 
           contact['Company_name'] || 
           contact['Company name'] ||
           contact.company ||
           'Unknown Contact';
  };
  
  const getCompany = () => {
    return contact['Company_name'] || 
           contact['Company name'] || 
           contact.company || 
           contact.organisation ||
           contact.Company ||
           '';
  };
  
  const getEmail = () => {
    return contact.Email || 
           contact.email || 
           contact['Email_Address'] ||
           '';
  };
  
  const getPhone = () => {
    const phone = contact.Phone || 
                  contact.phone || 
                  contact.mobile || 
                  contact.telephone ||
                  '';
    return formatPhone(phone);
  };
  
  const getAddress = () => {
    return contact['Street_Address'] || 
           contact['Street Address'] ||
           contact.address || 
           contact.Address ||
           '';
  };
  
  const getCity = () => {
    return contact.City || 
           contact.city || 
           '';
  };
  
  const getState = () => {
    return contact.State || 
           contact.state || 
           contact.province ||
           '';
  };
  
  const getCountry = () => {
    return contact.Country || 
           contact.country || 
           '';
  };
  
  const getBalance = () => {
    return contact['Open_balance'] || 
           contact['Open balance'] ||
           contact.balance || 
           '';
  };
  
  const formatted = {
    id: contact.id || `${getName()}_${getEmail()}`.replace(/\s/g, '_'),
    name: getName(),
    email: getEmail(),
    phone: getPhone(),
    company: getCompany(),
    address: getAddress(),
    city: getCity(),
    state: getState(),
    country: getCountry(),
    zip: contact.Zip || contact.zip || contact.postal_code || '',
    balance: getBalance(),
    // Keep original data for debugging
    _original: contact,
  };
  
  return formatted;
};

// Enhanced contact retrieval with caching and fallbacks
let cachedContacts = null;
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export const getContacts = async (forceRefresh = false) => {
  const now = Date.now();
  
  // Return cached data if available and not expired
  if (!forceRefresh && cachedContacts && (now - lastFetchTime) < CACHE_DURATION) {
    console.log('Returning cached contacts');
    return cachedContacts;
  }
  
  try {
    let contacts = [];
    
    if (config.useLocalCSV) {
      console.log('Using local CSV data');
      contacts = await loadLocalCSV();
    } else {
      console.log('Fetching CSV from URL with robust handling');
      
      try {
        // Try primary URL
        contacts = await fetchCSVFromURL(config.csvUrl);
      } catch (primaryError) {
        console.warn('Primary URL failed:', primaryError.message);
        
        // Try alternative approaches
        try {
          // Approach 1: Try downloading and caching
          console.log('Trying download and cache method...');
          const csvText = await downloadAndCacheCSV();
          contacts = await parseCSVWithFallbacks(csvText);
          
        } catch (cacheError) {
          console.warn('Cache download failed:', cacheError.message);
          
          try {
            // Approach 2: Try with different headers
            console.log('Trying alternative fetch method...');
            const response = await fetch(config.csvUrl, {
              method: 'GET',
              headers: {
                'Accept': '*/*',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              },
              mode: 'cors',
            });
            
            if (response.ok) {
              const csvText = await response.text();
              contacts = await parseCSVWithFallbacks(csvText);
            } else {
              throw new Error(`Alternative fetch failed: ${response.status}`);
            }
            
          } catch (altError) {
            console.warn('Alternative fetch failed:', altError.message);
            
            // Approach 3: Try using a CORS proxy
            try {
              console.log('Trying CORS proxy...');
              const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(config.csvUrl)}`;
              const proxyResponse = await fetch(proxyUrl);
              
              if (proxyResponse.ok) {
                const data = await proxyResponse.json();
                contacts = await parseCSVWithFallbacks(data.contents);
              } else {
                throw new Error('CORS proxy failed');
              }
              
            } catch (proxyError) {
              console.warn('CORS proxy failed:', proxyError.message);
              
              // Final fallback: Use local data
              console.log('All remote methods failed, using local fallback');
              contacts = await loadLocalCSV();
            }
          }
        }
      }
    }
    
    // Format and validate contacts
    const formattedContacts = contacts.map(formatContact).filter(contact => {
      // Ensure we have at least some meaningful data
      return contact.name !== 'Unknown Contact' || contact.email || contact.phone || contact.company;
    });
    
    console.log(`Successfully loaded ${formattedContacts.length} valid contacts`);
    
    // Cache the results
    cachedContacts = formattedContacts;
    lastFetchTime = now;
    
    return formattedContacts;
    
  } catch (error) {
    console.error('All contact loading methods failed:', error);
    
    // If we have cached data, return it even if expired
    if (cachedContacts) {
      console.log('Returning expired cached data as last resort');
      return cachedContacts;
    }
    
    // Absolute fallback: return local data
    console.log('Using local fallback data');
    const fallbackContacts = await loadLocalCSV();
    return fallbackContacts.map(formatContact);
  }
};

// Clear cache function (can be called manually)
export const clearContactsCache = () => {
  cachedContacts = null;
  lastFetchTime = 0;
  console.log('Contacts cache cleared');
};
