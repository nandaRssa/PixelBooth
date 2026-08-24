import { Hono } from 'hono'

export const hardwareRouter = new Hono()

// GET /api/hardware/status
hardwareRouter.get('/status', (c) => {
  return c.json({
    data: {
      bridge_online: false,
      camera: 'disconnected',
      camera_model: null,
      bluetooth_connected: false,
    },
  })
})

// POST /api/hardware/capture
hardwareRouter.post('/capture', (c) => {
  return c.json({
    message: 'Hardware capture trigger',
    data: { success: true },
  })
})
