import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { buildTestApp, createMockCursor } from './helpers/setup.js';
import dictionaryContentRoutes from '../src/routes/dictionaryContent.js';

describe('Dictionary Content Routes', () => {
  let fastify;

  beforeEach(async () => {
    fastify = buildTestApp(dictionaryContentRoutes);
    await fastify.ready();
  });

  afterEach(async () => {
    if (fastify) await fastify.close();
  });

  // ====== COMMANDS ======
  describe('Commands', () => {
    describe('POST /api/v4/dictionaries/:type/versions/:version/cmds', () => {
      it('creates commands when dictionary exists', async () => {
        const dictDoc = { _key: 'd1', dictionary_type: 'flight', dictionary_version: '1.0' };
        // dict check
        fastify.mockDb.query.mockResolvedValueOnce(createMockCursor(dictDoc));
        // duplicate check
        fastify.mockDb.query.mockResolvedValueOnce(createMockCursor([]));

        const cmdCollection = fastify.mockDb.collection('command');
        const savedCmds = [{ new: { _key: 'c1', command_stem: 'CMD_A', dictionary_type: 'flight', dictionary_version: '1.0' } }];
        cmdCollection.saveAll.mockResolvedValueOnce(savedCmds);

        const response = await fastify.inject({
          method: 'POST',
          url: '/api/v4/dictionaries/flight/versions/1.0/cmds',
          payload: [{ command_stem: 'CMD_A' }],
        });

        expect(response.statusCode).toBe(201);
      });

      it('returns 404 when dictionary does not exist', async () => {
        fastify.mockDb.query.mockResolvedValueOnce(createMockCursor([]));

        const response = await fastify.inject({
          method: 'POST',
          url: '/api/v4/dictionaries/flight/versions/1.0/cmds',
          payload: [{ command_stem: 'CMD_A' }],
        });

        expect(response.statusCode).toBe(404);
      });

      it('returns 409 on duplicate command_stem', async () => {
        const dictDoc = { _key: 'd1', dictionary_type: 'flight', dictionary_version: '1.0' };
        fastify.mockDb.query.mockResolvedValueOnce(createMockCursor(dictDoc));
        fastify.mockDb.query.mockResolvedValueOnce(createMockCursor(['CMD_A']));

        const response = await fastify.inject({
          method: 'POST',
          url: '/api/v4/dictionaries/flight/versions/1.0/cmds',
          payload: [{ command_stem: 'CMD_A' }],
        });

        expect(response.statusCode).toBe(409);
      });
    });

    describe('GET /api/v4/dictionaries/:type/versions/:version/cmds', () => {
      it('returns list of commands', async () => {
        const cmds = [
          { command_stem: 'CMD_A', dictionary_type: 'flight', dictionary_version: '1.0' },
          { command_stem: 'CMD_B', dictionary_type: 'flight', dictionary_version: '1.0' },
        ];
        fastify.mockDb.query.mockResolvedValueOnce(createMockCursor(cmds));

        const response = await fastify.inject({
          method: 'GET',
          url: '/api/v4/dictionaries/flight/versions/1.0/cmds',
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toHaveLength(2);
      });
    });

    describe('GET /api/v4/dictionaries/:type/versions/:version/cmds/:cmd_stem', () => {
      it('returns single command', async () => {
        const cmd = { command_stem: 'CMD_A', dictionary_type: 'flight', dictionary_version: '1.0' };
        fastify.mockDb.query.mockResolvedValueOnce(createMockCursor(cmd));

        const response = await fastify.inject({
          method: 'GET',
          url: '/api/v4/dictionaries/flight/versions/1.0/cmds/CMD_A',
        });

        expect(response.statusCode).toBe(200);
        expect(response.json().command_stem).toBe('CMD_A');
      });

      it('returns 404 when command not found', async () => {
        fastify.mockDb.query.mockResolvedValueOnce(createMockCursor([]));

        const response = await fastify.inject({
          method: 'GET',
          url: '/api/v4/dictionaries/flight/versions/1.0/cmds/NONEXISTENT',
        });

        expect(response.statusCode).toBe(404);
      });
    });

    describe('PATCH /api/v4/dictionaries/:type/versions/:version/cmds/:cmd_stem', () => {
      it('updates a command', async () => {
        const existing = { _key: 'c1', command_stem: 'CMD_A' };
        fastify.mockDb.query.mockResolvedValueOnce(createMockCursor(existing));

        const updated = { ...existing, cmd_description: 'Updated' };
        const cmdCollection = fastify.mockDb.collection('command');
        cmdCollection.update.mockResolvedValueOnce({ new: updated });

        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/v4/dictionaries/flight/versions/1.0/cmds/CMD_A',
          payload: { cmd_description: 'Updated' },
        });

        expect(response.statusCode).toBe(200);
      });

      it('returns 404 when command not found', async () => {
        fastify.mockDb.query.mockResolvedValueOnce(createMockCursor([]));

        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/v4/dictionaries/flight/versions/1.0/cmds/NONEXISTENT',
          payload: { cmd_description: 'Updated' },
        });

        expect(response.statusCode).toBe(404);
      });
    });

    describe('DELETE /api/v4/dictionaries/:type/versions/:version/cmds/:cmd_stem', () => {
      it('deletes a command', async () => {
        const existing = { _key: 'c1', command_stem: 'CMD_A' };
        fastify.mockDb.query.mockResolvedValueOnce(createMockCursor(existing));

        const cmdCollection = fastify.mockDb.collection('command');
        cmdCollection.remove.mockResolvedValueOnce(true);

        const response = await fastify.inject({
          method: 'DELETE',
          url: '/api/v4/dictionaries/flight/versions/1.0/cmds/CMD_A',
        });

        expect(response.statusCode).toBe(204);
      });

      it('returns 404 when command not found', async () => {
        fastify.mockDb.query.mockResolvedValueOnce(createMockCursor([]));

        const response = await fastify.inject({
          method: 'DELETE',
          url: '/api/v4/dictionaries/flight/versions/1.0/cmds/NONEXISTENT',
        });

        expect(response.statusCode).toBe(404);
      });
    });

    describe('POST /api/v4/dictionaries/:type/versions/:version/cmds/bulk_query', () => {
      it('returns bulk queried commands', async () => {
        const cmds = [{ command_stem: 'CMD_A' }, { command_stem: 'CMD_B' }];
        fastify.mockDb.query.mockResolvedValueOnce(createMockCursor(cmds));

        const response = await fastify.inject({
          method: 'POST',
          url: '/api/v4/dictionaries/flight/versions/1.0/cmds/bulk_query',
          payload: ['CMD_A', 'CMD_B'],
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toHaveLength(2);
      });
    });
  });

  // ====== EVRS ======
  describe('EVRs', () => {
    describe('POST /api/v4/dictionaries/:type/versions/:version/evrs', () => {
      it('creates EVRs when dictionary exists', async () => {
        const dictDoc = { _key: 'd1', dictionary_type: 'flight', dictionary_version: '1.0' };
        fastify.mockDb.query.mockResolvedValueOnce(createMockCursor(dictDoc));
        fastify.mockDb.query.mockResolvedValueOnce(createMockCursor([]));

        const evrCollection = fastify.mockDb.collection('evr');
        evrCollection.saveAll.mockResolvedValueOnce([
          { new: { _key: 'e1', evr_id: '001', evr_name: 'EVR_A' } },
        ]);

        const response = await fastify.inject({
          method: 'POST',
          url: '/api/v4/dictionaries/flight/versions/1.0/evrs',
          payload: [{ evr_id: '001', evr_name: 'EVR_A' }],
        });

        expect(response.statusCode).toBe(201);
      });

      it('returns 404 when dictionary does not exist', async () => {
        fastify.mockDb.query.mockResolvedValueOnce(createMockCursor([]));

        const response = await fastify.inject({
          method: 'POST',
          url: '/api/v4/dictionaries/flight/versions/1.0/evrs',
          payload: [{ evr_id: '001', evr_name: 'EVR_A' }],
        });

        expect(response.statusCode).toBe(404);
      });
    });

    describe('GET /api/v4/dictionaries/:type/versions/:version/evrs', () => {
      it('returns list of EVRs', async () => {
        const evrs = [{ evr_name: 'EVR_A' }, { evr_name: 'EVR_B' }];
        fastify.mockDb.query.mockResolvedValueOnce(createMockCursor(evrs));

        const response = await fastify.inject({
          method: 'GET',
          url: '/api/v4/dictionaries/flight/versions/1.0/evrs',
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toHaveLength(2);
      });
    });

    describe('GET /api/v4/dictionaries/:type/versions/:version/evrs/:evr_name', () => {
      it('returns single EVR', async () => {
        const evr = { evr_name: 'EVR_A', evr_id: '001' };
        fastify.mockDb.query.mockResolvedValueOnce(createMockCursor(evr));

        const response = await fastify.inject({
          method: 'GET',
          url: '/api/v4/dictionaries/flight/versions/1.0/evrs/EVR_A',
        });

        expect(response.statusCode).toBe(200);
      });

      it('returns 404 when EVR not found', async () => {
        fastify.mockDb.query.mockResolvedValueOnce(createMockCursor([]));

        const response = await fastify.inject({
          method: 'GET',
          url: '/api/v4/dictionaries/flight/versions/1.0/evrs/NONEXISTENT',
        });

        expect(response.statusCode).toBe(404);
      });
    });

    describe('PATCH /api/v4/dictionaries/:type/versions/:version/evrs/:evr_name', () => {
      it('updates an EVR', async () => {
        const existing = { _key: 'e1', evr_name: 'EVR_A' };
        fastify.mockDb.query.mockResolvedValueOnce(createMockCursor(existing));

        const evrCollection = fastify.mockDb.collection('evr');
        evrCollection.update.mockResolvedValueOnce({ new: { ...existing, evr_level: 'WARNING' } });

        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/v4/dictionaries/flight/versions/1.0/evrs/EVR_A',
          payload: { evr_level: 'WARNING' },
        });

        expect(response.statusCode).toBe(200);
      });

      it('returns 404 when EVR not found', async () => {
        fastify.mockDb.query.mockResolvedValueOnce(createMockCursor([]));

        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/v4/dictionaries/flight/versions/1.0/evrs/NONEXISTENT',
          payload: { evr_level: 'WARNING' },
        });

        expect(response.statusCode).toBe(404);
      });
    });

    describe('DELETE /api/v4/dictionaries/:type/versions/:version/evrs/:evr_name', () => {
      it('deletes an EVR', async () => {
        const existing = { _key: 'e1', evr_name: 'EVR_A' };
        fastify.mockDb.query.mockResolvedValueOnce(createMockCursor(existing));

        const evrCollection = fastify.mockDb.collection('evr');
        evrCollection.remove.mockResolvedValueOnce(true);

        const response = await fastify.inject({
          method: 'DELETE',
          url: '/api/v4/dictionaries/flight/versions/1.0/evrs/EVR_A',
        });

        expect(response.statusCode).toBe(204);
      });

      it('returns 404 when EVR not found', async () => {
        fastify.mockDb.query.mockResolvedValueOnce(createMockCursor([]));

        const response = await fastify.inject({
          method: 'DELETE',
          url: '/api/v4/dictionaries/flight/versions/1.0/evrs/NONEXISTENT',
        });

        expect(response.statusCode).toBe(404);
      });
    });
  });

  // ====== CHANNELS ======
  describe('Channels', () => {
    describe('POST /api/v4/dictionaries/:type/versions/:version/channels', () => {
      it('creates channels when dictionary exists', async () => {
        const dictDoc = { _key: 'd1', dictionary_type: 'flight', dictionary_version: '1.0' };
        fastify.mockDb.query.mockResolvedValueOnce(createMockCursor(dictDoc));
        fastify.mockDb.query.mockResolvedValueOnce(createMockCursor([]));

        const channelCollection = fastify.mockDb.collection('channel');
        channelCollection.saveAll.mockResolvedValueOnce([
          { new: { _key: 'ch1', channel_id: 'CH001', channel_name: 'TEMP' } },
        ]);

        const response = await fastify.inject({
          method: 'POST',
          url: '/api/v4/dictionaries/flight/versions/1.0/channels',
          payload: [{ channel_id: 'CH001', channel_name: 'TEMP' }],
        });

        expect(response.statusCode).toBe(201);
      });

      it('returns 404 when dictionary does not exist', async () => {
        fastify.mockDb.query.mockResolvedValueOnce(createMockCursor([]));

        const response = await fastify.inject({
          method: 'POST',
          url: '/api/v4/dictionaries/flight/versions/1.0/channels',
          payload: [{ channel_id: 'CH001', channel_name: 'TEMP' }],
        });

        expect(response.statusCode).toBe(404);
      });
    });

    describe('GET /api/v4/dictionaries/:type/versions/:version/channels', () => {
      it('returns list of channels', async () => {
        const channels = [{ channel_name: 'TEMP' }, { channel_name: 'PRESS' }];
        fastify.mockDb.query.mockResolvedValueOnce(createMockCursor(channels));

        const response = await fastify.inject({
          method: 'GET',
          url: '/api/v4/dictionaries/flight/versions/1.0/channels',
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toHaveLength(2);
      });
    });

    describe('GET /api/v4/dictionaries/:type/versions/:version/channels/:channel_name', () => {
      it('returns single channel', async () => {
        const channel = { channel_name: 'TEMP', channel_id: 'CH001' };
        fastify.mockDb.query.mockResolvedValueOnce(createMockCursor(channel));

        const response = await fastify.inject({
          method: 'GET',
          url: '/api/v4/dictionaries/flight/versions/1.0/channels/TEMP',
        });

        expect(response.statusCode).toBe(200);
      });

      it('returns 404 when channel not found', async () => {
        fastify.mockDb.query.mockResolvedValueOnce(createMockCursor([]));

        const response = await fastify.inject({
          method: 'GET',
          url: '/api/v4/dictionaries/flight/versions/1.0/channels/NONEXISTENT',
        });

        expect(response.statusCode).toBe(404);
      });
    });

    describe('PATCH /api/v4/dictionaries/:type/versions/:version/channels/:channel_name', () => {
      it('updates a channel', async () => {
        const existing = { _key: 'ch1', channel_name: 'TEMP' };
        fastify.mockDb.query.mockResolvedValueOnce(createMockCursor(existing));

        const channelCollection = fastify.mockDb.collection('channel');
        channelCollection.update.mockResolvedValueOnce({ new: { ...existing, description: 'Updated' } });

        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/v4/dictionaries/flight/versions/1.0/channels/TEMP',
          payload: { description: 'Updated' },
        });

        expect(response.statusCode).toBe(200);
      });

      it('returns 404 when channel not found', async () => {
        fastify.mockDb.query.mockResolvedValueOnce(createMockCursor([]));

        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/v4/dictionaries/flight/versions/1.0/channels/NONEXISTENT',
          payload: { description: 'Updated' },
        });

        expect(response.statusCode).toBe(404);
      });
    });

    describe('DELETE /api/v4/dictionaries/:type/versions/:version/channels/:channel_name', () => {
      it('deletes a channel', async () => {
        const existing = { _key: 'ch1', channel_name: 'TEMP' };
        fastify.mockDb.query.mockResolvedValueOnce(createMockCursor(existing));

        const channelCollection = fastify.mockDb.collection('channel');
        channelCollection.remove.mockResolvedValueOnce(true);

        const response = await fastify.inject({
          method: 'DELETE',
          url: '/api/v4/dictionaries/flight/versions/1.0/channels/TEMP',
        });

        expect(response.statusCode).toBe(204);
      });

      it('returns 404 when channel not found', async () => {
        fastify.mockDb.query.mockResolvedValueOnce(createMockCursor([]));

        const response = await fastify.inject({
          method: 'DELETE',
          url: '/api/v4/dictionaries/flight/versions/1.0/channels/NONEXISTENT',
        });

        expect(response.statusCode).toBe(404);
      });
    });
  });

  // ====== MIL1553 ======
  describe('MIL-1553', () => {
    describe('POST /api/v4/dictionaries/:type/versions/:version/mil1553', () => {
      it('creates mil1553 variables when dictionary exists', async () => {
        const dictDoc = { _key: 'd1', dictionary_type: 'flight', dictionary_version: '1.0' };
        fastify.mockDb.query.mockResolvedValueOnce(createMockCursor(dictDoc));
        fastify.mockDb.query.mockResolvedValueOnce(createMockCursor([]));

        const milCollection = fastify.mockDb.collection('mil1553');
        milCollection.saveAll.mockResolvedValueOnce([
          { new: { _key: 'm1', mil1553_name: 'BUS_VAR_A' } },
        ]);

        const response = await fastify.inject({
          method: 'POST',
          url: '/api/v4/dictionaries/flight/versions/1.0/mil1553',
          payload: [{ mil1553_name: 'BUS_VAR_A' }],
        });

        expect(response.statusCode).toBe(201);
      });

      it('returns 404 when dictionary does not exist', async () => {
        fastify.mockDb.query.mockResolvedValueOnce(createMockCursor([]));

        const response = await fastify.inject({
          method: 'POST',
          url: '/api/v4/dictionaries/flight/versions/1.0/mil1553',
          payload: [{ mil1553_name: 'BUS_VAR_A' }],
        });

        expect(response.statusCode).toBe(404);
      });
    });

    describe('GET /api/v4/dictionaries/:type/versions/:version/mil1553', () => {
      it('returns list of mil1553 variables', async () => {
        const vars = [{ mil1553_name: 'VAR_A' }, { mil1553_name: 'VAR_B' }];
        fastify.mockDb.query.mockResolvedValueOnce(createMockCursor(vars));

        const response = await fastify.inject({
          method: 'GET',
          url: '/api/v4/dictionaries/flight/versions/1.0/mil1553',
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toHaveLength(2);
      });
    });

    describe('GET /api/v4/dictionaries/:type/versions/:version/mil1553/:mil1553_name', () => {
      it('returns single mil1553 variable', async () => {
        const milVar = { mil1553_name: 'VAR_A' };
        fastify.mockDb.query.mockResolvedValueOnce(createMockCursor(milVar));

        const response = await fastify.inject({
          method: 'GET',
          url: '/api/v4/dictionaries/flight/versions/1.0/mil1553/VAR_A',
        });

        expect(response.statusCode).toBe(200);
      });

      it('returns 404 when mil1553 variable not found', async () => {
        fastify.mockDb.query.mockResolvedValueOnce(createMockCursor([]));

        const response = await fastify.inject({
          method: 'GET',
          url: '/api/v4/dictionaries/flight/versions/1.0/mil1553/NONEXISTENT',
        });

        expect(response.statusCode).toBe(404);
      });
    });

    describe('PATCH /api/v4/dictionaries/:type/versions/:version/mil1553/:mil1553_name', () => {
      it('updates a mil1553 variable', async () => {
        const existing = { _key: 'm1', mil1553_name: 'VAR_A' };
        fastify.mockDb.query.mockResolvedValueOnce(createMockCursor(existing));

        const milCollection = fastify.mockDb.collection('mil1553');
        milCollection.update.mockResolvedValueOnce({ new: { ...existing, description: 'Updated' } });

        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/v4/dictionaries/flight/versions/1.0/mil1553/VAR_A',
          payload: { description: 'Updated' },
        });

        expect(response.statusCode).toBe(200);
      });

      it('returns 404 when mil1553 variable not found', async () => {
        fastify.mockDb.query.mockResolvedValueOnce(createMockCursor([]));

        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/v4/dictionaries/flight/versions/1.0/mil1553/NONEXISTENT',
          payload: { description: 'Updated' },
        });

        expect(response.statusCode).toBe(404);
      });
    });

    describe('DELETE /api/v4/dictionaries/:type/versions/:version/mil1553/:mil1553_name', () => {
      it('deletes a mil1553 variable', async () => {
        const existing = { _key: 'm1', mil1553_name: 'VAR_A' };
        fastify.mockDb.query.mockResolvedValueOnce(createMockCursor(existing));

        const milCollection = fastify.mockDb.collection('mil1553');
        milCollection.remove.mockResolvedValueOnce(true);

        const response = await fastify.inject({
          method: 'DELETE',
          url: '/api/v4/dictionaries/flight/versions/1.0/mil1553/VAR_A',
        });

        expect(response.statusCode).toBe(204);
      });

      it('returns 404 when mil1553 variable not found', async () => {
        fastify.mockDb.query.mockResolvedValueOnce(createMockCursor([]));

        const response = await fastify.inject({
          method: 'DELETE',
          url: '/api/v4/dictionaries/flight/versions/1.0/mil1553/NONEXISTENT',
        });

        expect(response.statusCode).toBe(404);
      });
    });
  });
});
