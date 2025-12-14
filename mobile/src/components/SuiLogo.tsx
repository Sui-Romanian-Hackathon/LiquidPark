import React from 'react';
import { View, StyleSheet, Image } from 'react-native';

interface SuiLogoProps {
  width?: number;
  height?: number;
  color?: string; // Kept for API compatibility, but not used for JPEG
}

export const SuiLogo: React.FC<SuiLogoProps> = ({ 
  width = 40, 
  height = 60,
  color 
}) => {
  // Use the smaller dimension to ensure the logo fits in a circle
  const size = Math.min(width, height);
  // Add padding to keep logo inside the circle (about 5% padding for larger logo)
  const imageSize = size * 0.95;
  
  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Image
        source={require('../../assets/image.png')}
        style={{ width: imageSize, height: imageSize }}
        resizeMode="contain"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderRadius: 9999, // Make it circular
  },
});


