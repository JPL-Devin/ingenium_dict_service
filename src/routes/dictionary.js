import { getDictionariesSchema, createDictionarySchema, getDictionaryByVersionSchema, deleteDictionarySchema, updateDictionarySchema } from '../schemas/dictionarySchema.js'
import { COLLECTION_NAMES } from '../config/env.js'

export default async function dictionaryRoutes(fastify, options) {

  const collection = fastify.db.collection('dictionary')

  // POST /dictionaries/{dictionary_type}/versions
  fastify.post('/dictionaries/:dictionary_type/versions', {
    schema: createDictionarySchema,
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      const { dictionary_type } = request.params;
      const {
        dictionary_description,
        dictionary_version,
        state
      } = request.body;

      try {
        // Step 1: Check for duplicate dictionary_type + dictionary_version
        const checkQuery = `
        FOR doc IN dictionary
          FILTER doc.dictionary_type == @dictionary_type
            AND doc.dictionary_version == @dictionary_version
          RETURN doc._key
      `;

        const checkCursor = await fastify.db.query(checkQuery, {
          dictionary_type,
          dictionary_version
        });

        const existing = await checkCursor.next();
        if (existing) {
          return reply.code(409).send({
            error: 'Conflict',
            message: `Dictionary of type "${dictionary_type}" and version "${dictionary_version}" already exists.`
          });
        }

        // Step 2: Insert new dictionary
        const insertQuery = `
          INSERT {
            dictionary_type: @dictionary_type,
            dictionary_description: @dictionary_description,
            dictionary_version: @dictionary_version,
            state: @state,
            creation_date: DATE_ISO8601(DATE_NOW())
          } INTO dictionary
          RETURN NEW
        `;

        const bindVars = {
          dictionary_type,
          dictionary_description,
          dictionary_version,
          state
        };

        const cursor = await fastify.db.query(insertQuery, bindVars);
        const [newDictionary] = await cursor.all();

        return { dictionary_info: newDictionary };
      } catch (error) {
        fastify.log.error(error, 'Failed to insert dictionary');
        reply.code(400).send({
          error: 'Bad Request',
          message: error.message
        });
      }
    }
  });

  // GET /dictionaries/{dictionary_type}/versions
  fastify.get('/dictionaries/:dictionary_type/versions', {
    schema: getDictionariesSchema,
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      const {
        dictionary_type
      } = request.params;

      const {
        sort = 'asc',
        limit = 20,
        offset = 0,
        state_filter,
        description_filter,
        sort_by = 'dictionary_version'
      } = request.query;

      try {
        let filters = [];
        let bindVars = {};

        // Map UI sort_by params to DB fields
        const sortFieldMap = {
          VERSION: 'dictionary_version',
          CREATION_DATE: 'creation_date',
          STATE: 'state',
        };

        const dbSortBy = sortFieldMap[sort_by.toUpperCase()] || 'dictionary_version';

        // Helper: add a filter for a field 
        function addFilter(fieldName, value) {
          // Exact match
          filters.push(`doc.${fieldName} == @${fieldName}`);
          bindVars[fieldName] = value;
        }

        if (state_filter) addFilter('state', state_filter);
        if (description_filter) addFilter('dictionary_description', description_filter);
        if (dictionary_type) addFilter('dictionary_type', dictionary_type);

        const filterClause = filters.length ? `FILTER ${filters.join(' AND ')}` : '';

        const aqlQuery = `
          FOR doc IN dictionary
            ${filterClause}
            SORT doc.${dbSortBy} ${sort.toUpperCase()}
            LIMIT @offset, @limit
            RETURN doc
        `;

        const options = { fullCount: true };
        const cursor = await fastify.db.query(aqlQuery, { ...bindVars, limit, offset }, options);
        const dictionaryVersions = await cursor.all();

        const totalCount = cursor.extra?.stats?.fullCount ?? dictionaryVersions.length;

        // Set total count header
        reply.header('x-total-count', totalCount);
        return dictionaryVersions;
      } catch (error) {
        reply.code(400).send({
          error: 'Bad Request',
          message: error.message
        });
      }
    }
  });

  // GET /dictionaries/{dictionary_type}/versions/{dictionary_version}
  fastify.get('/dictionaries/:dictionary_type/versions/:dictionary_version', {
    schema: getDictionaryByVersionSchema,
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      const { dictionary_type, dictionary_version } = request.params;

      try {

        const cursor = await fastify.db.query(
          `FOR doc IN dictionary FILTER doc.dictionary_type == @dictionary_type AND doc.dictionary_version == @dictionary_version LIMIT 1 RETURN doc`,
          { dictionary_type, dictionary_version }
        );
        const dictionary = await cursor.next();

        if (!dictionary) {
          return reply.code(404).send({
            message: `The requested resource was not found.`
          });
        }
        return dictionary;
      } catch (error) {
        reply.code(400).send({
          error: 'Bad Request',
          message: error.message
        });
      }
    }
  });

  // PATCH /dictionaries/{dictionary_type}/versions/{dictionary_version}
  fastify.patch('/dictionaries/:dictionary_type/versions/:dictionary_version', {
    schema: updateDictionarySchema,
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      const { dictionary_type, dictionary_version } = request.params;
      const { dictionary_description, state } = request.body;

      try {

        const cursor = await fastify.db.query(
          `FOR doc IN dictionary FILTER doc.dictionary_type == @dictionary_type AND doc.dictionary_version == @dictionary_version LIMIT 1 RETURN doc`,
          { dictionary_type, dictionary_version }
        );
        const existingDoc = await cursor.next()

        if (!existingDoc) {
          return reply.code(404).send({
            message: `Dictionary with '${dictionary_type}' and '${dictionary_version}' not found.`
          });
        }
        const updateData = {};

        if (dictionary_description !== undefined) updateData.dictionary_description = dictionary_description;
        if (state !== undefined) updateData.state = state;

        const { new: updatedDoc } = await collection.update(existingDoc._key, updateData, { returnNew: true });

        return { dictionary_info: updatedDoc };
      } catch (error) {
        reply.code(400).send({
          error: 'Bad Request',
          message: error.message
        });
      }
    }
  });

  // DELETE /dictionaries/{dictionary_type}/versions/{dictionary_version}
  fastify.delete('/dictionaries/:dictionary_type/versions/:dictionary_version', {
    schema: deleteDictionarySchema,
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      const { dictionary_type, dictionary_version } = request.params;

      try {

        const cursor = await fastify.db.query(
          `FOR doc IN dictionary FILTER doc.dictionary_type == @dictionary_type AND doc.dictionary_version == @dictionary_version LIMIT 1 RETURN doc`,
          { dictionary_type, dictionary_version }
        );
        const existingDoc = await cursor.next();
        if (!existingDoc) {
          return reply.code(404).send({
            message: `The requested resource was not found.`
          });
        }

        // Step 1: Bulk delete related dictionary_content documents using AQL
        const collectionNames = ['command', 'channel', 'evr', 'mil1553', 'vnv', 'custom_script']

        for (const col of collectionNames) {
          const aql = `
            FOR doc IN @@col
              FILTER doc.dictionary_type == @dictionary_type
                AND doc.dictionary_version == @dictionary_version
              REMOVE doc IN @@col
          `;
          await fastify.db.query(aql, { dictionary_type, dictionary_version, '@col': col });
        }

        // Step 2: Remove the dictionary document
        await collection.remove(existingDoc._key);


        return reply.code(204).send();
      } catch (error) {
        if (error.message.includes('document not found')) {
          // ArangoDB specific error when trying to remove non-existent _key
          return reply.code(404).send({
            message: `The dictionary document was not found during deletion.`
          });
        }

        // Generic server error
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'An unexpected error occurred.'
        });
      }
    }
  });



}
