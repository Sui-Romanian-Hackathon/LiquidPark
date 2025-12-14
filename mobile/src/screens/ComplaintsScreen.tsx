import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { SuiTheme } from '../config/theme';

export interface Complaint {
  id: string;
  reservationId: string;
  reservationSlotName: string;
  reservationDate: string;
  reservationTime: string;
  comment: string;
  imageUri?: string | null;
  status: 'pending' | 'reviewed' | 'resolved';
  createdAt: string;
}

interface ComplaintsScreenProps {
  userAddress: string | null;
  onAddComplaint: () => void;
  onToggleSidebar?: () => void;
  refreshTrigger?: number;
}

export const ComplaintsScreen: React.FC<ComplaintsScreenProps> = ({
  userAddress,
  onAddComplaint,
  onToggleSidebar,
  refreshTrigger,
}) => {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (userAddress) {
      loadComplaints();
    } else {
      setLoading(false);
    }
  }, [userAddress, refreshTrigger]);

  const loadComplaints = async () => {
    if (!userAddress) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // TODO: Fetch complaints from backend/blockchain
      // For now, use empty array or mock data
      const mockComplaints: Complaint[] = [];
      
      setComplaints(mockComplaints);
    } catch (err) {
      console.error('Error loading complaints:', err);
      setError('Failed to load complaints. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: Complaint['status']) => {
    switch (status) {
      case 'pending':
        return '#FF9800';
      case 'reviewed':
        return '#2196F3';
      case 'resolved':
        return '#4CAF50';
      default:
        return '#999';
    }
  };

  const getStatusLabel = (status: Complaint['status']) => {
    switch (status) {
      case 'pending':
        return 'Pending';
      case 'reviewed':
        return 'Under Review';
      case 'resolved':
        return 'Resolved';
      default:
        return status;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {onToggleSidebar && (
            <TouchableOpacity onPress={onToggleSidebar} style={styles.menuButton}>
              <Text style={styles.menuIcon}>☰</Text>
            </TouchableOpacity>
          )}
          <View style={styles.titleContainer}>
            <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">Complaints</Text>
            <Text style={styles.subtitle}>{complaints.length} total</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={onAddComplaint}
        >
          <Text style={styles.addButtonText}>+ Add Complaint</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color="#00BCD4" />
          <Text style={styles.loadingText}>Loading complaints...</Text>
        </View>
      ) : error ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>⚠️</Text>
          <Text style={styles.emptyText}>Error loading complaints</Text>
          <Text style={styles.emptySubtext}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => loadComplaints()}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : complaints.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📝</Text>
          <Text style={styles.emptyText}>No complaints yet</Text>
          <Text style={styles.emptySubtext}>
            If you encounter any issues with your reservations, you can submit a complaint here.
          </Text>
          <TouchableOpacity
            style={styles.addComplaintButton}
            onPress={onAddComplaint}
          >
            <Text style={styles.addComplaintButtonText}>Add Your First Complaint</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {complaints.map((complaint) => (
            <TouchableOpacity
              key={complaint.id}
              style={styles.complaintCard}
              activeOpacity={0.7}
            >
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <Text style={styles.reservationName}>{complaint.reservationSlotName}</Text>
                  <Text style={styles.reservationDetails}>
                    {complaint.reservationDate} at {complaint.reservationTime}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: getStatusColor(complaint.status) },
                  ]}
                >
                  <Text style={styles.statusText}>
                    {getStatusLabel(complaint.status)}
                  </Text>
                </View>
              </View>

              <View style={styles.cardContent}>
                <Text style={styles.commentLabel}>Complaint:</Text>
                <Text style={styles.commentText} numberOfLines={3}>
                  {complaint.comment}
                </Text>
                {complaint.imageUri && (
                  <View style={styles.hasImageIndicator}>
                    <Text style={styles.hasImageText}>📷 Photo attached</Text>
                  </View>
                )}
              </View>

              <View style={styles.cardFooter}>
                <Text style={styles.createdAt}>
                  Submitted: {complaint.createdAt}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SuiTheme.background.secondary,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: SuiTheme.background.cardLight,
    borderBottomWidth: 1,
    borderBottomColor: SuiTheme.primary.lighter,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
    marginRight: 12,
  },
  menuButton: {
    padding: 4,
    flexShrink: 0,
  },
  menuIcon: {
    fontSize: 24,
    color: '#333',
  },
  titleContainer: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  addButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#00BCD4',
    flexShrink: 0,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    gap: 16,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  loadingState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#00BCD4',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  addComplaintButton: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#00BCD4',
    borderRadius: 8,
  },
  addComplaintButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  complaintCard: {
    backgroundColor: SuiTheme.background.cardLight,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: SuiTheme.primary.main,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: SuiTheme.primary.lighter,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardHeaderLeft: {
    flex: 1,
    marginRight: 12,
  },
  reservationName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 4,
  },
  reservationDetails: {
    fontSize: 14,
    color: '#666',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  cardContent: {
    marginBottom: 12,
  },
  commentLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  commentText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  hasImageIndicator: {
    marginTop: 8,
    padding: 8,
    backgroundColor: '#F8F9FA',
    borderRadius: 6,
  },
  hasImageText: {
    fontSize: 12,
    color: '#666',
  },
  cardFooter: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  createdAt: {
    fontSize: 12,
    color: '#999',
  },
});
