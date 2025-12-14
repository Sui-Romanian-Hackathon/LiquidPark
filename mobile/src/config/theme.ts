// Sui Theme Colors - Turquoise/Cyan Theme
export const SuiTheme = {
  // Primary Turquoise Colors
  primary: {
    main: '#32DDE6', // Turquoise/Cyan
    dark: '#26B8C0', // Darker turquoise
    light: '#7FE8ED', // Light turquoise
    lighter: '#B8F2F5', // Very light turquoise
  },
  
  // Gradient Colors
  gradients: {
    primary: ['#32DDE6', '#26B8C0', '#1A9399'], // Turquoise gradient
    secondary: ['#26B8C0', '#1A9399', '#0E6E73'], // Darker turquoise gradient
    accent: ['#00BCD4', '#0097A7', '#006064'], // Cyan gradient
    background: ['#B8F2F5', '#7FE8ED', '#32DDE6'], // Light turquoise gradient
    dark: ['#1E3A5F', '#2C3E50', '#34495E'], // Dark gradient
  },
  
  // Background Colors
  background: {
    primary: '#FFFFFF', // White for main backgrounds
    secondary: '#F8F9FA', // Very light gray for secondary backgrounds
    tertiary: '#F0F2F5', // Light gray for tertiary backgrounds
    dark: '#1E3A5F',
    card: '#FFFFFF', // White cards
    cardLight: '#F8F9FA', // Very light gray cards
    cardDark: '#2C3E50',
  },
  
  // Text Colors
  text: {
    primary: '#1E3A5F',
    secondary: '#546E7A',
    light: '#90A4AE',
    white: '#FFFFFF',
    accent: '#32DDE6', // Turquoise accent
  },
  
  // Status Colors
  success: '#4CAF50',
  warning: '#FF9800',
  error: '#F44336',
  info: '#2196F3',
  
  // Border & Shadow
  border: {
    light: '#E0E7ED',
    medium: '#CFD8DC',
    dark: '#90A4AE',
  },
  
  shadow: {
    color: '#32DDE6', // Turquoise shadow
    opacity: 0.2,
  },
};

// Helper function to get gradient colors
export const getGradientColors = (type: keyof typeof SuiTheme.gradients = 'primary') => {
  return SuiTheme.gradients[type];
};


