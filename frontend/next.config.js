module.exports = {
  reactStrictMode: true,
  images: { unoptimized: false },
  async rewrites() {
    return [
      { source: '/api/:path*', destination: process.env.API_URL + '/api/:path*' },
      { source: '/uploads/:path*', destination: process.env.API_URL + '/uploads/:path*' }
    ]
  }
}