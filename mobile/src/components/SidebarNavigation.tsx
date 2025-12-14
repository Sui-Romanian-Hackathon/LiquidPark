import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  PanResponder,
  Animated,
  TouchableOpacity,
} from 'react-native';
import { SuiTheme } from '../config/theme';
import { SuiLogo } from './SuiLogo';

export type NavigationItem = 'Chat' | 'My Reservations' | 'My Parking Slots' | 'Profile' | 'Complaints' | 'Deconnect';

interface SidebarNavigationProps {
  currentScreen: NavigationItem;
  onNavigate: (screen: NavigationItem) => void;
  onClose?: () => void;
  reservationCount?: number;
}

export const SidebarNavigation: React.FC<SidebarNavigationProps> = ({
  currentScreen,
  onNavigate,
  onClose,
  reservationCount = 0,
}) => {
  const pan = useRef(new Animated.ValueXY()).current;
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to horizontal swipes (left swipe to close)
        // Require at least 10px horizontal movement and more horizontal than vertical
        return Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderGrant: () => {
        // Reset pan value when gesture starts
        pan.setOffset({ x: pan.x._value, y: 0 });
      },
      onPanResponderMove: (_, gestureState) => {
        // Only allow left swipe (negative dx)
        if (gestureState.dx < 0) {
          pan.setValue({ x: gestureState.dx, y: 0 });
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        pan.flattenOffset();
        // If swiped left more than 80px, close the sidebar
        if (gestureState.dx < -80) {
          Animated.timing(pan, {
            toValue: { x: -280, y: 0 },
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            pan.setValue({ x: 0, y: 0 });
            onClose?.();
          });
        } else {
          // Snap back to original position
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: true,
            tension: 50,
            friction: 7,
          }).start();
        }
      },
    })
  ).current;

  const navigationItems: Array<{
    id: NavigationItem;
    label: string;
    icon: string;
    badge?: number;
  }> = [
    { id: 'Chat', label: 'Chat', icon: '💬' },
    {
      id: 'My Reservations',
      label: 'My Reservations',
      icon: '📅',
      badge: reservationCount > 0 ? reservationCount : undefined,
    },
    { id: 'My Parking Slots', label: 'My Parking Slots', icon: '🅿️' },
    { id: 'Profile', label: 'Profile', icon: '👤' },
    { id: 'Complaints', label: 'Complaints', icon: '📝' },
    { id: 'Deconnect', label: 'Deconnect', icon: '🚪' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View
        style={[
          styles.content,
          {
            transform: [{ translateX: pan.x }],
          },
        ]}
        {...panResponder.panHandlers}
      >
        {/* App Branding */}
        <View style={styles.branding}>
          <View style={styles.brandingLeft}>
            <View style={styles.logo}>
              <SuiLogo width={64} height={96} />
            </View>
            <View>
              <Text style={styles.appName}>Parking Agent</Text>
              <Text style={styles.appSubtitle}>AI Assistant</Text>
            </View>
          </View>
        </View>

        {/* Navigation Items */}
        <View style={styles.navItems}>
          {navigationItems.map((item) => {
            const isActive = currentScreen === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.navItem, isActive && styles.navItemActive]}
                onPress={() => {
                  onNavigate(item.id);
                  onClose?.(); // Close sidebar automatically after navigation
                }}
                activeOpacity={0.7}
              >
                <View style={styles.navItemContent}>
                  <Text style={styles.navIcon}>{item.icon}</Text>
                  <Text
                    style={[
                      styles.navLabel,
                      isActive && styles.navLabelActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                  {item.badge !== undefined && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{item.badge}</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </Animated.View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 280,
    backgroundColor: SuiTheme.background.cardLight,
    borderRightWidth: 1,
    borderRightColor: SuiTheme.primary.lighter,
  },
  content: {
    flex: 1,
    paddingTop: 20,
  },
  branding: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 30,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  brandingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  logo: {
    width: 96,
    height: 96,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  logoText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  appName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1A9399', // Darker turquoise for app name
  },
  appSubtitle: {
    fontSize: 14,
    color: '#26B8C0', // Medium turquoise for subtitle
    marginTop: 2,
  },
  navItems: {
    paddingTop: 20,
  },
  navItem: {
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  navItemActive: {
    backgroundColor: '#B8F2F5', // Very light turquoise for active items
  },
  navItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  navIcon: {
    fontSize: 20,
    marginRight: 12,
    width: 24,
  },
  navLabel: {
    fontSize: 16,
    color: '#546E7A', // Softer gray-blue for nav labels
    flex: 1,
  },
  navLabelActive: {
    color: '#26B8C0', // Darker turquoise for active label
    fontWeight: '600',
  },
  badge: {
    backgroundColor: '#F44336',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginLeft: 8,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
