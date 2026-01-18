import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

// Encryption key should be 32 bytes for AES-256
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypts sensitive data using AES-256-GCM
 * @param text - The plaintext to encrypt
 * @returns Encrypted string in format: iv:authTag:encryptedData (all base64)
 */
export function encrypt(text: string): string {
  if (!text) return text;
  
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = Buffer.from(ENCRYPTION_KEY, 'hex');
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    const authTag = cipher.getAuthTag();
    
    // Return format: iv:authTag:encryptedData (all base64)
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypts data encrypted with the encrypt function
 * @param encryptedText - The encrypted string in format iv:authTag:encryptedData
 * @returns Decrypted plaintext
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText) return encryptedText;
  
  // Check if this is encrypted data (has the expected format)
  if (!encryptedText.includes(':')) {
    // Return as-is if not encrypted (for backward compatibility)
    return encryptedText;
  }
  
  try {
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
      // Not in expected format, return as-is
      return encryptedText;
    }
    
    const [ivBase64, authTagBase64, encrypted] = parts;
    
    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');
    const key = Buffer.from(ENCRYPTION_KEY, 'hex');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    // Return as-is if decryption fails (might be unencrypted legacy data)
    return encryptedText;
  }
}

/**
 * Check if a string appears to be encrypted
 */
export function isEncrypted(text: string): boolean {
  if (!text) return false;
  const parts = text.split(':');
  return parts.length === 3 && parts.every(p => p.length > 0);
}

/**
 * Generate a new encryption key (for initial setup)
 * Run this once and store the result in ENCRYPTION_KEY env variable
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}
