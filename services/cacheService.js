import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { config } from '../config';

// Alternative data loading strategy: Download and cache locally
export const downloadAndCacheCSV = async () => {
  const cacheFileUri = `${FileSystem.documentDirectory}contacts_cache.csv`;
  const cacheInfoUri = `${FileSystem.documentDirectory}contacts_cache_info.json`;
  
  try {
    // Check if we have a recent cached version
    const cacheInfo = await FileSystem.getInfoAsync(cacheInfoUri);
    if (cacheInfo.exists) {
      const infoContent = await FileSystem.readAsStringAsync(cacheInfoUri);
      const info = JSON.parse(infoContent);
      const cacheAge = Date.now() - info.timestamp;
      
      // If cache is less than 10 minutes old, use it
      if (cacheAge < 600000) { // 10 minutes
        console.log('Using cached CSV file');
        const cachedData = await FileSystem.readAsStringAsync(cacheFileUri);
        return cachedData;
      }
    }
    
    console.log('Downloading fresh CSV data...');
    
    // Download the CSV file
    const downloadResult = await FileSystem.downloadAsync(
      config.csvUrl,
      cacheFileUri
    );
    
    if (downloadResult.status === 200) {
      // Save cache info
      const cacheInfo = {
        timestamp: Date.now(),
        size: downloadResult.headers['Content-Length'] || '0',
        url: config.csvUrl
      };
      await FileSystem.writeAsStringAsync(cacheInfoUri, JSON.stringify(cacheInfo));
      
      // Read and return the data
      const csvData = await FileSystem.readAsStringAsync(cacheFileUri);
      console.log(`Downloaded and cached ${csvData.length} characters`);
      return csvData;
    } else {
      throw new Error(`Download failed with status ${downloadResult.status}`);
    }
    
  } catch (error) {
    console.error('Error downloading CSV:', error);
    
    // Try to use cached version even if expired
    const cacheFile = await FileSystem.getInfoAsync(cacheFileUri);
    if (cacheFile.exists) {
      console.log('Using expired cached data as fallback');
      return await FileSystem.readAsStringAsync(cacheFileUri);
    }
    
    throw error;
  }
};

// Clean up cache files
export const clearCache = async () => {
  const cacheFileUri = `${FileSystem.documentDirectory}contacts_cache.csv`;
  const cacheInfoUri = `${FileSystem.documentDirectory}contacts_cache_info.json`;
  
  try {
    await FileSystem.deleteAsync(cacheFileUri, { idempotent: true });
    await FileSystem.deleteAsync(cacheInfoUri, { idempotent: true });
    console.log('Cache cleared');
  } catch (error) {
    console.warn('Error clearing cache:', error);
  }
};

// Export cache file for debugging
export const exportCacheFile = async () => {
  const cacheFileUri = `${FileSystem.documentDirectory}contacts_cache.csv`;
  
  try {
    const cacheFile = await FileSystem.getInfoAsync(cacheFileUri);
    if (cacheFile.exists && Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(cacheFileUri, {
        mimeType: 'text/csv',
        dialogTitle: 'Export Cached CSV Data'
      });
    } else {
      throw new Error('Cache file not found or sharing not available');
    }
  } catch (error) {
    console.error('Error exporting cache file:', error);
    throw error;
  }
};
