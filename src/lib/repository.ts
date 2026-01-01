/**
 * Repository Layer for NeXSS
 * 
 * Abstracts database queries into a clean, reusable interface.
 * Provides type-safe data access patterns.
 */

import { pool } from './db';
import { QueryResult, QueryResultRow } from 'pg';

// ============================================
// BASE REPOSITORY
// ============================================

export interface BaseEntity {
  id?: number;
  created_at?: Date;
  updated_at?: Date;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Base repository with common CRUD operations
 */
export abstract class BaseRepository<T extends BaseEntity> {
  protected tableName: string;
  protected primaryKey: string;

  constructor(tableName: string, primaryKey: string = 'id') {
    this.tableName = tableName;
    this.primaryKey = primaryKey;
  }

  /**
   * Find entity by ID
   */
  async findById(id: number | string): Promise<T | null> {
    const result = await pool.query<T>(
      `SELECT * FROM ${this.tableName} WHERE ${this.primaryKey} = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Find all entities with pagination
   */
  async findAll(options: PaginationOptions = {}): Promise<PaginatedResult<T>> {
    const { page = 1, limit = 50, sortBy = this.primaryKey, sortOrder = 'DESC' } = options;
    const offset = (page - 1) * limit;

    // Get total count
    const countResult = await pool.query(`SELECT COUNT(*) FROM ${this.tableName}`);
    const total = parseInt(countResult.rows[0].count, 10);

    // Get paginated data
    const result = await pool.query<T>(
      `SELECT * FROM ${this.tableName} ORDER BY ${sortBy} ${sortOrder} LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return {
      data: result.rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Find entities by condition
   */
  async findWhere(conditions: Partial<T>, options: PaginationOptions = {}): Promise<T[]> {
    const { sortBy = this.primaryKey, sortOrder = 'DESC', limit, page = 1 } = options;
    const keys = Object.keys(conditions);
    const values = Object.values(conditions);
    
    const whereClause = keys.map((key, i) => `${key} = $${i + 1}`).join(' AND ');
    
    let query = `SELECT * FROM ${this.tableName} WHERE ${whereClause} ORDER BY ${sortBy} ${sortOrder}`;
    
    if (limit) {
      const offset = (page - 1) * limit;
      query += ` LIMIT ${limit} OFFSET ${offset}`;
    }

    const result = await pool.query<T>(query, values);
    return result.rows;
  }

  /**
   * Find one entity by condition
   */
  async findOneWhere(conditions: Partial<T>): Promise<T | null> {
    const results = await this.findWhere(conditions, { limit: 1 });
    return results[0] || null;
  }

  /**
   * Create new entity
   */
  async create(data: Omit<T, 'id' | 'created_at' | 'updated_at'>): Promise<T> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

    const result = await pool.query<T>(
      `INSERT INTO ${this.tableName} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      values
    );

    return result.rows[0];
  }

  /**
   * Update entity by ID
   */
  async update(id: number | string, data: Partial<T>): Promise<T | null> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');

    const result = await pool.query<T>(
      `UPDATE ${this.tableName} SET ${setClause}, updated_at = NOW() WHERE ${this.primaryKey} = $${keys.length + 1} RETURNING *`,
      [...values, id]
    );

    return result.rows[0] || null;
  }

  /**
   * Delete entity by ID
   */
  async delete(id: number | string): Promise<boolean> {
    const result = await pool.query(
      `DELETE FROM ${this.tableName} WHERE ${this.primaryKey} = $1`,
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Delete entities by condition
   */
  async deleteWhere(conditions: Partial<T>): Promise<number> {
    const keys = Object.keys(conditions);
    const values = Object.values(conditions);
    const whereClause = keys.map((key, i) => `${key} = $${i + 1}`).join(' AND ');

    const result = await pool.query(
      `DELETE FROM ${this.tableName} WHERE ${whereClause}`,
      values
    );

    return result.rowCount ?? 0;
  }

  /**
   * Check if entity exists
   */
  async exists(id: number | string): Promise<boolean> {
    const result = await pool.query(
      `SELECT 1 FROM ${this.tableName} WHERE ${this.primaryKey} = $1 LIMIT 1`,
      [id]
    );
    return result.rows.length > 0;
  }

  /**
   * Count entities
   */
  async count(conditions?: Partial<T>): Promise<number> {
    let query = `SELECT COUNT(*) FROM ${this.tableName}`;
    const values: unknown[] = [];

    if (conditions) {
      const keys = Object.keys(conditions);
      const whereClause = keys.map((key, i) => `${key} = $${i + 1}`).join(' AND ');
      query += ` WHERE ${whereClause}`;
      values.push(...Object.values(conditions));
    }

    const result = await pool.query(query, values);
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Raw query execution
   */
  protected async query<R extends QueryResultRow = T & QueryResultRow>(sql: string, params?: unknown[]): Promise<QueryResult<R>> {
    return pool.query<R>(sql, params);
  }
}

// ============================================
// REPORT REPOSITORY
// ============================================

export interface Report extends BaseEntity {
  reporter_id: string;
  cookie: string;
  dom: string;
  url: string;
  useragent: string;
  ip_address: string;
  timestamp: Date;
  screenshot?: string;
  local_storage?: string;
  session_storage?: string;
  status?: string;
  notes?: string;
}

class ReportRepository extends BaseRepository<Report> {
  constructor() {
    super('reports');
  }

  /**
   * Find reports with filters
   */
  async findWithFilters(filters: {
    search?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResult<Report>> {
    const { search, status, startDate, endDate, page = 1, limit = 50 } = filters;
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (search) {
      conditions.push(`(url ILIKE $${paramIndex} OR cookie ILIKE $${paramIndex} OR ip_address ILIKE $${paramIndex})`);
      values.push(`%${search}%`);
      paramIndex++;
    }

    if (status) {
      conditions.push(`status = $${paramIndex}`);
      values.push(status);
      paramIndex++;
    }

    if (startDate) {
      conditions.push(`timestamp >= $${paramIndex}`);
      values.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`timestamp <= $${paramIndex}`);
      values.push(endDate);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    // Count
    const countResult = await this.query<{ count: string }>(
      `SELECT COUNT(*) FROM reports ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Data
    const result = await this.query<Report>(
      `SELECT * FROM reports ${whereClause} ORDER BY timestamp DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...values, limit, offset]
    );

    return {
      data: result.rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get recent reports for dashboard
   */
  async getRecentReports(limit: number = 10): Promise<Report[]> {
    const result = await this.query<Report>(
      'SELECT id, url, ip_address, timestamp, status FROM reports ORDER BY timestamp DESC LIMIT $1',
      [limit]
    );
    return result.rows;
  }

  /**
   * Get reports by reporter ID
   */
  async findByReporterId(reporterId: string): Promise<Report[]> {
    return this.findWhere({ reporter_id: reporterId } as Partial<Report>);
  }

  /**
   * Update report status
   */
  async updateStatus(id: number, status: string, notes?: string): Promise<Report | null> {
    const updates: Partial<Report> = { status };
    if (notes !== undefined) updates.notes = notes;
    return this.update(id, updates);
  }

  /**
   * Get report statistics
   */
  async getStatistics(): Promise<{
    total: number;
    today: number;
    thisWeek: number;
    thisMonth: number;
    byStatus: Record<string, number>;
  }> {
    const result = await this.query<{
      total: string;
      today: string;
      this_week: string;
      this_month: string;
    }>(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE timestamp >= CURRENT_DATE) as today,
        COUNT(*) FILTER (WHERE timestamp >= CURRENT_DATE - INTERVAL '7 days') as this_week,
        COUNT(*) FILTER (WHERE timestamp >= CURRENT_DATE - INTERVAL '30 days') as this_month
      FROM reports
    `);

    const statusResult = await this.query<{ status: string; count: string }>(
      'SELECT COALESCE(status, \'new\') as status, COUNT(*) FROM reports GROUP BY status'
    );

    const byStatus: Record<string, number> = {};
    for (const row of statusResult.rows) {
      byStatus[row.status] = parseInt(row.count, 10);
    }

    return {
      total: parseInt(result.rows[0].total, 10),
      today: parseInt(result.rows[0].today, 10),
      thisWeek: parseInt(result.rows[0].this_week, 10),
      thisMonth: parseInt(result.rows[0].this_month, 10),
      byStatus,
    };
  }
}

// ============================================
// USER REPOSITORY
// ============================================

export interface User extends BaseEntity {
  username: string;
  password_hash: string;
  totp_secret?: string;
  totp_enabled: boolean;
  backup_codes?: string[];
  last_login?: Date;
  login_attempts?: number;
  locked_until?: Date;
}

class UserRepository extends BaseRepository<User> {
  constructor() {
    super('users');
  }

  /**
   * Find user by username
   */
  async findByUsername(username: string): Promise<User | null> {
    return this.findOneWhere({ username } as Partial<User>);
  }

  /**
   * Update last login
   */
  async updateLastLogin(id: number): Promise<void> {
    await this.query(
      'UPDATE users SET last_login = NOW(), login_attempts = 0 WHERE id = $1',
      [id]
    );
  }

  /**
   * Increment login attempts
   */
  async incrementLoginAttempts(id: number): Promise<number> {
    const result = await this.query<{ login_attempts: number }>(
      'UPDATE users SET login_attempts = COALESCE(login_attempts, 0) + 1 WHERE id = $1 RETURNING login_attempts',
      [id]
    );
    return result.rows[0]?.login_attempts || 0;
  }

  /**
   * Lock user account
   */
  async lockAccount(id: number, durationMinutes: number = 30): Promise<void> {
    await this.query(
      'UPDATE users SET locked_until = NOW() + $2 * INTERVAL \'1 minute\' WHERE id = $1',
      [id, durationMinutes]
    );
  }

  /**
   * Check if account is locked
   */
  async isAccountLocked(id: number): Promise<boolean> {
    const result = await this.query<{ locked: boolean }>(
      'SELECT locked_until > NOW() as locked FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0]?.locked || false;
  }

  /**
   * Enable 2FA
   */
  async enableTotp(id: number, secret: string): Promise<void> {
    await this.query(
      'UPDATE users SET totp_secret = $2, totp_enabled = true WHERE id = $1',
      [id, secret]
    );
  }

  /**
   * Disable 2FA
   */
  async disableTotp(id: number): Promise<void> {
    await this.query(
      'UPDATE users SET totp_secret = NULL, totp_enabled = false, backup_codes = NULL WHERE id = $1',
      [id]
    );
  }
}

// ============================================
// SETTINGS REPOSITORY
// ============================================

export interface Setting extends BaseEntity {
  key: string;
  value: string;
  type: 'string' | 'number' | 'boolean' | 'json';
  description?: string;
}

class SettingsRepository extends BaseRepository<Setting> {
  constructor() {
    super('settings', 'key');
  }

  /**
   * Get setting value with type conversion
   */
  async getValue<T = string>(key: string, defaultValue?: T): Promise<T | undefined> {
    const setting = await this.findById(key);
    if (!setting) return defaultValue;

    switch (setting.type) {
      case 'number':
        return Number(setting.value) as T;
      case 'boolean':
        return (setting.value === 'true') as unknown as T;
      case 'json':
        return JSON.parse(setting.value) as T;
      default:
        return setting.value as unknown as T;
    }
  }

  /**
   * Set setting value with type
   */
  async setValue<T>(key: string, value: T, type?: Setting['type']): Promise<void> {
    const detectedType = type || this.detectType(value);
    const stringValue = detectedType === 'json' ? JSON.stringify(value) : String(value);

    await this.query(
      `INSERT INTO settings (key, value, type) VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = $2, type = $3, updated_at = NOW()`,
      [key, stringValue, detectedType]
    );
  }

  /**
   * Get all settings as object
   */
  async getAllAsObject(): Promise<Record<string, unknown>> {
    const result = await this.findAll({ limit: 1000 });
    const settings: Record<string, unknown> = {};

    for (const setting of result.data) {
      switch (setting.type) {
        case 'number':
          settings[setting.key] = Number(setting.value);
          break;
        case 'boolean':
          settings[setting.key] = setting.value === 'true';
          break;
        case 'json':
          settings[setting.key] = JSON.parse(setting.value);
          break;
        default:
          settings[setting.key] = setting.value;
      }
    }

    return settings;
  }

  private detectType(value: unknown): Setting['type'] {
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'object') return 'json';
    return 'string';
  }
}

// ============================================
// TRAFFIC REPOSITORY
// ============================================

export interface Traffic extends BaseEntity {
  path: string;
  method: string;
  ip_address: string;
  user_agent: string;
  timestamp: Date;
  response_time?: number;
  status_code?: number;
}

class TrafficRepository extends BaseRepository<Traffic> {
  constructor() {
    super('traffic');
  }

  /**
   * Get traffic statistics for period
   */
  async getStatistics(days: number = 7): Promise<{
    total: number;
    uniqueIPs: number;
    avgResponseTime: number;
    byPath: Record<string, number>;
    byDay: Array<{ date: string; count: number }>;
  }> {
    const statsResult = await this.query<{
      total: string;
      unique_ips: string;
      avg_response: string;
    }>(`
      SELECT 
        COUNT(*) as total,
        COUNT(DISTINCT ip_address) as unique_ips,
        AVG(response_time) as avg_response
      FROM traffic
      WHERE timestamp >= CURRENT_DATE - INTERVAL '${days} days'
    `);

    const pathResult = await this.query<{ path: string; count: string }>(
      `SELECT path, COUNT(*) FROM traffic 
       WHERE timestamp >= CURRENT_DATE - INTERVAL '${days} days'
       GROUP BY path ORDER BY COUNT(*) DESC LIMIT 10`
    );

    const dailyResult = await this.query<{ date: string; count: string }>(
      `SELECT DATE(timestamp) as date, COUNT(*) 
       FROM traffic 
       WHERE timestamp >= CURRENT_DATE - INTERVAL '${days} days'
       GROUP BY DATE(timestamp) ORDER BY date`
    );

    const byPath: Record<string, number> = {};
    for (const row of pathResult.rows) {
      byPath[row.path] = parseInt(row.count, 10);
    }

    return {
      total: parseInt(statsResult.rows[0].total, 10),
      uniqueIPs: parseInt(statsResult.rows[0].unique_ips, 10),
      avgResponseTime: parseFloat(statsResult.rows[0].avg_response) || 0,
      byPath,
      byDay: dailyResult.rows.map(r => ({ date: r.date, count: parseInt(r.count, 10) })),
    };
  }

  /**
   * Log traffic entry
   */
  async log(entry: Omit<Traffic, 'id' | 'created_at' | 'updated_at' | 'timestamp'>): Promise<void> {
    await this.query(
      `INSERT INTO traffic (path, method, ip_address, user_agent, response_time, status_code, timestamp) 
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [entry.path, entry.method, entry.ip_address, entry.user_agent, entry.response_time, entry.status_code]
    );
  }
}

// ============================================
// SINGLETON INSTANCES
// ============================================

export const reportRepository = new ReportRepository();
export const userRepository = new UserRepository();
export const settingsRepository = new SettingsRepository();
export const trafficRepository = new TrafficRepository();

// ============================================
// REPOSITORY FACTORY
// ============================================

export const repositories = {
  reports: reportRepository,
  users: userRepository,
  settings: settingsRepository,
  traffic: trafficRepository,
};

export type RepositoryName = keyof typeof repositories;

export function getRepository<T extends RepositoryName>(name: T): typeof repositories[T] {
  return repositories[name];
}
