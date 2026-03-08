import { Platform } from 'react-native';

// ============================================
// Google Sign-In via expo-auth-session
// Set GOOGLE_CLIENT_ID and GOOGLE_IOS_CLIENT_ID
// in .env (see .env.example)
// ============================================
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_IOS_CLIENT_ID = process.env.GOOGLE_IOS_CLIENT_ID || '';

let AuthSession = null;
let AppleAuthentication = null;
let CryptoModule = null;

try {
  AuthSession = require('expo-auth-session');
} catch (e) {
  console.warn('expo-auth-session not available');
}

try {
  AppleAuthentication = require('expo-apple-authentication');
} catch (e) {
  console.warn('expo-apple-authentication not available');
}

try {
  CryptoModule = require('expo-crypto');
} catch (e) {
  console.warn('expo-crypto not available');
}

/**
 * Google Sign-In using OAuth 2.0 via expo-auth-session
 */
export async function signInWithGoogle() {
  if (!AuthSession) {
    throw new Error('expo-auth-session is not installed');
  }

  const discovery = AuthSession.useAutoDiscovery
    ? { authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth' }
    : await AuthSession.fetchDiscoveryAsync('https://accounts.google.com');

  const redirectUri = AuthSession.makeRedirectUri({
    scheme: 'com.dailytrain.app',
    path: 'redirect',
  });

  const clientId = Platform.OS === 'ios' ? GOOGLE_IOS_CLIENT_ID : GOOGLE_CLIENT_ID;

  const request = new AuthSession.AuthRequest({
    clientId,
    scopes: ['openid', 'profile', 'email'],
    redirectUri,
    responseType: AuthSession.ResponseType.Token,
  });

  const result = await request.promptAsync(discovery);

  if (result.type === 'success') {
    const { access_token } = result.params;
    // Fetch user info from Google
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const userInfo = await userInfoResponse.json();

    return {
      id: userInfo.id,
      email: userInfo.email,
      name: userInfo.name,
      picture: userInfo.picture,
      provider: 'google',
      token: access_token,
    };
  }

  return null;
}

/**
 * Apple Sign-In (iOS 13+ only)
 */
export async function signInWithApple() {
  if (!AppleAuthentication) {
    throw new Error('expo-apple-authentication is not installed');
  }

  const nonce = await generateNonce();

  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce,
  });

  // Apple only provides name/email on first sign-in
  // Subsequent sign-ins return only the user identifier
  const fullName = credential.fullName
    ? `${credential.fullName.givenName || ''} ${credential.fullName.familyName || ''}`.trim()
    : null;

  return {
    id: credential.user,
    email: credential.email || null,
    name: fullName || 'Athlete',
    picture: null,
    provider: 'apple',
    token: credential.identityToken,
  };
}

/**
 * Check if Apple Sign-In is available on this device
 */
export function isAppleSignInAvailable() {
  if (Platform.OS !== 'ios') return false;
  if (!AppleAuthentication) return false;
  try {
    return AppleAuthentication.isAvailableAsync
      ? true // Will be checked async in component
      : false;
  } catch {
    return false;
  }
}

/**
 * Generate a random nonce for Apple Sign-In
 */
async function generateNonce() {
  if (CryptoModule?.digestStringAsync) {
    const randomBytes = Math.random().toString(36).substring(2, 15);
    return CryptoModule.digestStringAsync(CryptoModule.CryptoDigestAlgorithm.SHA256, randomBytes);
  }
  return Math.random().toString(36).substring(2, 15);
}
