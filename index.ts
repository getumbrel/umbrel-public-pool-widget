// Validate environment variable at startup
if (!process.env.PUBLIC_POOL_API_URL) {
  throw new Error('PUBLIC_POOL_API_URL environment variable is not set')
}

const PUBLIC_POOL_API_URL = process.env.PUBLIC_POOL_API_URL

Bun.serve({
  async fetch(request) {
    // Check if the request is for the correct endpoint
    const url = new URL(request.url)
    if (url.pathname !== '/widgets/pool') {
      return Response.json(
        { error: 'Invalid endpoint. Please use /widgets/pool' },
        { status: 404 }
      )
    }

    try {
      // Get current public pool stats from /api/pool
      const response = await fetch(PUBLIC_POOL_API_URL)
      const {totalHashRate, totalMiners, blocksFound, blockHeight} = await response.json()


      // Format hashrate
      let rate = totalHashRate
      const units = ['H/s', 'KH/s', 'MH/s', 'GH/s', 'TH/s', 'PH/s', 'EH/s']
      let unitIndex = 0
      while (rate >= 1000 && unitIndex < units.length - 1) {
        rate /= 1000
        unitIndex++
      }
      const unit = units[unitIndex]

      // Return widget data
      // umbrelOS expects strings for all fields of four-stats
      return Response.json({
        type: 'four-stats',
        refresh: "5s",
        items: [
          {title: 'Hash Rate', text: rate.toFixed(2), subtext: unit},
          {title: 'Miners', text: totalMiners.toString()},
          {title: 'Blocks Found', text: blocksFound.length.toString()},
          {title: 'Block Height', text: blockHeight.toString()},
        ],
      })

    } catch (error) {
      // Log the full error details for server-side debugging
      console.error('Error handling request:', error)
      
      // Return a formatted response with placeholders, otherwise the widget will show without any titles
      return Response.json({
        type: 'four-stats',
        refresh: "5s",
        items: [
          {title: 'Hash Rate', text: '-'},
          {title: 'Miners', text: '-'},
          {title: 'Blocks Found', text: '-'},
          {title: 'Block Height', text: '-'},
        ],
      })
    }
  },
})