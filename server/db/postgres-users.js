import { randomUUID } from 'node:crypto';
import { createPostgresRateLimits } from './postgres-rate-limits.js';

const ADMIN_CONTINUITY_LOCK = 93217021;

function iso(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    usernameNormalized: row.username_normalized,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    passwordHash: row.password_hash,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  };
}

function mapSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    createdAt: iso(row.created_at),
    expiresAt: iso(row.expires_at),
    revokedAt: iso(row.revoked_at)
  };
}

const USER_UPDATE_COLUMNS = Object.freeze({
  displayName: 'display_name',
  role: 'role',
  status: 'status',
  passwordHash: 'password_hash',
  updatedAt: 'updated_at'
});

function userUpdateStatement(id, patch = {}) {
  const assignments = [];
  const values = [];
  for (const [key, column] of Object.entries(USER_UPDATE_COLUMNS)) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    values.push(patch[key]);
    assignments.push(`${column} = $${values.length}`);
  }
  if (assignments.length === 0) return null;
  values.push(id);
  return {
    text: `UPDATE app_users SET ${assignments.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  };
}

export function createPostgresUsers(pool) {
  const rateLimits = createPostgresRateLimits(pool);
  return {
    ...rateLimits,

    async createUser(record) {
      const id = record.id ?? randomUUID();
      const result = await pool.query(
        `INSERT INTO app_users (
          id, username, username_normalized, display_name, role, status, password_hash, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [
          id,
          record.username,
          record.usernameNormalized,
          record.displayName ?? null,
          record.role,
          record.status,
          record.passwordHash,
          record.createdAt,
          record.updatedAt
        ]
      );
      return mapUser(result.rows[0]);
    },

    async updateUser(id, patch = {}) {
      const statement = userUpdateStatement(id, patch);
      if (!statement) return this.getUser(id);
      const result = await pool.query(statement.text, statement.values);
      return mapUser(result.rows[0]);
    },

    async updateUserWithAdminContinuity(id, patch = {}) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SELECT pg_advisory_xact_lock(${ADMIN_CONTINUITY_LOCK})`);

        const currentResult = await client.query('SELECT * FROM app_users WHERE id = $1 FOR UPDATE', [id]);
        const current = mapUser(currentResult.rows[0]);
        if (!current) {
          await client.query('COMMIT');
          return null;
        }

        const nextRole = Object.prototype.hasOwnProperty.call(patch, 'role') ? patch.role : current.role;
        const nextStatus = Object.prototype.hasOwnProperty.call(patch, 'status') ? patch.status : current.status;
        const removesActiveAdmin = current.role === 'ADMIN'
          && current.status === 'ACTIVE'
          && (nextRole !== 'ADMIN' || nextStatus !== 'ACTIVE');

        if (removesActiveAdmin) {
          const countResult = await client.query(
            "SELECT COUNT(*)::int AS count FROM app_users WHERE role = 'ADMIN' AND status = 'ACTIVE'"
          );
          if (Number(countResult.rows[0]?.count ?? 0) <= 1) throw new Error('LAST_ADMIN_FORBIDDEN');
        }

        const statement = userUpdateStatement(id, patch);
        if (!statement) {
          await client.query('COMMIT');
          return current;
        }
        const result = await client.query(statement.text, statement.values);
        await client.query('COMMIT');
        return mapUser(result.rows[0]);
      } catch (error) {
        try { await client.query('ROLLBACK'); } catch {}
        throw error;
      } finally {
        client.release();
      }
    },

    async getUser(id) {
      const result = await pool.query('SELECT * FROM app_users WHERE id = $1', [id]);
      return mapUser(result.rows[0]);
    },

    async findUserByUsernameNormalized(usernameNormalized) {
      const result = await pool.query('SELECT * FROM app_users WHERE username_normalized = $1', [usernameNormalized]);
      return mapUser(result.rows[0]);
    },

    async listUsers() {
      const result = await pool.query('SELECT * FROM app_users ORDER BY username_normalized ASC');
      return result.rows.map(mapUser);
    },

    async createUserSession(record) {
      const id = record.id ?? randomUUID();
      const result = await pool.query(
        `INSERT INTO app_user_sessions (id, user_id, token_hash, created_at, expires_at, revoked_at)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [id, record.userId, record.tokenHash, record.createdAt, record.expiresAt, record.revokedAt ?? null]
      );
      return mapSession(result.rows[0]);
    },

    async findUserSessionByTokenHash(tokenHash) {
      const result = await pool.query('SELECT * FROM app_user_sessions WHERE token_hash = $1', [tokenHash]);
      return mapSession(result.rows[0]);
    },

    async revokeUserSession(id, { revokedAt }) {
      const result = await pool.query(
        'UPDATE app_user_sessions SET revoked_at = $1 WHERE id = $2 RETURNING *',
        [revokedAt, id]
      );
      return mapSession(result.rows[0]);
    },

    async revokeUserSessionsForUser(userId, { revokedAt }) {
      const result = await pool.query(
        'UPDATE app_user_sessions SET revoked_at = $1 WHERE user_id = $2 RETURNING id',
        [revokedAt, userId]
      );
      return result.rowCount;
    }
  };
}
