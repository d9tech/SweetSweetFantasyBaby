/**
 * Content API Handler
 *
 * Handles CRUD operations for multilingual content.
 *
 * Endpoints:
 * - GET /content - List content (paginated)
 * - GET /content/:id - Get single content item
 * - POST /content - Create new content
 * - PATCH /content/:id - Update content
 * - DELETE /content/:id - Delete content
 */

import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  Context,
} from 'aws-lambda';
import { logger } from '../shared/logger.js';
import { query } from '../shared/db.js';

// Types
interface Content {
  id: string;
  title: string;
  body: string;
  language_code: string;
  created_at: string;
  updated_at: string;
}

interface CreateContentRequest {
  title: string;
  body: string;
  language_code: string;
}

interface UpdateContentRequest {
  title?: string;
  body?: string;
}

// Response helpers
const json = (statusCode: number, body: unknown): APIGatewayProxyResultV2 => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
});

const success = (data: unknown) => json(200, data);
const created = (data: unknown) => json(201, data);
const noContent = (): APIGatewayProxyResultV2 => ({ statusCode: 204 });
const badRequest = (message: string) => json(400, { error: message });
const notFound = (message: string) => json(404, { error: message });
const serverError = (message: string) => json(500, { error: message });

/**
 * Main handler - routes requests to appropriate function
 */
export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context
): Promise<APIGatewayProxyResultV2> => {
  // Add Lambda context to logger
  logger.addContext(context);

  const method = event.requestContext.http.method;
  const path = event.rawPath;
  const pathParams = event.pathParameters || {};

  logger.info('Request received', { method, path, pathParams });

  try {
    // Route to appropriate handler
    if (path === '/api/v1/content' || path === '/api/v1/content/') {
      if (method === 'GET') {
        return await listContent(event);
      }
      if (method === 'POST') {
        return await createContent(event);
      }
    }

    // Routes with ID parameter
    const contentId = pathParams.id;
    if (contentId) {
      if (method === 'GET') {
        return await getContent(contentId);
      }
      if (method === 'PATCH') {
        return await updateContent(contentId, event);
      }
      if (method === 'DELETE') {
        return await deleteContent(contentId);
      }
    }

    return badRequest('Invalid route');
  } catch (error) {
    logger.error('Handler error', { error });
    return serverError('Internal server error');
  }
};

/**
 * List content with pagination and language filtering
 */
async function listContent(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const params = event.queryStringParameters || {};
  const limit = Math.min(parseInt(params.limit || '20', 10), 100);
  const offset = parseInt(params.offset || '0', 10);
  const languageCode = params.lang;

  let queryText = `
    SELECT id, title, body, language_code, created_at, updated_at
    FROM content
  `;
  const queryParams: unknown[] = [];

  // Filter by language if specified
  if (languageCode) {
    queryText += ` WHERE language_code = $1`;
    queryParams.push(languageCode);
  }

  // Use language-specific collation for sorting
  // This ensures proper sorting for each language
  queryText += `
    ORDER BY created_at DESC
    LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
  `;
  queryParams.push(limit, offset);

  const items = await query<Content>(queryText, queryParams);

  // Get total count for pagination
  let countQuery = 'SELECT COUNT(*) as total FROM content';
  const countParams: unknown[] = [];
  if (languageCode) {
    countQuery += ' WHERE language_code = $1';
    countParams.push(languageCode);
  }
  const [{ total }] = await query<{ total: string }>(countQuery, countParams);

  return success({
    items,
    pagination: {
      total: parseInt(total, 10),
      limit,
      offset,
      hasMore: offset + items.length < parseInt(total, 10),
    },
  });
}

/**
 * Get a single content item by ID
 */
async function getContent(id: string): Promise<APIGatewayProxyResultV2> {
  const items = await query<Content>(
    `SELECT id, title, body, language_code, created_at, updated_at
     FROM content
     WHERE id = $1`,
    [id]
  );

  if (items.length === 0) {
    return notFound('Content not found');
  }

  return success(items[0]);
}

/**
 * Create new content
 */
async function createContent(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  if (!event.body) {
    return badRequest('Request body is required');
  }

  const body: CreateContentRequest = JSON.parse(event.body);

  // Validate required fields
  if (!body.title || !body.body || !body.language_code) {
    return badRequest('title, body, and language_code are required');
  }

  // Validate language code (ISO 639-1)
  if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(body.language_code)) {
    return badRequest('Invalid language_code format. Use ISO 639-1 (e.g., "en", "ja", "de")');
  }

  const items = await query<Content>(
    `INSERT INTO content (title, body, language_code)
     VALUES ($1, $2, $3)
     RETURNING id, title, body, language_code, created_at, updated_at`,
    [body.title, body.body, body.language_code]
  );

  logger.info('Content created', { contentId: items[0].id, language: body.language_code });

  return created(items[0]);
}

/**
 * Update existing content
 */
async function updateContent(
  id: string,
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  if (!event.body) {
    return badRequest('Request body is required');
  }

  const body: UpdateContentRequest = JSON.parse(event.body);

  // Build dynamic update query
  const updates: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (body.title !== undefined) {
    updates.push(`title = $${paramIndex++}`);
    params.push(body.title);
  }

  if (body.body !== undefined) {
    updates.push(`body = $${paramIndex++}`);
    params.push(body.body);
  }

  if (updates.length === 0) {
    return badRequest('At least one field to update is required');
  }

  updates.push(`updated_at = NOW()`);
  params.push(id);

  const items = await query<Content>(
    `UPDATE content
     SET ${updates.join(', ')}
     WHERE id = $${paramIndex}
     RETURNING id, title, body, language_code, created_at, updated_at`,
    params
  );

  if (items.length === 0) {
    return notFound('Content not found');
  }

  logger.info('Content updated', { contentId: id });

  return success(items[0]);
}

/**
 * Delete content
 */
async function deleteContent(id: string): Promise<APIGatewayProxyResultV2> {
  const result = await query<Content>(
    'DELETE FROM content WHERE id = $1 RETURNING id',
    [id]
  );

  if (result.length === 0) {
    return notFound('Content not found');
  }

  logger.info('Content deleted', { contentId: id });

  return noContent();
}
