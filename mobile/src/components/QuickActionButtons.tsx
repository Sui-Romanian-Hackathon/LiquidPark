import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface QuickActionButtonsProps {
  onPress: (action: string) => void;
  selected?: string;
}

const QUICK_ACTIONS = ['Near me', 'FSEGA area', 'City center', 'Downtown'];

export const QuickActionButtons: React.FC<QuickActionButtonsProps> = ({
  onPress,
  selected,
}) => {
  return (
    <View style={styles.container}>
      {QUICK_ACTIONS.map((action) => (
        <TouchableOpacity
          key={action}
          style={[
            styles.button,
            selected === action && styles.buttonSelected,
          ]}
          onPress={() => onPress(action)}
        >
          <Text
            style={[
              styles.buttonText,
              selected === action && styles.buttonTextSelected,
            ]}
          >
            {action}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  buttonSelected: {
    backgroundColor: '#00BCD4',
    borderColor: '#00BCD4',
  },
  buttonText: {
    fontSize: 14,
    color: '#333',
  },
  buttonTextSelected: {
    color: '#fff',
    fontWeight: '500',
  },
});
