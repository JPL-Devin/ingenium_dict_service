import {
  createCommandSchema,
  getCommandsSchema,
  bulkQueryCommandsSchema,
  getCommandByStemSchema,
  updateCommandSchema,
  deleteCommandSchema,
  createEvrSchema,
  getEvrsSchema,
  bulkQueryEvrsSchema,
  getEvrByNameSchema,
  updateEvrSchema,
  deleteEvrSchema,
  createChannelSchema,
  getChannelsSchema,
  bulkQueryChannelsSchema,
  getChannelByNameSchema,
  updateChannelSchema,
  deleteChannelSchema,
  createMil1553VariableSchema,
  getMil1553VariablesSchema,
  bulkQueryMil1553VariablesSchema,
  getMil1553VariableByNameSchema,
  updateMil1553VariableSchema,
  deleteMil1553VariableSchema,
} from '../schemas/dictionaryContentSchema.js'

export default async function dictionaryContentRoutes(fastify, options) {

  const dictionaryCollection = fastify.db.collection('dictionary')
  const commandCollection = fastify.db.collection('command')
  const evrCollection = fastify.db.collection('evr')
  const channelCollection = fastify.db.collection('channel')
  const mil1553Collection = fastify.db.collection('mil1553')

  // ====== CMDS =======
  // POST /dictionaries/{dictionary_type}/versions/{dictionary_version}/cmds
  fastify.post('/dictionaries/:dictionary_type/versions/:dictionary_version/cmds', {
    schema: createCommandSchema,
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      const { dictionary_type, dictionary_version } = request.params;
      const newCommands = request.body;

      try {
        // Step 1: Check if the dictionary exists
        const dictCursor = await fastify.db.query(
          `FOR doc IN dictionary FILTER doc.dictionary_type == @dictionary_type AND doc.dictionary_version == @dictionary_version LIMIT 1 RETURN doc`,
          { dictionary_type, dictionary_version }
        );
        const existingDict = await dictCursor.next();

        if (!existingDict) {
          return reply.code(404).send({
            error: 'Not Found',
            message: `Dictionary type "${dictionary_type}" and version "${dictionary_version}" does not exist.`
          });
        }

        // Step 2: Enrich each command with dictionary metadata
        const enrichedCommands = newCommands.map(cmd => ({
          ...cmd,
          dictionary_type,
          dictionary_version
        }));

        // Step 3: Check for duplicate command_stem values
        const commandStems = enrichedCommands
          .map(cmd => cmd.command_stem)
          .filter(Boolean);

        if (commandStems.length > 0) {
          const query = `
            FOR doc IN command
              FILTER doc.command_stem IN @commandStems
                AND doc.dictionary_type == @dictionary_type
                AND doc.dictionary_version == @dictionary_version
              RETURN doc.command_stem
          `;
          const dupCursor = await fastify.db.query(query, { commandStems, dictionary_type, dictionary_version });
          const existingStems = await dupCursor.all();

          if (existingStems.length > 0) {
            return reply.code(409).send({
              error: 'Conflict',
              message: `Commands with the following command_stem values already exist: ${existingStems.join(', ')}`
            });
          }
        }

        // Step 4: Save all commands in bulk
        const result = await commandCollection.saveAll(enrichedCommands, { returnNew: true });
        const savedCommands = result.map(r => r.new);

        return reply.code(201).send(savedCommands);

      } catch (error) {
        fastify.log.error(error, 'Failed to save commands');
        return reply.code(400).send({
          error: 'Bad Request',
          message: error.message
        });
      }
    }
  });

  // GET /dictionaries/{dictionary_type}/versions/{dictionary_version}/cmds
  fastify.get('/dictionaries/:dictionary_type/versions/:dictionary_version/cmds', {
    schema: getCommandsSchema,
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      const { dictionary_type, dictionary_version } = request.params;
      const {
        sort = 'asc',
        limit = 20,
        offset = 0,
        wild = false,
        command_stem,
        ops_cat,
        command_description
      } = request.query;

      try {
        const filters = [
          'doc.dictionary_type == @dictionary_type',
          'doc.dictionary_version == @dictionary_version',
        ];
        const bindVars = {};

        // Helper: add a filter for a field depending on wild mode
        function addFilter(fieldName, value) {
          if (wild) {
            filters.push(`CONTAINS(LOWER(TO_STRING(doc.${fieldName})), LOWER(@${fieldName}))`);
          } else {
            filters.push(`doc.${fieldName} == @${fieldName}`);
          }
          bindVars[fieldName] = value;
        }

        if (command_stem) addFilter('command_stem', command_stem);
        if (ops_cat) addFilter('operations_category', ops_cat);
        if (command_description) addFilter('cmd_description', command_description);

        const filterClause = filters.length ? `FILTER ${filters.join(' AND ')}` : '';

        const aqlQuery = `
          FOR doc IN command
            ${filterClause}
            SORT doc.command_stem ${sort.toUpperCase()}
            LIMIT @offset, @limit
            RETURN doc
        `;

        const cursor = await fastify.db.query(aqlQuery, { ...bindVars, dictionary_type, dictionary_version, limit, offset }, { fullCount: true });
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

  // POST /dictionaries/{dictionary_type}/versions/{dictionary_version}/cmds/bulk_query
  fastify.post('/dictionaries/:dictionary_type/versions/:dictionary_version/cmds/bulk_query', {
    schema: bulkQueryCommandsSchema,
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      const { dictionary_type, dictionary_version } = request.params;
      const command_stems = request.body;

      try {
        const query = `
          FOR doc IN command
            FILTER doc.dictionary_type == @dictionary_type
              AND doc.dictionary_version == @dictionary_version
              AND doc.command_stem IN @command_stems
            RETURN doc
        `;

        const cursor = await fastify.db.query(query, {
          dictionary_type,
          dictionary_version,
          command_stems
        });

        const commands = await cursor.all();
        return commands
      } catch (error) {
        reply.code(400).send({
          error: 'Bad Request',
          message: error.message
        });
      }
    }
  });

  // GET /dictionaries/{dictionary_type}/versions/{dictionary_version}/cmds/{cmd_stem}
  fastify.get('/dictionaries/:dictionary_type/versions/:dictionary_version/cmds/:cmd_stem', {
    schema: getCommandByStemSchema,
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      const { dictionary_type, dictionary_version, cmd_stem } = request.params;

      try {
        // 1. Find document 
        const cursor = await fastify.db.query(
          `FOR doc IN command FILTER doc.dictionary_type == @dictionary_type AND doc.dictionary_version == @dictionary_version AND doc.command_stem == @cmd_stem LIMIT 1 RETURN doc`,
          { dictionary_type, dictionary_version, cmd_stem }
        );
        const existingDoc = await cursor.next();
        if (!existingDoc) {
          return reply.code(404).send({
            message: `The requested resource was not found.`
          });
        }

        return existingDoc
      } catch (error) {
        reply.code(400).send({
          error: 'Bad Request',
          message: error.message
        });
      }
    }
  });

  // PATCH /dictionaries/{dictionary_type}/versions/{dictionary_version}/cmds/{cmd_stem}
  fastify.patch('/dictionaries/:dictionary_type/versions/:dictionary_version/cmds/:cmd_stem', {
    schema: updateCommandSchema,
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      const { dictionary_type, dictionary_version, cmd_stem } = request.params;
      const patchCommand = request.body;

      try {
        // 1. Find document 
        const cursor = await fastify.db.query(
          `FOR doc IN command FILTER doc.dictionary_type == @dictionary_type AND doc.dictionary_version == @dictionary_version AND doc.command_stem == @cmd_stem LIMIT 1 RETURN doc`,
          { dictionary_type, dictionary_version, cmd_stem }
        );
        const existingDoc = await cursor.next();
        if (!existingDoc) {
          return reply.code(404).send({
            message: `The requested resource was not found.`
          });
        }

        const { new: updatedDoc } = await commandCollection.update(existingDoc._key, patchCommand, { returnNew: true });
        return updatedDoc;
      } catch (error) {
        reply.code(400).send({
          error: 'Bad Request',
          message: error.message
        });
      }
    }
  });

  // DELETE /dictionaries/{dictionary_type}/versions/{dictionary_version}/cmds/{cmd_stem}
  fastify.delete('/dictionaries/:dictionary_type/versions/:dictionary_version/cmds/:cmd_stem', {
    schema: deleteCommandSchema,
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      const { dictionary_type, dictionary_version, cmd_stem } = request.params;

      try {
        // 1. Find document 
        const cursor = await fastify.db.query(
          `FOR doc IN command FILTER doc.dictionary_type == @dictionary_type AND doc.dictionary_version == @dictionary_version AND doc.command_stem == @cmd_stem LIMIT 1 RETURN doc`,
          { dictionary_type, dictionary_version, cmd_stem }
        );
        const existingDoc = await cursor.next();
        if (!existingDoc) {
          return reply.code(404).send({
            message: `The requested resource was not found.`
          });
        }
        // Step 2: Delete by _key
        await commandCollection.remove(existingDoc._key);

        return reply.code(204).send();
      } catch (error) {
        reply.code(400).send({
          error: 'Bad Request',
          message: error.message
        });
      }
    }
  });

  // ====== EVRS =======
  // POST /dictionaries/{dictionary_type}/versions/{dictionary_version}/evrs
  fastify.post('/dictionaries/:dictionary_type/versions/:dictionary_version/evrs', {
    schema: createEvrSchema,
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      const { dictionary_type, dictionary_version } = request.params;
      const newEvrs = request.body;

      try {
        // Step 1: Check if dictionary exists
        const dictCursor = await fastify.db.query(
          `FOR doc IN dictionary FILTER doc.dictionary_type == @dictionary_type AND doc.dictionary_version == @dictionary_version LIMIT 1 RETURN doc`,
          { dictionary_type, dictionary_version }
        );
        const existingDict = await dictCursor.next();

        if (!existingDict) {
          return reply.code(404).send({
            error: 'Not Found',
            message: `Dictionary type "${dictionary_type}" and version "${dictionary_version}" does not exist.`
          });
        }

        // Step 2: Enrich EVRs with dictionary metadata
        const enrichedEvrs = newEvrs.map(evr => ({
          ...evr,
          dictionary_type,
          dictionary_version
        }));

        // Step 3: Check for duplicate evr_id values
        const evrIds = enrichedEvrs
          .map(evr => evr.evr_id)
          .filter(Boolean);

        if (evrIds.length > 0) {
          const query = `
            FOR doc IN evr
              FILTER doc.evr_id IN @evrIds
                AND doc.dictionary_type == @dictionary_type
                AND doc.dictionary_version == @dictionary_version
              RETURN doc.evr_id
          `;
          const dupCursor = await fastify.db.query(query, { evrIds, dictionary_type, dictionary_version });
          const existingEvrs = await dupCursor.all();

          if (existingEvrs.length > 0) {
            return reply.code(409).send({
              error: 'Conflict',
              message: `EVRs with the following evr_id values already exist: ${existingEvrs.join(', ')}`
            });
          }
        }

        // Step 4: Bulk insert using saveAll
        const result = await evrCollection.saveAll(enrichedEvrs, { returnNew: true });
        const savedEvrs = result.map(r => r.new);

        return reply.code(201).send(savedEvrs);
      } catch (error) {
        fastify.log.error(error, 'Failed to save EVRs');
        return reply.code(400).send({
          error: 'Bad Request',
          message: error.message
        });
      }
    }
  });

  // GET /dictionaries/{dictionary_type}/versions/{dictionary_version}/evrs
  fastify.get('/dictionaries/:dictionary_type/versions/:dictionary_version/evrs', {
    schema: getEvrsSchema,
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      const { dictionary_type, dictionary_version } = request.params;
      const {
        sort = 'asc',
        limit = 20,
        offset = 0,
        wild = false,
        evr_id,
        evr_name,
        evr_level,
        ops_cat,
        evr_description,
        evr_message
      } = request.query;

      try {
        const filters = [
          'doc.dictionary_type == @dictionary_type',
          'doc.dictionary_version == @dictionary_version',
        ];
        const bindVars = {};

        // Helper: add a filter for a field depending on wild mode
        function addFilter(fieldName, value) {
          if (wild) {
            filters.push(`CONTAINS(LOWER(TO_STRING(doc.${fieldName})), LOWER(@${fieldName}))`);
          } else {
            filters.push(`doc.${fieldName} == @${fieldName}`);
          }
          bindVars[fieldName] = value;
        }

        if (evr_id) addFilter('evr_id', evr_id);
        if (evr_name) addFilter('evr_name', evr_name);
        if (evr_level) addFilter('evr_level', evr_level);
        if (ops_cat) addFilter('operations_category', ops_cat);
        if (evr_description) addFilter('evr_description', evr_description);
        if (evr_message) addFilter('evr_message', evr_message);

        const filterClause = filters.length ? `FILTER ${filters.join(' AND ')}` : '';

        const aqlQuery = `
          FOR doc IN evr
            ${filterClause}
            SORT doc.evr_name ${sort.toUpperCase()}
            LIMIT @offset, @limit
            RETURN doc
        `;

        const cursor = await fastify.db.query(aqlQuery, { ...bindVars, dictionary_type, dictionary_version, limit, offset }, { fullCount: true });

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

  // POST /dictionaries/{dictionary_type}/versions/{dictionary_version}/evrs/bulk_query
  fastify.post('/dictionaries/:dictionary_type/versions/:dictionary_version/evrs/bulk_query', {
    schema: bulkQueryEvrsSchema,
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      const { dictionary_type, dictionary_version } = request.params;
      const evr_names = request.body;

      try {
        const query = `
          FOR doc IN evr
            FILTER doc.dictionary_type == @dictionary_type
              AND doc.dictionary_version == @dictionary_version
              AND doc.evr_name IN @evr_names
            RETURN doc
        `;
        const cursor = await fastify.db.query(query, {
          dictionary_type,
          dictionary_version,
          evr_names
        });

        const evers = await cursor.all();
        return evers
      } catch (error) {
        reply.code(400).send({
          error: 'Bad Request',
          message: error.message
        });
      }
    }
  });

  // GET /dictionaries/{dictionary_type}/versions/{dictionary_version}/evrs/{evr_name}
  fastify.get('/dictionaries/:dictionary_type/versions/:dictionary_version/evrs/:evr_name', {
    schema: getEvrByNameSchema,
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      const { dictionary_type, dictionary_version, evr_name } = request.params;

      try {
        // 1. Find document 
        const cursor = await fastify.db.query(
          `FOR doc IN evr FILTER doc.dictionary_type == @dictionary_type AND doc.dictionary_version == @dictionary_version AND doc.evr_name == @evr_name LIMIT 1 RETURN doc`,
          { dictionary_type, dictionary_version, evr_name }
        );
        const existingDoc = await cursor.next();
        if (!existingDoc) {
          return reply.code(404).send({
            message: `The requested resource was not found.`
          });
        }

        return existingDoc
      } catch (error) {
        reply.code(400).send({
          error: 'Bad Request',
          message: error.message
        });
      }
    }
  });

  // PATCH /dictionaries/{dictionary_type}/versions/{dictionary_version}/evrs/{evr_name}
  fastify.patch('/dictionaries/:dictionary_type/versions/:dictionary_version/evrs/:evr_name', {
    schema: updateEvrSchema,
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      const { dictionary_type, dictionary_version, evr_name } = request.params;
      const patchEvr = request.body;

      try {
        // 1. Find document 
        const cursor = await fastify.db.query(
          `FOR doc IN evr FILTER doc.dictionary_type == @dictionary_type AND doc.dictionary_version == @dictionary_version AND doc.evr_name == @evr_name LIMIT 1 RETURN doc`,
          { dictionary_type, dictionary_version, evr_name }
        );
        const existingDoc = await cursor.next();
        if (!existingDoc) {
          return reply.code(404).send({
            message: `The requested resource was not found.`
          });
        }

        const { new: updatedDoc } = await evrCollection.update(existingDoc._key, patchEvr, { returnNew: true });
        return updatedDoc;

      } catch (error) {
        reply.code(400).send({
          error: 'Bad Request',
          message: error.message
        });
      }
    }
  });

  // DELETE /dictionaries/{dictionary_type}/versions/{dictionary_version}/evrs/{evr_name}
  fastify.delete('/dictionaries/:dictionary_type/versions/:dictionary_version/evrs/:evr_name', {
    schema: deleteEvrSchema,
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      const { dictionary_type, dictionary_version, evr_name } = request.params;

      try {
        // 1. Find document 
        const cursor = await fastify.db.query(
          `FOR doc IN evr FILTER doc.dictionary_type == @dictionary_type AND doc.dictionary_version == @dictionary_version AND doc.evr_name == @evr_name LIMIT 1 RETURN doc`,
          { dictionary_type, dictionary_version, evr_name }
        );
        const existingDoc = await cursor.next();
        if (!existingDoc) {
          return reply.code(404).send({
            message: `The requested resource was not found.`
          });
        }
        // Step 2: Delete by _key
        await evrCollection.remove(existingDoc._key);

        return reply.code(204).send();
      } catch (error) {
        reply.code(400).send({
          error: 'Bad Request',
          message: error.message
        });
      }
    }
  });

  // ====== CHANNELS =======
  // POST /dictionaries/{dictionary_type}/versions/{dictionary_version}/channels
  fastify.post('/dictionaries/:dictionary_type/versions/:dictionary_version/channels', {
    schema: createChannelSchema,
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      const { dictionary_type, dictionary_version } = request.params;
      const newChannels = request.body;

      try {
        // Step 1: Check if dictionary exists
        const dictCursor = await fastify.db.query(
          `FOR doc IN dictionary FILTER doc.dictionary_type == @dictionary_type AND doc.dictionary_version == @dictionary_version LIMIT 1 RETURN doc`,
          { dictionary_type, dictionary_version }
        );
        const existingDict = await dictCursor.next();

        if (!existingDict) {
          return reply.code(404).send({
            error: 'Not Found',
            message: `Dictionary type "${dictionary_type}" and version "${dictionary_version}" does not exist.`
          });
        }

        // Step 2: Enrich each channel with dictionary metadata
        const enrichedChannels = newChannels.map(channel => ({
          ...channel,
          dictionary_type,
          dictionary_version
        }));

        // Step 3: Check for duplicate channel_id values
        const channelIds = enrichedChannels
          .map(c => c.channel_id)
          .filter(Boolean);

        if (channelIds.length > 0) {
          const query = `
            FOR doc IN channel
              FILTER doc.channel_id IN @channelIds
                AND doc.dictionary_type == @dictionary_type
                AND doc.dictionary_version == @dictionary_version
              RETURN doc.channel_id
          `;
          const dupCursor = await fastify.db.query(query, { channelIds, dictionary_type, dictionary_version });
          const existingIds = await dupCursor.all();

          if (existingIds.length > 0) {
            return reply.code(409).send({
              error: 'Conflict',
              message: `Channels with the following channel_id values already exist: ${existingIds.join(', ')}`
            });
          }
        }

        // Step 4: Bulk insert using saveAll
        const result = await channelCollection.saveAll(enrichedChannels, { returnNew: true });
        const savedChannels = result.map(r => r.new);

        return reply.code(201).send(savedChannels);
      } catch (error) {
        fastify.log.error(error, 'Failed to save channels');
        return reply.code(400).send({
          error: 'Bad Request',
          message: error.message
        });
      }
    }
  });

  // GET /dictionaries/{dictionary_type}/versions/{dictionary_version}/channels
  fastify.get('/dictionaries/:dictionary_type/versions/:dictionary_version/channels', {
    schema: getChannelsSchema,
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      const { dictionary_type, dictionary_version } = request.params;
      const {
        sort = 'asc',
        limit = 20,
        offset = 0,
        wild = false,
        channel_name,
        description,
        ops_cat,
        derived,
        channel_id
      } = request.query;

      try {
        const filters = [
          'doc.dictionary_type == @dictionary_type',
          'doc.dictionary_version == @dictionary_version',
        ];
        const bindVars = {};

        // Helper: add a filter for a field depending on wild mode
        function addFilter(fieldName, value) {
          if (wild) {
            filters.push(`CONTAINS(LOWER(TO_STRING(doc.${fieldName})), LOWER(@${fieldName}))`);
          } else {
            filters.push(`doc.${fieldName} == @${fieldName}`);
          }
          bindVars[fieldName] = value;
        }

        if (channel_name) addFilter('channel_name', channel_name);
        if (description) addFilter('description', description);
        if (ops_cat) addFilter('operations_category', ops_cat);
        if (derived) addFilter('derived', derived);
        if (channel_id) addFilter('channel_id', channel_id);

        const filterClause = filters.length ? `FILTER ${filters.join(' AND ')}` : '';

        const aqlQuery = `
          FOR doc IN channel
            ${filterClause}
            SORT doc.channel_name ${sort.toUpperCase()}
            LIMIT @offset, @limit
            RETURN doc
        `;

        const cursor = await fastify.db.query(aqlQuery, { ...bindVars, dictionary_type, dictionary_version, limit, offset }, { fullCount: true });

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

  // POST /dictionaries/{dictionary_type}/versions/{dictionary_version}/channels/bulk_query
  fastify.post('/dictionaries/:dictionary_type/versions/:dictionary_version/channels/bulk_query', {
    schema: bulkQueryChannelsSchema,
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      const { dictionary_type, dictionary_version } = request.params;
      const channel_names = request.body;

      try {
        const query = `
          FOR doc IN channel
            FILTER doc.dictionary_type == @dictionary_type
              AND doc.dictionary_version == @dictionary_version
              AND doc.channel_name IN @channel_names
            RETURN doc
        `;

        const cursor = await fastify.db.query(query, {
          dictionary_type,
          dictionary_version,
          channel_names
        });

        const channels = await cursor.all();
        return channels
      } catch (error) {
        reply.code(400).send({
          error: 'Bad Request',
          message: error.message
        });
      }
    }
  });

  // GET /dictionaries/{dictionary_type}/versions/{dictionary_version}/channels/{channel_name}
  fastify.get('/dictionaries/:dictionary_type/versions/:dictionary_version/channels/:channel_name', {
    schema: getChannelByNameSchema,
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      const { dictionary_type, dictionary_version, channel_name } = request.params;

      try {
        // 1. Find document 
        const cursor = await fastify.db.query(
          `FOR doc IN channel FILTER doc.dictionary_type == @dictionary_type AND doc.dictionary_version == @dictionary_version AND doc.channel_name == @channel_name LIMIT 1 RETURN doc`,
          { dictionary_type, dictionary_version, channel_name }
        );
        const existingDoc = await cursor.next();
        if (!existingDoc) {
          return reply.code(404).send({
            message: `The requested resource was not found.`
          });
        }
        return existingDoc
      } catch (error) {
        reply.code(400).send({
          error: 'Bad Request',
          message: error.message
        });
      }
    }
  });

  // PATCH /dictionaries/{dictionary_type}/versions/{dictionary_version}/channels/{channel_name}
  fastify.patch('/dictionaries/:dictionary_type/versions/:dictionary_version/channels/:channel_name', {
    schema: updateChannelSchema,
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      const { dictionary_type, dictionary_version, channel_name } = request.params;
      const patchChannel = request.body;

      try {
        // 1. Find document 
        const cursor = await fastify.db.query(
          `FOR doc IN channel FILTER doc.dictionary_type == @dictionary_type AND doc.dictionary_version == @dictionary_version AND doc.channel_name == @channel_name LIMIT 1 RETURN doc`,
          { dictionary_type, dictionary_version, channel_name }
        );
        const existingDoc = await cursor.next();
        if (!existingDoc) {
          return reply.code(404).send({
            message: `The requested resource was not found.`
          });
        }

        const { new: updatedDoc } = await channelCollection.update(existingDoc._key, patchChannel, { returnNew: true });
        return updatedDoc;

      } catch (error) {
        reply.code(400).send({
          error: 'Bad Request',
          message: error.message
        });
      }
    }
  });

  // DELETE /dictionaries/{dictionary_type}/versions/{dictionary_version}/channels/{channel_name}
  fastify.delete('/dictionaries/:dictionary_type/versions/:dictionary_version/channels/:channel_name', {
    schema: deleteChannelSchema,
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      const { dictionary_type, dictionary_version, channel_name } = request.params;

      try {
        // 1. Find document 
        const cursor = await fastify.db.query(
          `FOR doc IN channel FILTER doc.dictionary_type == @dictionary_type AND doc.dictionary_version == @dictionary_version AND doc.channel_name == @channel_name LIMIT 1 RETURN doc`,
          { dictionary_type, dictionary_version, channel_name }
        );
        const existingDoc = await cursor.next();
        if (!existingDoc) {
          return reply.code(404).send({
            message: `The requested resource was not found.`
          });
        }
        // Step 2: Delete by _key
        await channelCollection.remove(existingDoc._key);

        return reply.code(204).send();
      } catch (error) {
        reply.code(400).send({
          error: 'Bad Request',
          message: error.message
        });
      }
    }
  });

  // ====== MIL1553 =======
  // POST /dictionaries/{dictionary_type}/versions/{dictionary_version}/mil1553
  fastify.post('/dictionaries/:dictionary_type/versions/:dictionary_version/mil1553', {
    schema: createMil1553VariableSchema,
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      const { dictionary_type, dictionary_version } = request.params;
      const newMil1553s = request.body;

      try {
        // Step 1: Check if dictionary exists
        const dictCursor = await fastify.db.query(
          `FOR doc IN dictionary FILTER doc.dictionary_type == @dictionary_type AND doc.dictionary_version == @dictionary_version LIMIT 1 RETURN doc`,
          { dictionary_type, dictionary_version }
        );
        const existingDict = await dictCursor.next();

        if (!existingDict) {
          return reply.code(404).send({
            error: 'Not Found',
            message: `Dictionary type "${dictionary_type}" and version "${dictionary_version}" does not exist.`
          });
        }

        // Step 2: Enrich items with dictionary metadata
        const enrichedMil1553s = newMil1553s.map(item => ({
          ...item,
          dictionary_type,
          dictionary_version
        }));

        // Step 3: Check for duplicate mil1553_name values
        const milNames = enrichedMil1553s
          .map(item => item.mil1553_name)
          .filter(Boolean);

        if (milNames.length > 0) {
          const query = `
            FOR doc IN mil1553
              FILTER doc.mil1553_name IN @milNames
                AND doc.dictionary_type == @dictionary_type
                AND doc.dictionary_version == @dictionary_version
              RETURN doc.mil1553_name
          `;
          const dupCursor = await fastify.db.query(query, { milNames, dictionary_type, dictionary_version });
          const existingNames = await dupCursor.all();

          if (existingNames.length > 0) {
            return reply.code(409).send({
              error: 'Conflict',
              message: `MIL-1553 items with the following mil1553_name values already exist: ${existingNames.join(', ')}`
            });
          }
        }

        // Step 4: Save all using saveAll()
        const result = await mil1553Collection.saveAll(enrichedMil1553s, { returnNew: true });
        const savedMil1553s = result.map(r => r.new);

        return reply.code(201).send(savedMil1553s);
      } catch (error) {
        fastify.log.error(error, 'Failed to save MIL-1553 items');
        return reply.code(400).send({
          error: 'Bad Request',
          message: error.message
        });
      }
    }
  });

  // GET /dictionaries/{dictionary_type}/versions/{dictionary_version}/mil1553    
  fastify.get('/dictionaries/:dictionary_type/versions/:dictionary_version/mil1553', {
    schema: getMil1553VariablesSchema,
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      const { dictionary_type, dictionary_version } = request.params;
      const {
        sort = 'asc',
        limit = 20,
        offset = 0,
        wild = false,
        mil1553_name,
        ops_cat,
        description,
        remote_terminal,
        sub_address,
        output_type,
        transmit_receive
      } = request.query;

      try {
        const filters = [
          'doc.dictionary_type == @dictionary_type',
          'doc.dictionary_version == @dictionary_version',
        ];
        const bindVars = {};

        // Helper: add a filter for a field depending on wild mode
        function addFilter(fieldName, value) {
          if (wild) {
            filters.push(`CONTAINS(LOWER(TO_STRING(doc.${fieldName})), LOWER(@${fieldName}))`);
          } else {
            filters.push(`doc.${fieldName} == @${fieldName}`);
          }
          bindVars[fieldName] = value;
        }

        if (mil1553_name) addFilter('mil1553_name', mil1553_name);
        if (ops_cat) addFilter('operations_category', ops_cat);
        if (description) addFilter('description', description);
        if (remote_terminal) addFilter('remote_terminal', remote_terminal);
        if (sub_address) addFilter('sub_address', sub_address);
        if (transmit_receive) addFilter('transmit_receive', transmit_receive);
        if (output_type) addFilter('output_type', output_type);

        const filterClause = filters.length ? `FILTER ${filters.join(' AND ')}` : '';

        const aqlQuery = `
          FOR doc IN mil1553
            ${filterClause}
            SORT doc.mil1553_name ${sort.toUpperCase()}
            LIMIT @offset, @limit
            RETURN doc
        `;

        const cursor = await fastify.db.query(aqlQuery, { ...bindVars, dictionary_type, dictionary_version, limit, offset }, { fullCount: true });

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

  // POST /dictionaries/{dictionary_type}/versions/{dictionary_version}/mil1553/bulk_query
  fastify.post('/dictionaries/:dictionary_type/versions/:dictionary_version/mil1553/bulk_query', {
    schema: bulkQueryMil1553VariablesSchema,
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      const { dictionary_type, dictionary_version } = request.params;
      const mil1553_names = request.body;

      try {
        const query = `
          FOR doc IN mil1553
            FILTER doc.dictionary_type == @dictionary_type
              AND doc.dictionary_version == @dictionary_version
              AND doc.mil1553_name IN @mil1553_names
            RETURN doc
        `;

        const cursor = await fastify.db.query(query, {
          dictionary_type,
          dictionary_version,
          mil1553_names
        });

        const channels = await cursor.all();
        return channels
      } catch (error) {
        reply.code(400).send({
          error: 'Bad Request',
          message: error.message
        });
      }
    }
  });

  // GET /dictionaries/{dictionary_type}/versions/{dictionary_version}/mil1553/{mil1553_name}
  fastify.get('/dictionaries/:dictionary_type/versions/:dictionary_version/mil1553/:mil1553_name', {
    schema: getMil1553VariableByNameSchema,
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      const { dictionary_type, dictionary_version, mil1553_name } = request.params;

      try {
        // 1. Find document 
        const cursor = await fastify.db.query(
          `FOR doc IN mil1553 FILTER doc.dictionary_type == @dictionary_type AND doc.dictionary_version == @dictionary_version AND doc.mil1553_name == @mil1553_name LIMIT 1 RETURN doc`,
          { dictionary_type, dictionary_version, mil1553_name }
        );
        const existingDoc = await cursor.next();
        if (!existingDoc) {
          return reply.code(404).send({
            message: `The requested resource was not found.`
          });
        }
        return existingDoc
      } catch (error) {
        reply.code(400).send({
          error: 'Bad Request',
          message: error.message
        });
      }
    }
  });

  // PATCH /dictionaries/{dictionary_type}/versions/{dictionary_version}/mil1553/{mil1553_name}
  fastify.patch('/dictionaries/:dictionary_type/versions/:dictionary_version/mil1553/:mil1553_name', {
    schema: updateMil1553VariableSchema,
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      const { dictionary_type, dictionary_version, mil1553_name } = request.params;
      const patchMil1553 = request.body;

      try {
        // 1. Find document 
        const cursor = await fastify.db.query(
          `FOR doc IN mil1553 FILTER doc.dictionary_type == @dictionary_type AND doc.dictionary_version == @dictionary_version AND doc.mil1553_name == @mil1553_name LIMIT 1 RETURN doc`,
          { dictionary_type, dictionary_version, mil1553_name }
        );
        const existingDoc = await cursor.next();
        if (!existingDoc) {
          return reply.code(404).send({
            message: `The requested resource was not found.`
          });
        }

        const { new: updatedDoc } = await mil1553Collection.update(existingDoc._key, patchMil1553, { returnNew: true });
        return updatedDoc;
      } catch (error) {
        reply.code(400).send({
          error: 'Bad Request',
          message: error.message
        });
      }
    }
  });

  // DELETE /dictionaries/{dictionary_type}/versions/{dictionary_version}/mil1553/{mil1553_name}
  fastify.delete('/dictionaries/:dictionary_type/versions/:dictionary_version/mil1553/:mil1553_name', {
    schema: deleteMil1553VariableSchema,
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      const { dictionary_type, dictionary_version, mil1553_name } = request.params;

      try {
        // 1. Find document 
        const cursor = await fastify.db.query(
          `FOR doc IN mil1553 FILTER doc.dictionary_type == @dictionary_type AND doc.dictionary_version == @dictionary_version AND doc.mil1553_name == @mil1553_name LIMIT 1 RETURN doc`,
          { dictionary_type, dictionary_version, mil1553_name }
        );
        const existingDoc = await cursor.next();
        if (!existingDoc) {
          return reply.code(404).send({
            message: `The requested resource was not found.`
          });
        }
        // Step 2: Delete by _key
        await mil1553Collection.remove(existingDoc._key);

        return reply.code(204).send();
      } catch (error) {
        reply.code(400).send({
          error: 'Bad Request',
          message: error.message
        });
      }
    }
  });

}
