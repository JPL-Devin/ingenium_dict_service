import {
  getCustomScriptsSchema,
  createCustomScriptSchema,
  bulkQueryCustomScriptsSchema,
  getCustomScriptByIdSchema,
  updateCustomScriptSchema,
  deleteCustomScriptSchema
} from '../schemas/customScriptSchema.js';

export default async function customScriptRoutes(fastify, options) {

  const collection = fastify.db.collection('custom_script')

  // POST /custom_scripts
  fastify.post('/custom_scripts', {
    schema: createCustomScriptSchema,
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      const newCustomScripts = request.body;
      try {

        // Step 1: Check for existing scripts with same script_id
        const scriptIds = newCustomScripts
          .map(script => script.script_id)
          .filter(Boolean);

        if (scriptIds.length > 0) {
          const query = `
          FOR doc IN custom_script
            FILTER doc.script_id IN @scriptIds
            RETURN doc.script_id
        `;
          const cursor = await fastify.db.query(query, { scriptIds });
          const existingScriptIds = await cursor.all();

          if (existingScriptIds.length > 0) {
            return reply.code(409).send({
              error: 'Conflict',
              message: `Custom scripts with the following script_ids already exist: ${existingScriptIds.join(', ')}`
            });
          }
        }

        // Step 2: Bulk insert
        const result = await collection.saveAll(newCustomScripts, { returnNew: true });

        const savedScripts = result.map(r => r.new);
        return reply.code(201).send(savedScripts);

      } catch (error) {
        reply.code(400).send({
          error: 'Bad Request',
          message: error.message
        });
      }
    }
  });

  // GET /custom_scripts
  fastify.get('/custom_scripts', {
    schema: getCustomScriptsSchema,
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      const {
        sort = 'asc',
        limit = 20,
        offset = 0,
        wild = false,
        script_path,
        script_name,
        description,
        status
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

        if (script_path) addFilter('script_path', script_path);
        if (script_name) addFilter('script_name', script_name);
        if (description) addFilter('description', description);
        if (status) addFilter('status', status);

        const filterClause = filters.length ? `FILTER ${filters.join(' AND ')}` : '';


        const aqlQuery = `
          FOR doc IN custom_script
            ${filterClause}
            SORT doc.script_name ${sort.toUpperCase()}
            LIMIT @offset, @limit
            RETURN doc
        `;

        const options = { fullCount: true };
        const cursor = await fastify.db.query(aqlQuery, { ...bindVars, limit, offset }, options);
        const items = await cursor.all();

        // `fullCount` gives total count before LIMIT was applied
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



  // GET /custom_scripts/{script_id}
  fastify.get('/custom_scripts/:script_id', {
    schema: getCustomScriptByIdSchema,
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      const { script_id } = request.params;
      try {
        const cursor = await fastify.db.query(
          `FOR doc IN custom_script FILTER doc.script_id == @script_id LIMIT 1 RETURN doc`,
          { script_id }
        );
        const customScriptItem = await cursor.next()

        if (!customScriptItem) {
          return reply.code(404).send({
            message: `The requested resource was not found.`
          });
        }

        return customScriptItem;
      } catch (error) {
        reply.code(400).send({
          error: 'Bad Request',
          message: error.message
        });
      }
    }
  });

  // PATCH /custom_scripts/{script_id}
  fastify.patch('/custom_scripts/:script_id', {
    schema: updateCustomScriptSchema,
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      const { script_id } = request.params;
      try {
        const cursor = await fastify.db.query(
          `FOR doc IN custom_script FILTER doc.script_id == @script_id LIMIT 1 RETURN doc`,
          { script_id }
        );
        const existingDoc = await cursor.next()

        if (!existingDoc) {
          return reply.code(404).send({
            message: `Script with ID '${script_id}' not found.`
          });
        }


        const updatedCustomScript = request.body;
        const { new: updatedDoc } = await collection.update(existingDoc._key, updatedCustomScript, { returnNew: true });
        return updatedDoc;
      } catch (error) {
        reply.code(400).send({
          error: 'Bad Request',
          message: error.message
        });
      }
    }
  });

  // DELETE /custom_scripts/{script_id}
  fastify.delete('/custom_scripts/:script_id', {
    schema: deleteCustomScriptSchema,
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      const { script_id } = request.params;
      try {
        // 1. Find document by vi_id
        const cursor = await fastify.db.query(
          `FOR doc IN custom_script FILTER doc.script_id == @script_id LIMIT 1 RETURN doc`,
          { script_id }
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

  // GET /custom_scripts/bulk_query
  fastify.post('/custom_scripts/bulk_query', {
    schema: bulkQueryCustomScriptsSchema,
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      const script_ids = request.body;
      try {
        const query = `
          FOR doc IN custom_script
            FILTER doc.script_id IN @script_ids
            RETURN doc
        `;

        const cursor = await fastify.db.query(query, { script_ids });
        const customScriptItems = await cursor.all();

        return customScriptItems;
      } catch (error) {
        reply.code(400).send({
          error: 'Bad Request',
          message: error.message
        });
      }
    }
  });
}
