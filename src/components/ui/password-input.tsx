'use client';

import { useState, useEffect, useCallback } from 'react';
import { validatePassword, getStrengthColor, getStrengthProgress, generateSecurePassword } from '@/lib/password-policy';
import type { PasswordStrengthResult, PasswordPolicy } from '@/lib/password-policy';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

// ============================================
// TYPES
// ============================================

interface PasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  onValidationChange?: (result: PasswordStrengthResult) => void;
  policy?: PasswordPolicy;
  context?: { email?: string; username?: string };
  placeholder?: string;
  showStrength?: boolean;
  showSuggestions?: boolean;
  showGenerator?: boolean;
  className?: string;
  disabled?: boolean;
}

// ============================================
// PASSWORD INPUT WITH STRENGTH METER
// ============================================

export function PasswordInput({
  value,
  onChange,
  onValidationChange,
  policy,
  context,
  placeholder = 'Enter password',
  showStrength = true,
  showSuggestions = true,
  showGenerator = false,
  className = '',
  disabled = false,
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [validation, setValidation] = useState<PasswordStrengthResult | null>(null);
  const [focused, setFocused] = useState(false);

  // Validate on value change
  useEffect(() => {
    if (value) {
      const result = validatePassword(value, policy, context);
      setValidation(result);
      onValidationChange?.(result);
    } else {
      setValidation(null);
    }
  }, [value, policy, context, onValidationChange]);

  const handleGeneratePassword = useCallback(() => {
    const newPassword = generateSecurePassword(16);
    onChange(newPassword);
  }, [onChange]);

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Password Input */}
      <div className="relative">
        <Input
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          disabled={disabled}
          className="pr-20"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            tabIndex={-1}
          >
            {showPassword ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
                <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
              </svg>
            )}
          </button>
          {showGenerator && (
            <button
              type="button"
              onClick={handleGeneratePassword}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              title="Generate secure password"
              tabIndex={-1}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Strength Meter */}
      {showStrength && validation && value && (
        <div className="space-y-1">
          {/* Progress Bar */}
          <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                validation.strength === 'weak' ? 'bg-red-500' :
                validation.strength === 'fair' ? 'bg-orange-500' :
                validation.strength === 'good' ? 'bg-yellow-500' :
                validation.strength === 'strong' ? 'bg-green-500' :
                'bg-emerald-500'
              }`}
              style={{ width: `${getStrengthProgress(validation.score)}%` }}
            />
          </div>
          
          {/* Strength Label */}
          <div className="flex justify-between items-center text-xs">
            <span className={getStrengthColor(validation.strength)}>
              {validation.strength.charAt(0).toUpperCase() + validation.strength.slice(1).replace('-', ' ')}
            </span>
            <span className="text-gray-500">
              Entropy: {validation.entropy} bits
            </span>
          </div>
        </div>
      )}

      {/* Errors */}
      {validation && validation.errors.length > 0 && (focused || !validation.valid) && (
        <div className="text-xs space-y-0.5">
          {validation.errors.map((error, i) => (
            <p key={i} className="text-red-500 flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              {error}
            </p>
          ))}
        </div>
      )}

      {/* Suggestions */}
      {showSuggestions && validation && validation.suggestions.length > 0 && focused && validation.valid && (
        <div className="text-xs space-y-0.5">
          {validation.suggestions.map((suggestion, i) => (
            <p key={i} className="text-blue-500 flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              {suggestion}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// PASSWORD REQUIREMENTS CHECKLIST
// ============================================

interface PasswordChecklistProps {
  password: string;
  policy?: PasswordPolicy;
}

export function PasswordChecklist({ password, policy }: PasswordChecklistProps) {
  const checks = [
    {
      label: `At least ${policy?.minLength || 12} characters`,
      passed: password.length >= (policy?.minLength || 12),
    },
    {
      label: 'Contains uppercase letter',
      passed: /[A-Z]/.test(password),
      required: policy?.requireUppercase !== false,
    },
    {
      label: 'Contains lowercase letter',
      passed: /[a-z]/.test(password),
      required: policy?.requireLowercase !== false,
    },
    {
      label: 'Contains number',
      passed: /[0-9]/.test(password),
      required: policy?.requireNumbers !== false,
    },
    {
      label: 'Contains symbol',
      passed: /[^a-zA-Z0-9]/.test(password),
      required: policy?.requireSymbols === true,
    },
  ].filter(check => check.required !== false);

  return (
    <div className="text-xs space-y-1">
      {checks.map((check, i) => (
        <div key={i} className="flex items-center gap-2">
          {check.passed ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
            </svg>
          )}
          <span className={check.passed ? 'text-green-600 dark:text-green-400' : 'text-gray-500'}>
            {check.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ============================================
// EXPORT
// ============================================

export { validatePassword, generateSecurePassword, getStrengthColor, getStrengthProgress };
export type { PasswordStrengthResult, PasswordPolicy };
