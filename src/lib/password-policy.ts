/**
 * Password Strength Policy for NeXSS
 * 
 * Enforces strong password requirements:
 * - Minimum length
 * - Character diversity (uppercase, lowercase, numbers, symbols)
 * - Common password checking
 * - Entropy calculation
 */

import { randomInt } from 'crypto';

// ============================================
// TYPES
// ============================================

export interface PasswordStrengthResult {
  valid: boolean;
  score: number; // 0-4 (0=weak, 4=very strong)
  strength: 'weak' | 'fair' | 'good' | 'strong' | 'very-strong';
  errors: string[];
  suggestions: string[];
  entropy: number;
}

export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSymbols: boolean;
  minScore: number; // Minimum score required (0-4)
  maxLength: number;
}

// ============================================
// DEFAULT POLICY
// ============================================

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 12,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSymbols: false, // Recommended but not required
  minScore: 2, // At least "good"
};

// ============================================
// COMMON PASSWORDS (Top 100 from breach databases)
// ============================================

const COMMON_PASSWORDS = new Set([
  'password', '123456', '12345678', 'qwerty', 'abc123', 'monkey', 'letmein',
  'dragon', '111111', 'baseball', 'iloveyou', 'trustno1', 'sunshine', 'master',
  'welcome', 'shadow', 'ashley', 'football', 'jesus', 'michael', 'ninja',
  'mustang', 'password1', 'password123', '123456789', '1234567', '1234567890',
  'admin', 'administrator', 'root', 'toor', 'pass', 'test', 'guest', 'demo',
  'qwerty123', 'asdfghjkl', 'zxcvbnm', '1q2w3e4r', 'qazwsx', 'password!',
  'changeme', 'login', 'user', 'admin123', 'root123', 'letmein123', 'welcome1',
  'p@ssw0rd', 'p@ssword', 'passw0rd', 'pa55w0rd', 'passw0rd!', 'admin@123',
]);

// Common patterns to reject
const COMMON_PATTERNS = [
  /^(.)\1+$/,           // All same characters (aaaa)
  /^(012|123|234|345|456|567|678|789|890)+$/,  // Sequential numbers
  /^(abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)+$/i,  // Sequential letters
  /^(qwert|werty|asdfg|zxcvb)+/i,  // Keyboard patterns
  /^(.+)\1+$/,          // Repeated patterns (abcabc)
];

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Calculate password entropy (bits)
 */
function calculateEntropy(password: string): number {
  const charsets = {
    lowercase: /[a-z]/.test(password) ? 26 : 0,
    uppercase: /[A-Z]/.test(password) ? 26 : 0,
    numbers: /[0-9]/.test(password) ? 10 : 0,
    symbols: /[^a-zA-Z0-9]/.test(password) ? 32 : 0,
  };
  
  const poolSize = Object.values(charsets).reduce((a, b) => a + b, 0);
  if (poolSize === 0) return 0;
  
  return Math.floor(password.length * Math.log2(poolSize));
}

/**
 * Check for common patterns
 */
function hasCommonPattern(password: string): boolean {
  const lower = password.toLowerCase();
  
  // Check common password list
  if (COMMON_PASSWORDS.has(lower)) return true;
  
  // Check patterns
  for (const pattern of COMMON_PATTERNS) {
    if (pattern.test(lower)) return true;
  }
  
  return false;
}

/**
 * Check for personal info (simple heuristic)
 */
function containsPersonalInfo(password: string, email?: string, username?: string): boolean {
  const lower = password.toLowerCase();
  
  if (email) {
    const emailParts = email.toLowerCase().split('@')[0];
    if (lower.includes(emailParts)) return true;
  }
  
  if (username && lower.includes(username.toLowerCase())) {
    return true;
  }
  
  // Check for year patterns
  const currentYear = new Date().getFullYear();
  for (let year = currentYear - 100; year <= currentYear; year++) {
    if (lower.includes(String(year))) {
      // Year alone is weak, year + other chars is ok
      if (password.length < 10) return true;
    }
  }
  
  return false;
}

// ============================================
// MAIN FUNCTIONS
// ============================================

/**
 * Validate password against policy
 */
export function validatePassword(
  password: string,
  policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY,
  context?: { email?: string; username?: string }
): PasswordStrengthResult {
  const errors: string[] = [];
  const suggestions: string[] = [];
  let score = 0;
  
  // Length checks
  if (password.length < policy.minLength) {
    errors.push(`Password must be at least ${policy.minLength} characters`);
  } else if (password.length >= policy.minLength) {
    score += 1;
    if (password.length >= 16) score += 0.5;
    if (password.length >= 20) score += 0.5;
  }
  
  if (password.length > policy.maxLength) {
    errors.push(`Password cannot exceed ${policy.maxLength} characters`);
  }
  
  // Character type checks
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumbers = /[0-9]/.test(password);
  const hasSymbols = /[^a-zA-Z0-9]/.test(password);
  
  if (policy.requireUppercase && !hasUppercase) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (policy.requireLowercase && !hasLowercase) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (policy.requireNumbers && !hasNumbers) {
    errors.push('Password must contain at least one number');
  }
  if (policy.requireSymbols && !hasSymbols) {
    errors.push('Password must contain at least one symbol');
  }
  
  // Character diversity scoring
  const diversity = [hasUppercase, hasLowercase, hasNumbers, hasSymbols].filter(Boolean).length;
  score += diversity * 0.5;
  
  if (diversity < 3) {
    suggestions.push('Use a mix of uppercase, lowercase, numbers, and symbols');
  }
  
  // Common password check
  if (hasCommonPattern(password)) {
    errors.push('Password is too common or follows a predictable pattern');
    score = Math.max(0, score - 2);
  }
  
  // Personal info check
  if (context && containsPersonalInfo(password, context.email, context.username)) {
    errors.push('Password should not contain personal information');
    score = Math.max(0, score - 1);
  }
  
  // Entropy calculation
  const entropy = calculateEntropy(password);
  if (entropy < 40) {
    suggestions.push('Consider using a longer or more varied password');
  } else if (entropy >= 60) {
    score += 0.5;
  } else if (entropy >= 80) {
    score += 1;
  }
  
  // Cap score at 4
  score = Math.min(4, Math.max(0, score));
  
  // Determine strength label
  let strength: PasswordStrengthResult['strength'];
  if (score < 1) strength = 'weak';
  else if (score < 2) strength = 'fair';
  else if (score < 3) strength = 'good';
  else if (score < 4) strength = 'strong';
  else strength = 'very-strong';
  
  // Add suggestions based on score
  if (score < 2 && !suggestions.length) {
    suggestions.push('Try using a passphrase: combine random words');
    suggestions.push('Avoid personal info like names, birthdays, or usernames');
  }
  
  // Check minimum score requirement
  if (score < policy.minScore) {
    errors.push(`Password strength must be at least "${['weak', 'fair', 'good', 'strong', 'very-strong'][policy.minScore]}"`);
  }
  
  return {
    valid: errors.length === 0,
    score: Math.round(score * 10) / 10,
    strength,
    errors,
    suggestions,
    entropy,
  };
}

/**
 * Generate a cryptographically secure random integer
 */
function secureRandomInt(max: number): number {
  return randomInt(max);
}

/**
 * Fisher-Yates shuffle using cryptographically secure random
 */
function secureShuffleString(str: string): string {
  const arr = str.split('');
  for (let i = arr.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join('');
}

/**
 * Generate a secure random password using crypto.randomInt()
 */
export function generateSecurePassword(length: number = 16): string {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  
  const allChars = uppercase + lowercase + numbers + symbols;
  
  let password = '';
  
  // Ensure at least one of each type using secure random
  password += uppercase[secureRandomInt(uppercase.length)];
  password += lowercase[secureRandomInt(lowercase.length)];
  password += numbers[secureRandomInt(numbers.length)];
  password += symbols[secureRandomInt(symbols.length)];
  
  // Fill rest with random chars
  for (let i = 4; i < length; i++) {
    password += allChars[secureRandomInt(allChars.length)];
  }
  
  // Shuffle the password using secure shuffle
  return secureShuffleString(password);
}

/**
 * Get password strength color for UI
 */
export function getStrengthColor(strength: PasswordStrengthResult['strength']): string {
  switch (strength) {
    case 'weak': return 'text-red-500';
    case 'fair': return 'text-orange-500';
    case 'good': return 'text-yellow-500';
    case 'strong': return 'text-green-500';
    case 'very-strong': return 'text-emerald-500';
    default: return 'text-gray-500';
  }
}

/**
 * Get password strength progress percentage
 */
export function getStrengthProgress(score: number): number {
  return Math.min(100, Math.max(0, score * 25));
}
