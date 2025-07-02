import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import Papa from 'papaparse';

export const exportContacts = async (contacts, filename = 'contacts_export.csv') => {
  try {
    // Convert contacts back to CSV
    const csv = Papa.unparse(contacts, {
      header: true,
      columns: ['name', 'company', 'email', 'phone', 'address', 'city', 'state', 'country', 'zip', 'balance']
    });

    // Create file URI
    const fileUri = FileSystem.documentDirectory + filename;
    
    // Write CSV to file
    await FileSystem.writeAsStringAsync(fileUri, csv, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    // Share the file
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/csv',
        dialogTitle: 'Export Contacts',
      });
    } else {
      throw new Error('Sharing is not available on this device');
    }

    return { success: true, message: 'Contacts exported successfully!' };
  } catch (error) {
    console.error('Export error:', error);
    return { success: false, message: error.message };
  }
};

export const exportFilteredContacts = async (contacts, searchQuery, filterBy) => {
  const filename = `contacts_${filterBy}_${new Date().toISOString().split('T')[0]}.csv`;
  return exportContacts(contacts, filename);
};
