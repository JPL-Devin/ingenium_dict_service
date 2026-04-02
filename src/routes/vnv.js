import {
  createVerificationItemSchema,
  getVerificationItemsSchema,
  getVerificationItemByIdSchema,
  updateVerificationItemSchema,
  deleteVerificationItemSchema,
  bulkQueryVerificationItemsSchema
} from '../schemas/vnvSchema.js';


export default async function vnvRoutes(fastify, options) {

  const collection = fastify.db.collection('vnv')

  // POST /vnv/vis
  fastify.post('/vnv/vis', {
    schema: createVerificationItemSchema,
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      const verificationItems = request.body;
      const collection = fastify.db.collection('vnv');

      try {
        // Step 1: Check for existing vi_id
        const viIds = verificationItems
          .map(item => item.vi_id)
          .filter(Boolean);

        if (viIds.length > 0) {
          const query = `
          FOR doc IN vnv
            FILTER doc.vi_id IN @viIds
            RETURN doc.vi_id
        `;
          const cursor = await fastify.db.query(query, { viIds });
          const existingViIds = await cursor.all();

          if (existingViIds.length > 0) {
            return reply.code(409).send({
              error: 'Conflict',
              message: `Verification items with the following vi_ids already exist: ${existingViIds.join(', ')}`
            });
          }
        }

        // Step 2: Format and insert in bulk
        const newItems = verificationItems.map(item => ({
          vi_id: item.vi_id,
          vi_name: item.vi_name,
          vi_owner: item.vi_owner,
          vi_type: item.vi_type,
          vi_text: item.vi_text,
          vas: item.vas,
          vacs: item.vacs
        }));

        const result = await collection.saveAll(newItems, { returnNew: true });

        const savedItems = result.map(r => r.new);
        return reply.code(201).send(savedItems);

      } catch (error) {
        fastify.log.error(error, 'Failed to save verification items');
        return reply.code(400).send({
          error: 'Bad Request',
          message: error.message
        });
      }
    }
  });


  // GET /vnv/vis
  fastify.get('/vnv/vis', {
    schema: getVerificationItemsSchema,
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      const {
        sort = 'asc',
        sort_by = 'vi_name',
        limit = 20,
        offset = 0,
        wild = false,
        vi_id,
        vi_name,
        vi_owner,
        vi_type,
        vi_text,
        va_poc,
        vac_name
      } = request.query;

      try {
        let filters = [];
        let bindVars = {};

        // Helper: add a filter for a field depending on wild mode
        function addFilter(fieldName, value) {
          if (wild) {
            // Wildcard match (case-insensitive)
            filters.push(`CONTAINS(LOWER(TO_STRING(doc.${fieldName})), LOWER(@${fieldName}))`);
          } else {
            // Exact match
            filters.push(`doc.${fieldName} == @${fieldName}`);
          }
          bindVars[fieldName] = value;
        }

        if (vi_id) addFilter('vi_id', vi_id);
        if (vi_name) addFilter('vi_name', vi_name);
        if (vi_owner) addFilter('vi_owner', vi_owner);
        if (vi_type) addFilter('vi_type', vi_type);
        if (vi_text) addFilter('vi_text', vi_text);
        if (va_poc) addFilter('va_poc', va_poc);
        if (vac_name) addFilter('vac_name', vac_name);

        const filterClause = filters.length ? `FILTER ${filters.join(' AND ')}` : '';

        const aqlQuery = `
          FOR doc IN vnv
            ${filterClause}
            SORT doc.${sort_by} ${sort.toUpperCase()}
            LIMIT @offset, @limit
            RETURN doc
        `;

        const cursor = await fastify.db.query(aqlQuery, { ...bindVars, limit, offset }, { fullCount: true });

        const items = await cursor.all();
        const totalCount = cursor.extra?.stats?.fullCount ?? items.length;

        reply.header('x-total-count', totalCount);
        return items;
      } catch (error) {
        reply.code(400).send({
          error: 'Bad Request',
          message: error.message
        });
      }
    }
  });



  // GET /vnv/vis/{vi_id}
  fastify.get('/vnv/vis/:vi_id', {
    schema: getVerificationItemByIdSchema,
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      const { vi_id } = request.params;

      try {

        const cursor = await fastify.db.query(
          `FOR doc IN vnv FILTER doc.vi_id == @vi_id LIMIT 1 RETURN doc`,
          { vi_id }
        );
        const verificationItem = await cursor.next();

        if (!verificationItem) {
          return reply.code(404).send({
            message: `The requested resource was not found.`
          });
        }
        return verificationItem;
      } catch (error) {
        reply.code(400).send({
          error: 'Bad Request',
          message: error.message
        });
      }
    }
  });

  // PATCH /vnv/vis/{vi_id}
  fastify.patch('/vnv/vis/:vi_id', {
    schema: updateVerificationItemSchema,
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      const { vi_id } = request.params;
      const updateData = request.body;
      try {
        // 1. Find document by vi_id
        const cursor = await fastify.db.query(
          `FOR doc IN vnv FILTER doc.vi_id == @vi_id LIMIT 1 RETURN doc`,
          { vi_id }
        );
        const existingDoc = await cursor.next();

        if (!existingDoc) {
          return reply.code(404).send({
            message: `VnV with ID '${vi_id}' not found.`
          });
        }
        
        // 2. Perform partial update by _key
        const { new: updatedDoc } = await collection.update(existingDoc._key, updateData, { returnNew: true });
        return updatedDoc;
      } catch (error) {
        reply.code(400).send({
          error: 'Bad Request',
          message: error.message
        });
      }
    }
  });

  // DELETE /vnv/vis/{vi_id}
  fastify.delete('/vnv/vis/:vi_id', {
    schema: deleteVerificationItemSchema,
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      const { vi_id } = request.params;
      try {
        // 1. Find document by vi_id
        const cursor = await fastify.db.query(
          `FOR doc IN vnv FILTER doc.vi_id == @vi_id LIMIT 1 RETURN doc`,
          { vi_id }
        );
        const existingDoc = await cursor.next();
        if (!existingDoc) {
          return reply.code(404).send({
            message: `The requested resource was not found.`
          });
        }
        // Step 2: Delete by _key
        await collection.remove(existingDoc._key);

        return reply.code(204).send();
      } catch (error) {
        reply.code(400).send({
          error: 'Bad Request',
          message: error.message
        });
      }
    }
  });

  // POST /vnv/vis/bulk
  fastify.post('/vnv/vis/bulk', {
    schema: bulkQueryVerificationItemsSchema,
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      const vi_ids = request.body;
      try {

        const query = `
          FOR doc IN vnv
            FILTER doc.vi_id IN @vi_ids
            RETURN doc
        `;

        const cursor = await fastify.db.query(query, { vi_ids });
        const verificationItems = await cursor.all();

        return verificationItems;
      } catch (error) {
        reply.code(400).send({
          error: 'Bad Request',
          message: error.message
        });
      }
    }
  });
}
