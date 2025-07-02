import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Linking,
  Modal,
  ScrollView,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getContacts, clearContactsCache } from './services/csvService';
import { exportFilteredContacts } from './services/exportService';
import { config } from './config';

const { width, height } = Dimensions.get('window');

function ContactApp() {
  const insets = useSafeAreaInsets();
  const [contacts, setContacts] = useState([]);
  const [filteredContacts, setFilteredContacts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [selectedContact, setSelectedContact] = useState(null);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
  const [filterBy, setFilterBy] = useState('all'); // 'all', 'company', 'location'
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('checking');
  const [retryCount, setRetryCount] = useState(0);
  const [showDebugMenu, setShowDebugMenu] = useState(false);

  useEffect(() => {
    loadContacts();
    
    // Set up auto-refresh if using online CSV
    if (!config.useLocalCSV) {
      const interval = setInterval(() => {
        loadContacts(true); // Silent refresh
      }, config.refreshInterval);
      
      return () => clearInterval(interval);
    }
  }, []);

  useEffect(() => {
    filterContacts();
  }, [searchQuery, contacts, filterBy]);

  const loadContacts = async (silent = false, forceRefresh = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
      setConnectionStatus('connecting');
    }
    
    try {
      console.log('Loading contacts...');
      const data = await getContacts(forceRefresh);
      console.log(`Loaded ${data.length} contacts`);
      
      setContacts(data);
      setConnectionStatus('connected');
      setRetryCount(0); // Reset retry count on success
      
      // Apply current filters to new data
      if (data.length > 0) {
        let filtered = data;
        
        // Apply search filter
        if (searchQuery.trim()) {
          const query = searchQuery.toLowerCase();
          filtered = filtered.filter(contact =>
            contact.name?.toLowerCase().includes(query) ||
            contact.email?.toLowerCase().includes(query) ||
            contact.company?.toLowerCase().includes(query) ||
            contact.phone?.includes(query) ||
            contact.city?.toLowerCase().includes(query) ||
            contact.country?.toLowerCase().includes(query)
          );
        }

        // Apply category filter
        if (filterBy === 'company') {
          filtered = filtered.filter(contact => contact.company);
        } else if (filterBy === 'location') {
          filtered = filtered.filter(contact => contact.city || contact.country);
        }
        
        setFilteredContacts(filtered);
      }
      
      if (data.length === 0) {
        setError('No contacts found. Please check the CSV file.');
        setConnectionStatus('no-data');
      }
    } catch (err) {
      console.error('Error loading contacts:', err);
      const errorMessage = `Failed to load contacts: ${err.message}`;
      setError(errorMessage);
      setConnectionStatus('error');
      
      if (!silent) {
        // Show different messages based on the type of error
        if (err.message.includes('fetch')) {
          Alert.alert(
            'Connection Error', 
            'Unable to connect to the server. Check your internet connection and try again.',
            [
              { text: 'Retry', onPress: () => loadContacts(false, true) },
              { text: 'Use Offline Mode', onPress: () => switchToOfflineMode() },
              { text: 'Cancel', style: 'cancel' }
            ]
          );
        } else if (err.message.includes('parsing')) {
          Alert.alert(
            'Data Format Error', 
            'The CSV file format seems to have issues. Trying alternative parsing methods...',
            [
              { text: 'Retry', onPress: () => retryWithDifferentMethod() },
              { text: 'Use Offline Mode', onPress: () => switchToOfflineMode() },
              { text: 'Cancel', style: 'cancel' }
            ]
          );
        } else {
          Alert.alert(
            'Error', 
            errorMessage,
            [
              { text: 'Retry', onPress: () => loadContacts(false, true) },
              { text: 'Cancel', style: 'cancel' }
            ]
          );
        }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const switchToOfflineMode = () => {
    console.log('Switching to offline mode');
    config.useLocalCSV = true;
    setConnectionStatus('offline');
    loadContacts(false, true);
  };

  const retryWithDifferentMethod = () => {
    console.log('Retrying with different parsing method');
    setRetryCount(prev => prev + 1);
    clearContactsCache(); // Clear any cached problematic data
    loadContacts(false, true);
  };

  const checkConnection = async () => {
    try {
      setConnectionStatus('checking');
      const response = await fetch(config.csvUrl, { 
        method: 'HEAD',
        timeout: 5000 
      });
      setConnectionStatus(response.ok ? 'connected' : 'error');
      return response.ok;
    } catch (error) {
      setConnectionStatus('error');
      return false;
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadContacts();
  };

  const filterContacts = () => {
    let filtered = contacts;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(contact =>
        contact.name?.toLowerCase().includes(query) ||
        contact.email?.toLowerCase().includes(query) ||
        contact.company?.toLowerCase().includes(query) ||
        contact.phone?.includes(query) ||
        contact.city?.toLowerCase().includes(query) ||
        contact.country?.toLowerCase().includes(query)
      );
    }

    // Apply category filter
    if (filterBy === 'company') {
      filtered = filtered.filter(contact => contact.company);
    } else if (filterBy === 'location') {
      filtered = filtered.filter(contact => contact.city || contact.country);
    }

    setFilteredContacts(filtered);
  };

  const handleCall = (phone) => {
    if (phone) {
      Linking.openURL(`tel:${phone}`);
    }
  };

  const handleEmail = (email) => {
    if (email) {
      Linking.openURL(`mailto:${email}`);
    }
  };

  const getInitials = (name) => {
    if (!name) return '?';
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  const getContactColor = (name) => {
    if (!name) return config.colors.accent;
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8'];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  };

  const handleExport = async () => {
    try {
      const result = await exportFilteredContacts(filteredContacts, searchQuery, filterBy);
      if (result.success) {
        Alert.alert('Success', result.message);
      } else {
        Alert.alert('Error', result.message);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to export contacts: ' + error.message);
    }
  };

  const renderContactCard = ({ item }) => (
    <TouchableOpacity 
      style={[styles.contactCard, isDarkMode && styles.contactCardDark]}
      onPress={() => setSelectedContact(item)}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.avatar, { backgroundColor: getContactColor(item.name) }]}>
          <Text style={styles.avatarText}>{getInitials(item.name)}</Text>
        </View>
        <View style={styles.contactMainInfo}>
          <Text style={[styles.contactName, isDarkMode && styles.textDark]} numberOfLines={1}>
            {item.name || 'Unknown Contact'}
          </Text>
          {item.company && (
            <Text style={[styles.contactCompany, isDarkMode && styles.textSecondaryDark]} numberOfLines={1}>
              {item.company}
            </Text>
          )}
          {item.city && (
            <Text style={[styles.contactLocation, isDarkMode && styles.textSecondaryDark]} numberOfLines={1}>
              📍 {item.city}{item.country ? `, ${item.country}` : ''}
            </Text>
          )}
        </View>
        <View style={styles.cardActions}>
          {item.balance && parseFloat(item.balance) > 0 && (
            <View style={styles.balanceBadge}>
              <Text style={styles.balanceText}>R{parseFloat(item.balance).toFixed(2)}</Text>
            </View>
          )}
          <TouchableOpacity 
            style={styles.quickActionButton}
            onPress={() => item.phone && handleCall(item.phone)}
          >
            <Ionicons name="call" size={16} color={config.colors.accent} />
          </TouchableOpacity>
        </View>
      </View>
      
      <View style={styles.cardContent}>
        {item.email && (
          <TouchableOpacity 
            style={styles.contactDetail}
            onPress={() => handleEmail(item.email)}
          >
            <Ionicons name="mail" size={14} color={config.colors.textSecondary} />
            <Text style={[styles.contactDetailText, isDarkMode && styles.textSecondaryDark]} numberOfLines={1}>
              {item.email}
            </Text>
          </TouchableOpacity>
        )}
        
        {item.phone && (
          <TouchableOpacity 
            style={styles.contactDetail}
            onPress={() => handleCall(item.phone)}
          >
            <Ionicons name="call" size={14} color={config.colors.textSecondary} />
            <Text style={[styles.contactDetailText, isDarkMode && styles.textSecondaryDark]} numberOfLines={1}>
              {item.phone}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderContactList = ({ item }) => (
    <TouchableOpacity 
      style={[styles.listItem, isDarkMode && styles.listItemDark]}
      onPress={() => setSelectedContact(item)}
      activeOpacity={0.7}
    >
      <View style={[styles.listAvatar, { backgroundColor: getContactColor(item.name) }]}>
        <Text style={styles.listAvatarText}>{getInitials(item.name)}</Text>
      </View>
      <View style={styles.listContent}>
        <Text style={[styles.listName, isDarkMode && styles.textDark]} numberOfLines={1}>
          {item.name || 'Unknown Contact'}
        </Text>
        <Text style={[styles.listSecondary, isDarkMode && styles.textSecondaryDark]} numberOfLines={1}>
          {item.company || item.email || item.phone || 'No details'}
        </Text>
      </View>
      <View style={styles.listActions}>
        {item.balance && parseFloat(item.balance) > 0 && (
          <Text style={styles.listBalance}>R{parseFloat(item.balance).toFixed(0)}</Text>
        )}
        <Ionicons name="chevron-forward" size={16} color={config.colors.textSecondary} />
      </View>
    </TouchableOpacity>
  );

  const renderContactDetailModal = () => (
    <Modal
      visible={selectedContact !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setSelectedContact(null)}
    >
      <View style={[styles.modalContainer, isDarkMode && styles.modalContainerDark]}>
        <View style={[styles.modalHeader, { paddingTop: Platform.OS === 'ios' ? 0 : 20 }]}>
          <TouchableOpacity 
            style={styles.modalCloseButton}
            onPress={() => setSelectedContact(null)}
          >
            <Ionicons name="close" size={24} color={isDarkMode ? '#fff' : config.colors.text} />
          </TouchableOpacity>
          <Text style={[styles.modalTitle, isDarkMode && styles.textDark]}>Contact Details</Text>
          <View style={styles.modalActions}>
            <TouchableOpacity 
              style={styles.modalActionButton}
              onPress={() => selectedContact?.phone && handleCall(selectedContact.phone)}
            >
              <Ionicons name="call" size={20} color={config.colors.accent} />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.modalActionButton}
              onPress={() => selectedContact?.email && handleEmail(selectedContact.email)}
            >
              <Ionicons name="mail" size={20} color={config.colors.accent} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
          {selectedContact && (
            <View>
              <View style={styles.contactHeaderLarge}>
                <View style={[styles.avatarLarge, { backgroundColor: getContactColor(selectedContact.name) }]}>
                  <Text style={styles.avatarLargeText}>{getInitials(selectedContact.name)}</Text>
                </View>
                <Text style={[styles.contactNameLarge, isDarkMode && styles.textDark]}>
                  {selectedContact.name || 'Unknown Contact'}
                </Text>
                {selectedContact.company && (
                  <Text style={[styles.contactCompanyLarge, isDarkMode && styles.textSecondaryDark]}>
                    {selectedContact.company}
                  </Text>
                )}
              </View>

              <View style={styles.detailSection}>
                <Text style={[styles.sectionTitle, isDarkMode && styles.textDark]}>Contact Information</Text>
                
                {selectedContact.email && (
                  <TouchableOpacity 
                    style={[styles.detailRow, isDarkMode && styles.detailRowDark]}
                    onPress={() => handleEmail(selectedContact.email)}
                  >
                    <Ionicons name="mail" size={20} color={config.colors.accent} />
                    <View style={styles.detailContent}>
                      <Text style={[styles.detailLabel, isDarkMode && styles.textSecondaryDark]}>Email</Text>
                      <Text style={[styles.detailValue, isDarkMode && styles.textDark]}>{selectedContact.email}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={config.colors.textSecondary} />
                  </TouchableOpacity>
                )}

                {selectedContact.phone && (
                  <TouchableOpacity 
                    style={[styles.detailRow, isDarkMode && styles.detailRowDark]}
                    onPress={() => handleCall(selectedContact.phone)}
                  >
                    <Ionicons name="call" size={20} color={config.colors.accent} />
                    <View style={styles.detailContent}>
                      <Text style={[styles.detailLabel, isDarkMode && styles.textSecondaryDark]}>Phone</Text>
                      <Text style={[styles.detailValue, isDarkMode && styles.textDark]}>{selectedContact.phone}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={config.colors.textSecondary} />
                  </TouchableOpacity>
                )}

                {(selectedContact.address || selectedContact.city || selectedContact.country) && (
                  <View style={[styles.detailRow, isDarkMode && styles.detailRowDark]}>
                    <Ionicons name="location" size={20} color={config.colors.accent} />
                    <View style={styles.detailContent}>
                      <Text style={[styles.detailLabel, isDarkMode && styles.textSecondaryDark]}>Address</Text>
                      <Text style={[styles.detailValue, isDarkMode && styles.textDark]}>
                        {[selectedContact.address, selectedContact.city, selectedContact.state, selectedContact.country]
                          .filter(Boolean)
                          .join(', ')}
                      </Text>
                    </View>
                  </View>
                )}

                {selectedContact.balance && parseFloat(selectedContact.balance) > 0 && (
                  <View style={[styles.detailRow, isDarkMode && styles.detailRowDark]}>
                    <Ionicons name="card" size={20} color={config.colors.accent} />
                    <View style={styles.detailContent}>
                      <Text style={[styles.detailLabel, isDarkMode && styles.textSecondaryDark]}>Outstanding Balance</Text>
                      <Text style={[styles.detailValue, styles.balanceValue]}>
                        R{parseFloat(selectedContact.balance).toFixed(2)}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );

  if (loading) {
    return (
      <View style={[styles.container, isDarkMode && styles.containerDark, { paddingTop: insets.top }]}>
        <StatusBar style={isDarkMode ? "light" : "dark"} />
        <View style={styles.loadingContainer}>
          <View style={styles.loadingSpinner}>
            <Ionicons name="sync" size={32} color={config.colors.accent} />
          </View>
          <Text style={[styles.loadingText, isDarkMode && styles.textDark]}>Loading contacts...</Text>
          <Text style={[styles.loadingSubtext, isDarkMode && styles.textSecondaryDark]}>
            Fetching from: {config.csvUrl.split('/').pop()}
          </Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, isDarkMode && styles.containerDark, { paddingTop: insets.top }]}>
        <StatusBar style={isDarkMode ? "light" : "dark"} />
        <View style={styles.errorContainer}>
          <Ionicons name="cloud-offline" size={64} color={config.colors.error} />
          <Text style={[styles.errorTitle, isDarkMode && styles.textDark]}>Connection Error</Text>
          <Text style={[styles.errorText, isDarkMode && styles.textSecondaryDark]}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadContacts}>
            <Ionicons name="refresh" size={20} color="white" />
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, isDarkMode && styles.containerDark, { paddingTop: insets.top }]}>
      <StatusBar style={isDarkMode ? "light" : "dark"} />
      
      {/* Header */}
      <View style={[styles.header, isDarkMode && styles.headerDark]}>
        <View style={styles.headerTop}>
          <View>
            <Text style={[styles.headerTitle, isDarkMode && styles.textDark]}>Contacts</Text>
            <Text style={[styles.headerSubtitle, isDarkMode && styles.textSecondaryDark]}>
              {filteredContacts.length} contact{filteredContacts.length !== 1 ? 's' : ''}
            </Text>
            {/* Connection Status Indicator */}
            <View style={styles.connectionStatusContainer}>
              <View style={[
                styles.connectionDot,
                connectionStatus === 'connected' && styles.connectionDotGreen,
                connectionStatus === 'connecting' && styles.connectionDotYellow,
                connectionStatus === 'error' && styles.connectionDotRed,
                connectionStatus === 'offline' && styles.connectionDotGray,
                connectionStatus === 'checking' && styles.connectionDotYellow
              ]} />
              <Text style={[styles.connectionText, isDarkMode && styles.textSecondaryDark]}>
                {connectionStatus === 'connected' && (config.useLocalCSV ? 'Local Data' : 'Online')}
                {connectionStatus === 'connecting' && 'Connecting...'}
                {connectionStatus === 'checking' && 'Checking...'}
                {connectionStatus === 'error' && 'Connection Error'}
                {connectionStatus === 'offline' && 'Offline Mode'}
                {connectionStatus === 'no-data' && 'No Data'}
              </Text>
              {connectionStatus === 'error' && (
                <TouchableOpacity 
                  style={styles.retryButton}
                  onPress={() => loadContacts(false, true)}
                >
                  <Ionicons name="refresh" size={12} color={config.colors.accent} />
                </TouchableOpacity>
              )}
            </View>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity 
              style={[styles.headerButton, isDarkMode && styles.headerButtonDark]}
              onPress={handleExport}
            >
              <Ionicons name="download" size={20} color={isDarkMode ? '#fff' : config.colors.text} />
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.headerButton, isDarkMode && styles.headerButtonDark]}
              onPress={() => setShowFilters(!showFilters)}
            >
              <Ionicons name="options" size={20} color={isDarkMode ? '#fff' : config.colors.text} />
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.headerButton, isDarkMode && styles.headerButtonDark]}
              onPress={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
            >
              <Ionicons name={viewMode === 'grid' ? 'list' : 'grid'} size={20} color={isDarkMode ? '#fff' : config.colors.text} />
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.headerButton, isDarkMode && styles.headerButtonDark]}
              onPress={() => setIsDarkMode(!isDarkMode)}
            >
              <Ionicons name={isDarkMode ? 'sunny' : 'moon'} size={20} color={isDarkMode ? '#fff' : config.colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Search Bar */}
        <View style={[styles.searchContainer, isDarkMode && styles.searchContainerDark]}>
          <Ionicons name="search" size={20} color={config.colors.textSecondary} />
          <TextInput
            style={[styles.searchInput, isDarkMode && styles.searchInputDark]}
            placeholder="Search contacts, companies, locations..."
            placeholderTextColor={config.colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={config.colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Bar */}
        {showFilters && (
          <View style={styles.filterContainer}>
            {['all', 'company', 'location'].map((filter) => (
              <TouchableOpacity
                key={filter}
                style={[
                  styles.filterButton,
                  filterBy === filter && styles.filterButtonActive,
                  isDarkMode && styles.filterButtonDark,
                  filterBy === filter && isDarkMode && styles.filterButtonActiveDark
                ]}
                onPress={() => setFilterBy(filter)}
              >
                <Text style={[
                  styles.filterButtonText,
                  filterBy === filter && styles.filterButtonTextActive,
                  isDarkMode && styles.filterButtonTextDark,
                  filterBy === filter && isDarkMode && styles.filterButtonTextActiveDark
                ]}>
                  {filter.charAt(0).toUpperCase() + filter.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Contact List */}
      <FlatList
        data={filteredContacts}
        renderItem={viewMode === 'grid' ? renderContactCard : renderContactList}
        keyExtractor={(item, index) => `${item.name}-${item.email}-${index}`}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[config.colors.accent]}
            tintColor={config.colors.accent}
          />
        }
        contentContainerStyle={[
          styles.listContainer,
          viewMode === 'grid' && styles.gridContainer
        ]}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={64} color={config.colors.textSecondary} />
            <Text style={[styles.emptyText, isDarkMode && styles.textSecondaryDark]}>No contacts found</Text>
            <Text style={[styles.emptySubtext, isDarkMode && styles.textSecondaryDark]}>
              {searchQuery ? 'Try a different search term' : 'Pull down to refresh'}
            </Text>
          </View>
        }
      />

      {renderContactDetailModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  containerDark: {
    backgroundColor: '#1F1F1F',
  },
  
  // Loading States
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingSpinner: {
    marginBottom: 20,
  },
  loadingText: {
    fontSize: 18,
    fontWeight: '600',
    color: config.colors.text,
    marginBottom: 8,
  },
  loadingSubtext: {
    fontSize: 14,
    color: config.colors.textSecondary,
    textAlign: 'center',
  },
  
  // Error States
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: config.colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: config.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  
  // Header
  header: {
    backgroundColor: 'white',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerDark: {
    backgroundColor: '#2D2D2D',
    borderBottomColor: '#404040',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: config.colors.text,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: config.colors.textSecondary,
    marginTop: 4,
  },
  
  // Connection Status
  connectionStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 6,
  },
  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D1D5DB',
  },
  connectionDotGreen: {
    backgroundColor: '#10B981',
  },
  connectionDotYellow: {
    backgroundColor: '#F59E0B',
  },
  connectionDotRed: {
    backgroundColor: '#EF4444',
  },
  connectionDotGray: {
    backgroundColor: '#6B7280',
  },
  connectionText: {
    fontSize: 12,
    color: config.colors.textSecondary,
    fontWeight: '500',
  },
  retryButton: {
    marginLeft: 4,
    padding: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerButtonDark: {
    backgroundColor: '#404040',
  },
  
  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  searchContainerDark: {
    backgroundColor: '#404040',
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: config.colors.text,
  },
  searchInputDark: {
    color: 'white',
  },
  
  // Filters
  filterContainer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  filterButtonDark: {
    backgroundColor: '#404040',
  },
  filterButtonActive: {
    backgroundColor: config.colors.accent,
  },
  filterButtonActiveDark: {
    backgroundColor: config.colors.accent,
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: config.colors.text,
  },
  filterButtonTextDark: {
    color: 'white',
  },
  filterButtonTextActive: {
    color: 'white',
  },
  filterButtonTextActiveDark: {
    color: 'white',
  },
  
  // List
  listContainer: {
    padding: 20,
    paddingTop: 16,
  },
  separator: {
    height: 12,
  },
  
  // Contact Cards
  contactCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  contactCardDark: {
    backgroundColor: '#2D2D2D',
    borderColor: '#404040',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  avatarText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  contactMainInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 18,
    fontWeight: '600',
    color: config.colors.text,
    marginBottom: 4,
  },
  contactCompany: {
    fontSize: 14,
    color: config.colors.accent,
    fontWeight: '500',
    marginBottom: 4,
  },
  contactLocation: {
    fontSize: 13,
    color: config.colors.textSecondary,
  },
  cardActions: {
    alignItems: 'flex-end',
    gap: 8,
  },
  balanceBadge: {
    backgroundColor: config.colors.accent,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  balanceText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  quickActionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContent: {
    gap: 8,
  },
  contactDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  contactDetailText: {
    fontSize: 14,
    color: config.colors.textSecondary,
    flex: 1,
  },
  
  // List View
  listItem: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  listItemDark: {
    backgroundColor: '#2D2D2D',
    borderColor: '#404040',
  },
  listAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  listAvatarText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  listContent: {
    flex: 1,
  },
  listName: {
    fontSize: 16,
    fontWeight: '600',
    color: config.colors.text,
    marginBottom: 2,
  },
  listSecondary: {
    fontSize: 14,
    color: config.colors.textSecondary,
  },
  listActions: {
    alignItems: 'flex-end',
    gap: 4,
  },
  listBalance: {
    fontSize: 12,
    color: config.colors.accent,
    fontWeight: '600',
  },
  
  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  modalContainerDark: {
    backgroundColor: '#1F1F1F',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: config.colors.text,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
  },
  modalActionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  contactHeaderLarge: {
    alignItems: 'center',
    marginBottom: 32,
  },
  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarLargeText: {
    color: 'white',
    fontSize: 32,
    fontWeight: '600',
  },
  contactNameLarge: {
    fontSize: 24,
    fontWeight: '700',
    color: config.colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  contactCompanyLarge: {
    fontSize: 16,
    color: config.colors.accent,
    fontWeight: '500',
    textAlign: 'center',
  },
  detailSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: config.colors.text,
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  detailRowDark: {
    backgroundColor: '#2D2D2D',
  },
  detailContent: {
    flex: 1,
    marginLeft: 16,
  },
  detailLabel: {
    fontSize: 12,
    color: config.colors.textSecondary,
    textTransform: 'uppercase',
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 16,
    color: config.colors.text,
    fontWeight: '500',
  },
  balanceValue: {
    color: config.colors.accent,
    fontWeight: '600',
  },
  
  // Common
  retryButton: {
    flexDirection: 'row',
    backgroundColor: config.colors.accent,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 8,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: config.colors.textSecondary,
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: config.colors.textSecondary,
    textAlign: 'center',
  },
  
  // Text colors for dark mode
  textDark: {
    color: 'white',
  },
  textSecondaryDark: {
    color: '#9CA3AF',
  },
});

export default function App() {
  return (
    <SafeAreaProvider>
      <ContactApp />
    </SafeAreaProvider>
  );
}
