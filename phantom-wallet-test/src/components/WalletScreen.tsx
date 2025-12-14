import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  SafeAreaView,
} from "react-native";
import {
  useModal,
  useAccounts,
  useSolana,
  useEthereum,
  useDisconnect,
} from "@phantom/react-native-sdk";

export default function WalletScreen() {
  const modal = useModal();
  const { isConnected, addresses, walletId } = useAccounts();
  const { solana, isAvailable: isSolanaAvailable } = useSolana();
  const { ethereum, isAvailable: isEthereumAvailable } = useEthereum();
  const { disconnect } = useDisconnect();

  const handleSignSolanaMessage = async () => {
    try {
      const signature = await solana.signMessage("Hello from Solana!");
      Alert.alert(
        "Solana Signed!",
        `Signature: ${signature.signature.slice(0, 20)}...`
      );
    } catch (error: any) {
      Alert.alert("Error", `Failed to sign: ${error.message}`);
    }
  };

  const handleSignEthereumMessage = async () => {
    try {
      const accounts = await ethereum.getAccounts();
      if (accounts.length === 0) {
        Alert.alert("Error", "No Ethereum accounts available");
        return;
      }
      const signature = await ethereum.signPersonalMessage(
        "Hello from Ethereum!",
        accounts[0]
      );
      Alert.alert(
        "Ethereum Signed!",
        `Signature: ${signature.signature.slice(0, 20)}...`
      );
    } catch (error: any) {
      Alert.alert("Error", `Failed to sign: ${error.message}`);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
      Alert.alert("Success", "Wallet disconnected");
    } catch (error: any) {
      Alert.alert("Error", `Failed to disconnect: ${error.message}`);
    }
  };

  if (!isConnected) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <View style={styles.centeredContent}>
            <View style={styles.iconContainer}>
              <Text style={styles.icon}>👻</Text>
            </View>
            <Text style={styles.title}>Phantom Wallet</Text>
            <Text style={styles.subtitle}>
              Connect your Phantom wallet to get started with secure, multi-chain transactions
            </Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => modal.open()}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryButtonText}>Connect Wallet</Text>
            </TouchableOpacity>
            <Text style={styles.hint}>
              You'll authenticate using Google or Apple
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.statusIndicator}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>Connected</Text>
          </View>
          <Text style={styles.connectedTitle}>Wallet Connected</Text>
        </View>

        {walletId && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Wallet ID</Text>
            <Text style={styles.cardValue} numberOfLines={1} ellipsizeMode="middle">
              {walletId}
            </Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Addresses</Text>
          {addresses.map((addr, index) => (
            <View key={index} style={styles.addressCard}>
              <View style={styles.addressHeader}>
                <View style={styles.chainBadge}>
                  <Text style={styles.chainBadgeText}>
                    {addr.addressType.toUpperCase()}
                  </Text>
                </View>
              </View>
              <Text style={styles.address} numberOfLines={1} ellipsizeMode="middle">
                {addr.address}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Actions</Text>
          
          {isSolanaAvailable && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleSignSolanaMessage}
              activeOpacity={0.8}
            >
              <Text style={styles.actionButtonText}>Sign Solana Message</Text>
            </TouchableOpacity>
          )}

          {isEthereumAvailable && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleSignEthereumMessage}
              activeOpacity={0.8}
            >
              <Text style={styles.actionButtonText}>Sign Ethereum Message</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => modal.open()}
            activeOpacity={0.8}
          >
            <Text style={styles.secondaryButtonText}>Manage Wallet</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.dangerButton}
            onPress={handleDisconnect}
            activeOpacity={0.8}
          >
            <Text style={styles.dangerButtonText}>Disconnect</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  centeredContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#1a1a1a",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
    borderWidth: 2,
    borderColor: "#2a2a2a",
  },
  icon: {
    fontSize: 50,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 12,
    textAlign: "center",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: "#999999",
    marginBottom: 40,
    textAlign: "center",
    lineHeight: 24,
    paddingHorizontal: 16,
  },
  hint: {
    fontSize: 13,
    color: "#666666",
    marginTop: 16,
    textAlign: "center",
  },
  primaryButton: {
    backgroundColor: "#AB9FF2",
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    minWidth: 200,
    shadowColor: "#AB9FF2",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  primaryButtonText: {
    color: "#000000",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  header: {
    marginBottom: 24,
  },
  statusIndicator: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4ade80",
    marginRight: 8,
  },
  statusText: {
    fontSize: 14,
    color: "#4ade80",
    fontWeight: "600",
  },
  connectedTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: -0.5,
  },
  card: {
    backgroundColor: "#1a1a1a",
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  cardLabel: {
    fontSize: 12,
    color: "#888888",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  cardValue: {
    fontSize: 14,
    color: "#ffffff",
    fontFamily: "monospace",
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#ffffff",
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  addressCard: {
    backgroundColor: "#1a1a1a",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  addressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  chainBadge: {
    backgroundColor: "#2a2a2a",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  chainBadgeText: {
    fontSize: 11,
    color: "#AB9FF2",
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  address: {
    fontSize: 14,
    color: "#ffffff",
    fontFamily: "monospace",
  },
  actionButton: {
    backgroundColor: "#2a2a2a",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#3a3a3a",
  },
  actionButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "500",
    textAlign: "center",
  },
  secondaryButton: {
    backgroundColor: "transparent",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#3a3a3a",
  },
  secondaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "500",
    textAlign: "center",
  },
  dangerButton: {
    backgroundColor: "transparent",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ff4444",
  },
  dangerButtonText: {
    color: "#ff4444",
    fontSize: 15,
    fontWeight: "500",
    textAlign: "center",
  },
});

